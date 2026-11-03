import { db, ensureSchema } from "@/lib/db";

/**
 * Typed data-access layer over the libSQL / Turso client.
 * Every function returns plain JS objects (no Prisma) so the same code
 * runs on Node.js (local dev) and Cloudflare Workers (production).
 */

// ---------- Row types (raw DB shape) ----------
export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  driveFolderUrl: string;
  driveFolderId: string;
  displayMode: string;
  visibility: string; // "public" | "private"
  password: string; // "salt:hash" or "" for public galleries
  isHidden: number; // 0 | 1
  autoFilterEnabled: number; // 0 | 1
  allowVisitorUpload: number; // 0 | 1
  viewCount: number; // visitor page views
  downloadCount: number; // photo downloads
  autoHideDays: number; // 0 = never, >0 = hide after X days
  autoSyncEnabled: number; // 0 | 1
  autoSyncInterval: string;
  needsSync: number; // 0 | 1 — set by Drive webhook, cleared by sync
  lastSyncedAt: string;
  photoCount: number;
  createdAt: string;
}

export interface DriveWatchChannelRow {
  id: string; // channel UUID
  userEmail: string; // admin's email (unique)
  resourceId: string;
  startPageToken: string;
  token: string; // verification token
  expiration: string; // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

export interface NewDriveWatchChannelInput {
  id: string;
  userEmail: string;
  resourceId: string;
  startPageToken: string;
  token: string;
  expiration: string;
}

export interface PhotoRow {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink: string;
  webContentLink: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  aiHidden: number; // 0 | 1
  projectId: string;
}

export interface AccountRow {
  id: string;
  email: string;
  role: string;
  displayName: string;
  addedAt: string;
}

// ---------- Input types ----------
export interface NewProjectInput {
  id: string;
  name: string;
  description: string;
  driveFolderUrl: string;
  driveFolderId: string;
  displayMode: "all" | "search";
  visibility: "public" | "private";
  password: string; // pre-hashed "salt:hash" or "" for public
  isHidden: boolean;
  autoFilterEnabled: boolean;
  allowVisitorUpload: boolean;
  autoHideDays: number;
  autoSyncEnabled: boolean;
  autoSyncInterval: string;
  createdAt: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  driveFolderUrl?: string;
  driveFolderId?: string;
  displayMode?: "all" | "search";
  visibility?: "public" | "private";
  password?: string; // pre-hashed "salt:hash" or "" to clear
  isHidden?: boolean;
  autoFilterEnabled?: boolean;
  allowVisitorUpload?: boolean;
  autoHideDays?: number;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: string;
  lastSyncedAt?: string;
}

export interface NewPhotoInput {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink: string;
  webContentLink: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
}

export interface NewAccountInput {
  id: string;
  email: string;
  role: "admin" | "manager";
  displayName: string;
  addedAt: string;
}

// ---------- Mappers ----------
const bool = (v: unknown) => v === 1 || v === true;
const asProject = (r: Record<string, unknown>): ProjectRow => ({
  id: String(r.id),
  name: String(r.name),
  description: String(r.description ?? ""),
  driveFolderUrl: String(r.driveFolderUrl ?? ""),
  driveFolderId: String(r.driveFolderId ?? ""),
  displayMode: String(r.displayMode ?? "all"),
  visibility: String(r.visibility ?? "public"),
  password: String(r.password ?? ""),
  isHidden: Number(r.isHidden ?? 0),
  autoFilterEnabled: Number(r.autoFilterEnabled ?? 0),
  allowVisitorUpload: Number(r.allowVisitorUpload ?? 0),
  viewCount: Number(r.viewCount ?? 0),
  downloadCount: Number(r.downloadCount ?? 0),
  autoHideDays: Number(r.autoHideDays ?? 0),
  autoSyncEnabled: Number(r.autoSyncEnabled ?? 0),
  autoSyncInterval: String(r.autoSyncInterval ?? "5m"),
  needsSync: Number(r.needsSync ?? 0),
  lastSyncedAt: String(r.lastSyncedAt ?? ""),
  photoCount: Number(r.photoCount ?? 0),
  createdAt: String(r.createdAt ?? ""),
});
const asPhoto = (r: Record<string, unknown>): PhotoRow => ({
  id: String(r.id),
  name: String(r.name),
  mimeType: String(r.mimeType ?? ""),
  thumbnailLink: String(r.thumbnailLink ?? ""),
  webContentLink: String(r.webContentLink ?? ""),
  size: String(r.size ?? ""),
  createdTime: String(r.createdTime ?? ""),
  modifiedTime: String(r.modifiedTime ?? ""),
  aiHidden: Number(r.aiHidden ?? 0),
  projectId: String(r.projectId ?? ""),
});
const asAccount = (r: Record<string, unknown>): AccountRow => ({
  id: String(r.id),
  email: String(r.email),
  role: String(r.role ?? "manager"),
  displayName: String(r.displayName ?? ""),
  addedAt: String(r.addedAt ?? ""),
});

// ---------- Projects ----------
export async function countProjects(): Promise<number> {
  const r = await db.execute("SELECT COUNT(*) AS c FROM Project");
  return Number((r.rows[0] as Record<string, unknown>)?.c ?? 0);
}

export async function getAllProjectSummaries(): Promise<ProjectRow[]> {
  // Admin view — returns ALL projects including hidden ones.
  // photoCount is stored on the Project row itself (kept in sync by sync route),
  // so a single SELECT is enough — no JOIN needed.
  const r = await db.execute("SELECT * FROM Project ORDER BY createdAt ASC");
  return r.rows.map((row) => asProject(row as Record<string, unknown>));
}

export async function getVisibleProjectSummaries(): Promise<ProjectRow[]> {
  // Public home page — excludes hidden galleries.
  const r = await db.execute(
    "SELECT * FROM Project WHERE isHidden = 0 ORDER BY createdAt ASC"
  );
  return r.rows.map((row) => asProject(row as Record<string, unknown>));
}

export async function findProjectById(id: string): Promise<ProjectRow | null> {
  const r = await db.execute({ sql: "SELECT * FROM Project WHERE id = ?", args: [id] });
  if (r.rows.length === 0) return null;
  return asProject(r.rows[0] as Record<string, unknown>);
}

/**
 * Finds a project that uses the given Google Drive folder ID (excluding the
 * given project id). Used to detect duplicate folder assignments across
 * galleries — usually a setup mistake by the admin.
 */
export async function findProjectByFolderId(
  folderId: string,
  excludeProjectId?: string
): Promise<ProjectRow | null> {
  const sql = excludeProjectId
    ? "SELECT * FROM Project WHERE driveFolderId = ? AND id != ? LIMIT 1"
    : "SELECT * FROM Project WHERE driveFolderId = ? LIMIT 1";
  const args = excludeProjectId ? [folderId, excludeProjectId] : [folderId];
  const r = await db.execute({ sql, args });
  if (r.rows.length === 0) return null;
  return asProject(r.rows[0] as Record<string, unknown>);
}

/**
 * Sort order for photos within a gallery.
 *  - "name-asc"  : A → Z (by file name)
 *  - "name-desc" : Z → A (by file name)
 *  - "modified-desc" : newest modified first (Date Modified, descending)
 *  - "modified-asc"  : oldest modified first (Date Modified, ascending)
 *  - "default"   : insertion order (by createdTime ASC)
 */
export type PhotoSort = "default" | "name-asc" | "name-desc" | "modified-desc" | "modified-asc";

const SORT_CLAUSES: Record<PhotoSort, string> = {
  default: "createdTime ASC",
  "name-asc": "name COLLATE NOCASE ASC",
  "name-desc": "name COLLATE NOCASE DESC",
  // Fall back to createdTime when modifiedTime is empty (legacy data pre-migration).
  "modified-desc": "COALESCE(NULLIF(modifiedTime, ''), createdTime) DESC",
  "modified-asc": "COALESCE(NULLIF(modifiedTime, ''), createdTime) ASC",
};

export async function getProjectWithPhotos(
  id: string,
  sort: PhotoSort = "default",
  includeAiHidden: boolean = false
): Promise<{ project: ProjectRow; photos: PhotoRow[] } | null> {
  const project = await findProjectById(id);
  if (!project) return null;
  const orderClause = SORT_CLAUSES[sort] || SORT_CLAUSES.default;
  const whereClause = includeAiHidden
    ? "WHERE projectId = ?"
    : "WHERE projectId = ? AND aiHidden = 0";
  const r = await db.execute({
    sql: `SELECT * FROM Photo ${whereClause} ORDER BY ${orderClause}`,
    args: [id],
  });
  return {
    project,
    photos: r.rows.map((row) => asPhoto(row as Record<string, unknown>)),
  };
}

/** Set aiHidden flag for a specific photo (used by AI filter). */
export async function setPhotoAiHidden(
  projectId: string,
  photoId: string,
  aiHidden: boolean
): Promise<void> {
  await db.execute({
    sql: "UPDATE Photo SET aiHidden = ? WHERE projectId = ? AND id = ?",
    args: [aiHidden ? 1 : 0, projectId, photoId],
  });
}

/** Reset all aiHidden flags for a project (undo AI filter). */
export async function resetAiHidden(projectId: string): Promise<number> {
  await db.execute({
    sql: "UPDATE Photo SET aiHidden = 0 WHERE projectId = ?",
    args: [projectId],
  });
  const r = await db.execute({
    sql: "SELECT COUNT(*) as c FROM Photo WHERE projectId = ? AND aiHidden = 0",
    args: [projectId],
  });
  return Number((r.rows[0] as Record<string, unknown>)?.c ?? 0);
}

export async function createProject(input: NewProjectInput): Promise<ProjectRow> {
  await db.execute({
    sql: `INSERT INTO Project (id, name, description, driveFolderUrl, driveFolderId, displayMode, visibility, password, isHidden, autoFilterEnabled, allowVisitorUpload, autoHideDays, autoSyncEnabled, autoSyncInterval, lastSyncedAt, photoCount, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?)`,
    args: [
      input.id,
      input.name,
      input.description,
      input.driveFolderUrl,
      input.driveFolderId,
      input.displayMode,
      input.visibility,
      input.password,
      input.isHidden ? 1 : 0,
      input.autoFilterEnabled ? 1 : 0,
      input.allowVisitorUpload ? 1 : 0,
      input.autoHideDays ?? 0,
      input.autoSyncEnabled ? 1 : 0,
      input.autoSyncInterval,
      input.createdAt,
    ],
  });
  return findProjectById(input.id) as Promise<ProjectRow>;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput
): Promise<ProjectRow | null> {
  const existing = await findProjectById(id);
  if (!existing) return null;

  const merged: ProjectRow = {
    ...existing,
    name: input.name ?? existing.name,
    description: input.description !== undefined ? input.description : existing.description,
    driveFolderUrl: input.driveFolderUrl ?? existing.driveFolderUrl,
    driveFolderId: input.driveFolderId ?? existing.driveFolderId,
    displayMode: input.displayMode ?? existing.displayMode,
    visibility: input.visibility ?? existing.visibility,
    password: input.password !== undefined ? input.password : existing.password,
    isHidden:
      input.isHidden !== undefined
        ? input.isHidden
          ? 1
          : 0
        : existing.isHidden,
    autoFilterEnabled:
      input.autoFilterEnabled !== undefined
        ? input.autoFilterEnabled
          ? 1
          : 0
        : existing.autoFilterEnabled,
    allowVisitorUpload:
      input.allowVisitorUpload !== undefined
        ? input.allowVisitorUpload
          ? 1
          : 0
        : existing.allowVisitorUpload,
    autoSyncEnabled:
      input.autoSyncEnabled !== undefined
        ? input.autoSyncEnabled
          ? 1
          : 0
        : existing.autoSyncEnabled,
    autoHideDays:
      input.autoHideDays !== undefined
        ? input.autoHideDays
        : existing.autoHideDays,
    autoSyncInterval: input.autoSyncInterval ?? existing.autoSyncInterval,
    lastSyncedAt: input.lastSyncedAt !== undefined ? input.lastSyncedAt : existing.lastSyncedAt,
  };

  await db.execute({
    sql: `UPDATE Project SET name=?, description=?, driveFolderUrl=?, driveFolderId=?, displayMode=?, visibility=?, password=?, isHidden=?, autoFilterEnabled=?, allowVisitorUpload=?, autoHideDays=?, autoSyncEnabled=?, autoSyncInterval=?, lastSyncedAt=? WHERE id=?`,
    args: [
      merged.name,
      merged.description,
      merged.driveFolderUrl,
      merged.driveFolderId,
      merged.displayMode,
      merged.visibility,
      merged.password,
      merged.isHidden,
      merged.autoFilterEnabled,
      merged.allowVisitorUpload,
      merged.autoHideDays,
      merged.autoSyncEnabled,
      merged.autoSyncInterval,
      merged.lastSyncedAt,
      id,
    ],
  });
  return merged;
}

export async function deleteProject(id: string): Promise<boolean> {
  // ON DELETE CASCADE drops photos, but run an explicit delete to be safe across runtimes.
  await db.batch([
    { sql: "DELETE FROM Photo WHERE projectId = ?", args: [id] },
    { sql: "DELETE FROM Project WHERE id = ?", args: [id] },
  ]);
  const r = await db.execute({ sql: "SELECT id FROM Project WHERE id = ?", args: [id] });
  return r.rows.length === 0;
}

export async function updateProjectSync(
  id: string,
  photoCount: number,
  lastSyncedAt: string
): Promise<void> {
  await db.execute({
    sql: "UPDATE Project SET photoCount = ?, lastSyncedAt = ? WHERE id = ?",
    args: [photoCount, lastSyncedAt, id],
  });
}

/**
 * View counter — writes IMMEDIATELY (not batched).
 * Batching caused views to be lost because Worker isolates die before
 * the 30s flush timer fires. Direct write is simpler and reliable.
 * 1 write per visitor page view = ~500 writes/day = 0.5% of 100K limit. Safe.
 */
export async function incrementProjectViews(id: string): Promise<void> {
  try {
    await db.execute({
      sql: "UPDATE Project SET viewCount = viewCount + 1 WHERE id = ?",
      args: [id],
    });
  } catch {
    // D1 writes blocked (quota) — fail silently, view not counted
  }
}

/**
 * Download counter — writes IMMEDIATELY.
 */
export async function incrementProjectDownloads(
  id: string,
  count: number = 1
): Promise<void> {
  if (count <= 0) return;
  try {
    await db.execute({
      sql: "UPDATE Project SET downloadCount = downloadCount + ? WHERE id = ?",
      args: [count, id],
    });
  } catch {
    // D1 writes blocked — fail silently
  }
}

// ---------- Photos ----------
/**
 * Sync delta: how many photos were actually written to D1.
 *
 * `upserted` counts only NEW or CHANGED photos that were written.
 * `unchanged` counts photos whose data matched exactly — these are NOT
 * written, which is what makes this function safe to call on every manual
 * sync without blowing through the D1 100K writes/day free-tier limit.
 */
export interface SyncDelta {
  upserted: number;
  deleted: number;
  unchanged: number;
}

/**
 * Replaces all photos for a project with a TRUE delta — only writes rows that
 * are genuinely new or changed, and only deletes rows that are gone.
 *
 * Previous implementation ran `INSERT OR REPLACE` on EVERY photo every sync,
 * which counts as a D1 row write even when the data is byte-identical. With
 * auto-sync running every 3 minutes across many galleries, this single
 * function blew through the 100K writes/day D1 free-tier limit.
 *
 * New strategy (write-minimal):
 *  1. SELECT existing photos (id + comparable fields) for the project.
 *  2. Partition the incoming batch into:
 *       - toUpsert  : ids not present in DB, OR present but a field changed → write
 *       - unchanged : ids present, all fields match → SKIP (0 writes)
 *  3. DELETE only ids that exist in DB but not in the new batch (write).
 *
 * Net effect: a sync where the Drive folder hasn't changed = 0 D1 writes.
 * The gallery also never appears empty, because deletions run AFTER upserts.
 */
export async function replaceProjectPhotos(
  projectId: string,
  photos: NewPhotoInput[]
): Promise<SyncDelta> {
  const CHUNK_SIZE = 500;

  // Fetch existing photos for this project to compute a true delta.
  // We compare on all user-visible fields EXCEPT aiHidden (that's an
  // admin-set flag, preserved across syncs — never overwritten by sync).
  const existing = await db.execute({
    sql: "SELECT id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime FROM Photo WHERE projectId = ?",
    args: [projectId],
  });
  const existingMap = new Map<
    string,
    {
      name: string;
      mimeType: string;
      thumbnailLink: string;
      webContentLink: string;
      size: string;
      createdTime: string;
      modifiedTime: string;
    }
  >();
  for (const row of existing.rows) {
    const r = row as Record<string, unknown>;
    existingMap.set(String(r.id), {
      name: String(r.name ?? ""),
      mimeType: String(r.mimeType ?? ""),
      thumbnailLink: String(r.thumbnailLink ?? ""),
      webContentLink: String(r.webContentLink ?? ""),
      size: String(r.size ?? ""),
      createdTime: String(r.createdTime ?? ""),
      modifiedTime: String(r.modifiedTime ?? ""),
    });
  }

  const newIds = new Set<string>();
  const toUpsert: NewPhotoInput[] = []; // new + changed
  let unchanged = 0;

  for (const p of photos) {
    newIds.add(p.id);
    const ex = existingMap.get(p.id);
    if (!ex) {
      toUpsert.push(p);
    } else if (
      ex.name !== p.name ||
      ex.mimeType !== p.mimeType ||
      ex.thumbnailLink !== p.thumbnailLink ||
      ex.webContentLink !== p.webContentLink ||
      ex.size !== p.size ||
      ex.createdTime !== p.createdTime ||
      ex.modifiedTime !== p.modifiedTime
    ) {
      toUpsert.push(p);
    } else {
      unchanged++;
    }
  }

  const toDelete = [...existingMap.keys()].filter((id) => !newIds.has(id));

  // Step 1: Upsert only new + changed photos.
  if (toUpsert.length > 0) {
    const upsertSql = `INSERT OR REPLACE INTO Photo (id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime, projectId)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
      const chunk = toUpsert.slice(i, i + CHUNK_SIZE);
      const stmts = chunk.map((p) => ({
        sql: upsertSql,
        args: [
          p.id,
          p.name,
          p.mimeType,
          p.thumbnailLink,
          p.webContentLink,
          p.size,
          p.createdTime,
          p.modifiedTime,
          projectId,
        ],
      }));
      await db.batch(stmts);
    }
  }

  // Step 2: Delete only photos that are NOT in the new batch.
  // Runs AFTER upserts, so the gallery never appears empty.
  if (toDelete.length > 0) {
    const deleteSql = "DELETE FROM Photo WHERE projectId = ? AND id = ?";
    for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
      const chunk = toDelete.slice(i, i + CHUNK_SIZE);
      const stmts = chunk.map((photoId) => ({
        sql: deleteSql,
        args: [projectId, photoId],
      }));
      await db.batch(stmts);
    }
  }

  return {
    upserted: toUpsert.length,
    deleted: toDelete.length,
    unchanged,
  };
}

/**
 * Finds the first photo with the given id across all projects.
 * Used by the photo-proxy routes — sample photos share ids between demo galleries,
 * so we just need any match.
 */
export async function findPhotoById(id: string): Promise<PhotoRow | null> {
  const r = await db.execute({ sql: "SELECT * FROM Photo WHERE id = ? LIMIT 1", args: [id] });
  if (r.rows.length === 0) return null;
  return asPhoto(r.rows[0] as Record<string, unknown>);
}

export async function addProjectPhotos(
  projectId: string,
  photos: NewPhotoInput[]
): Promise<void> {
  if (photos.length === 0) return;
  const insertSql = `INSERT INTO Photo (id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime, projectId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const CHUNK_SIZE = 500;

  for (let i = 0; i < photos.length; i += CHUNK_SIZE) {
    const chunk = photos.slice(i, i + CHUNK_SIZE);
    const stmts = chunk.map((p) => ({
      sql: insertSql,
      args: [
        p.id,
        p.name,
        p.mimeType,
        p.thumbnailLink,
        p.webContentLink,
        p.size,
        p.createdTime,
        p.modifiedTime,
        projectId,
      ],
    }));
    await db.batch(stmts);
  }
}

// ---------- Project Folders (additional Drive folders per gallery) ----------
export interface ProjectFolderRow {
  id: string;
  projectId: string;
  driveFolderUrl: string;
  driveFolderId: string;
  label: string;
  addedBy: string;
  addedAt: string;
}

export interface NewProjectFolderInput {
  id: string;
  projectId: string;
  driveFolderUrl: string;
  driveFolderId: string;
  label: string;
  addedBy: string;
  addedAt: string;
}

const asProjectFolder = (r: Record<string, unknown>): ProjectFolderRow => ({
  id: String(r.id),
  projectId: String(r.projectId),
  driveFolderUrl: String(r.driveFolderUrl ?? ""),
  driveFolderId: String(r.driveFolderId ?? ""),
  label: String(r.label ?? ""),
  addedBy: String(r.addedBy ?? ""),
  addedAt: String(r.addedAt ?? ""),
});

/** Returns all additional Drive folders linked to a gallery (excluding the primary). */
export async function getProjectFolders(projectId: string): Promise<ProjectFolderRow[]> {
  const r = await db.execute({
    sql: "SELECT * FROM ProjectFolder WHERE projectId = ? ORDER BY addedAt ASC",
    args: [projectId],
  });
  return r.rows.map((row) => asProjectFolder(row as Record<string, unknown>));
}

export async function addProjectFolder(input: NewProjectFolderInput): Promise<ProjectFolderRow> {
  await db.execute({
    sql: `INSERT INTO ProjectFolder (id, projectId, driveFolderUrl, driveFolderId, label, addedBy, addedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.projectId,
      input.driveFolderUrl,
      input.driveFolderId,
      input.label,
      input.addedBy,
      input.addedAt,
    ],
  });
  const r = await db.execute({
    sql: "SELECT * FROM ProjectFolder WHERE id = ? LIMIT 1",
    args: [input.id],
  });
  return asProjectFolder(r.rows[0] as Record<string, unknown>);
}

export async function deleteProjectFolder(projectId: string, folderId: string): Promise<boolean> {
  await db.execute({
    sql: "DELETE FROM ProjectFolder WHERE projectId = ? AND id = ?",
    args: [projectId, folderId],
  });
  const r = await db.execute({
    sql: "SELECT id FROM ProjectFolder WHERE projectId = ? AND id = ?",
    args: [projectId, folderId],
  });
  return r.rows.length === 0;
}

/** Checks if a Drive folder is already linked (primary or additional) to a project. */
export async function findProjectFolderByDriveId(
  projectId: string,
  driveFolderId: string
): Promise<{ source: "primary" | "additional"; folder?: ProjectFolderRow } | null> {
  // Check additional folders first
  const r = await db.execute({
    sql: "SELECT * FROM ProjectFolder WHERE projectId = ? AND driveFolderId = ? LIMIT 1",
    args: [projectId, driveFolderId],
  });
  if (r.rows.length > 0) {
    return { source: "additional", folder: asProjectFolder(r.rows[0] as Record<string, unknown>) };
  }
  // Check primary folder
  const p = await findProjectById(projectId);
  if (p && p.driveFolderId === driveFolderId) {
    return { source: "primary" };
  }
  return null;
}

// ---------- Pending Uploads (visitor uploads awaiting admin review) ----------
export interface PendingUploadRow {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  base64Data: string;
  size: number;
  uploaderIp: string;
  createdAt: string;
}

export interface NewPendingUploadInput {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  base64Data: string;
  size: number;
  uploaderIp: string;
  createdAt: string;
}

const asPendingUpload = (r: Record<string, unknown>): PendingUploadRow => ({
  id: String(r.id),
  projectId: String(r.projectId),
  fileName: String(r.fileName),
  mimeType: String(r.mimeType ?? "image/jpeg"),
  base64Data: String(r.base64Data ?? ""),
  size: Number(r.size ?? 0),
  uploaderIp: String(r.uploaderIp ?? ""),
  createdAt: String(r.createdAt ?? ""),
});

export async function addPendingUpload(input: NewPendingUploadInput): Promise<void> {
  await db.execute({
    sql: `INSERT INTO PendingUpload (id, projectId, fileName, mimeType, base64Data, size, uploaderIp, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.projectId,
      input.fileName,
      input.mimeType,
      input.base64Data,
      input.size,
      input.uploaderIp,
      input.createdAt,
    ],
  });
}

/** List pending uploads for a gallery (without the heavy base64 payload). */
export async function getPendingUploads(
  projectId: string
): Promise<Omit<PendingUploadRow, "base64Data">[]> {
  const r = await db.execute({
    sql: "SELECT id, projectId, fileName, mimeType, size, uploaderIp, createdAt FROM PendingUpload WHERE projectId = ? ORDER BY createdAt ASC",
    args: [projectId],
  });
  return r.rows.map((row) => {
    const full = asPendingUpload(row as Record<string, unknown>);
    const { base64Data, ...rest } = full;
    return rest;
  });
}

export async function countPendingUploads(projectId: string): Promise<number> {
  const r = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM PendingUpload WHERE projectId = ?",
    args: [projectId],
  });
  return Number((r.rows[0] as Record<string, unknown>)?.c ?? 0);
}

/** Counts pending uploads for ALL galleries — returns a map of projectId → count. */
export async function countAllPendingUploads(): Promise<Map<string, number>> {
  const r = await db.execute(
    "SELECT projectId, COUNT(*) AS c FROM PendingUpload GROUP BY projectId"
  );
  const map = new Map<string, number>();
  for (const row of r.rows) {
    const rec = row as Record<string, unknown>;
    map.set(String(rec.projectId), Number(rec.c ?? 0));
  }
  return map;
}

/** List ALL pending uploads across all galleries (admin view, no base64). */
export async function getAllPendingUploads(): Promise<
  (Omit<PendingUploadRow, "base64Data">)[]
> {
  const r = await db.execute({
    sql: "SELECT id, projectId, fileName, mimeType, size, uploaderIp, createdAt FROM PendingUpload ORDER BY createdAt DESC",
  });
  return r.rows.map((row) => {
    const full = asPendingUpload(row as Record<string, unknown>);
    const { base64Data, ...rest } = full;
    return rest;
  });
}

export async function findPendingUpload(id: string): Promise<PendingUploadRow | null> {
  const r = await db.execute({
    sql: "SELECT * FROM PendingUpload WHERE id = ? LIMIT 1",
    args: [id],
  });
  if (r.rows.length === 0) return null;
  return asPendingUpload(r.rows[0] as Record<string, unknown>);
}

export async function deletePendingUpload(id: string): Promise<boolean> {
  await db.execute({ sql: "DELETE FROM PendingUpload WHERE id = ?", args: [id] });
  const r = await db.execute({ sql: "SELECT id FROM PendingUpload WHERE id = ?", args: [id] });
  return r.rows.length === 0;
}

export async function deletePendingUploadsForProject(projectId: string): Promise<number> {
  const r = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM PendingUpload WHERE projectId = ?",
    args: [projectId],
  });
  const count = Number((r.rows[0] as Record<string, unknown>)?.c ?? 0);
  if (count > 0) {
    await db.execute({ sql: "DELETE FROM PendingUpload WHERE projectId = ?", args: [projectId] });
  }
  return count;
}

// ---------- Accounts ----------
export async function countAccounts(): Promise<number> {
  const r = await db.execute("SELECT COUNT(*) AS c FROM Account");
  return Number((r.rows[0] as Record<string, unknown>)?.c ?? 0);
}

export async function getAllAccounts(): Promise<AccountRow[]> {
  const r = await db.execute("SELECT * FROM Account ORDER BY addedAt ASC");
  return r.rows.map((row) => asAccount(row as Record<string, unknown>));
}

export async function findAccountByEmail(email: string): Promise<AccountRow | null> {
  const r = await db.execute({
    sql: "SELECT * FROM Account WHERE lower(email) = ?",
    args: [email.toLowerCase()],
  });
  if (r.rows.length === 0) return null;
  return asAccount(r.rows[0] as Record<string, unknown>);
}

export async function findAccountById(id: string): Promise<AccountRow | null> {
  const r = await db.execute({ sql: "SELECT * FROM Account WHERE id = ?", args: [id] });
  if (r.rows.length === 0) return null;
  return asAccount(r.rows[0] as Record<string, unknown>);
}

export async function createAccount(input: NewAccountInput): Promise<AccountRow> {
  await db.execute({
    sql: `INSERT INTO Account (id, email, role, displayName, addedAt)
          VALUES (?, ?, ?, ?, ?)`,
    args: [input.id, input.email, input.role, input.displayName, input.addedAt],
  });
  return findAccountById(input.id) as Promise<AccountRow>;
}

export async function deleteAccount(id: string): Promise<boolean> {
  await db.execute({ sql: "DELETE FROM Account WHERE id = ?", args: [id] });
  const r = await db.execute({ sql: "SELECT id FROM Account WHERE id = ?", args: [id] });
  return r.rows.length === 0;
}

export async function createAccounts(accounts: NewAccountInput[]): Promise<void> {
  if (accounts.length === 0) return;
  const stmts = accounts.map((a) => ({
    sql: `INSERT INTO Account (id, email, role, displayName, addedAt) VALUES (?, ?, ?, ?, ?)`,
    args: [a.id, a.email, a.role, a.displayName, a.addedAt],
  }));
  await db.batch(stmts);
}

// Convenience export for routes that need the boolean coercion helper.
export const toBool = bool;

// ---------- Settings (global app-wide key-value store) ----------
export async function getSetting(key: string): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [key],
  });
  if (r.rows.length === 0) return null;
  return String((r.rows[0] as Record<string, unknown>).value);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    args: [key, value, new Date().toISOString()],
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM Setting WHERE key = ?",
    args: [key],
  });
}

// ---------- Maintenance Mode ----------
//
// Stored as two Setting rows: maintenance_enabled (0/1) and maintenance_message
// (text shown to visitors). When enabled, non-admin visitors see a
// maintenance notice screen instead of the normal UI. Admins always bypass.

const MAINT_ENABLED_KEY = "maintenance_enabled";
const MAINT_MESSAGE_KEY = "maintenance_message";

export interface MaintenanceConfig {
  enabled: boolean;
  message: string;
}

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const enabledRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [MAINT_ENABLED_KEY],
  });
  const messageRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [MAINT_MESSAGE_KEY],
  });
  const enabled =
    enabledRes.rows.length > 0 &&
    String((enabledRes.rows[0] as Record<string, unknown>).value) === "1";
  const message =
    messageRes.rows.length > 0
      ? String((messageRes.rows[0] as Record<string, unknown>).value)
      : "";
  return { enabled, message };
}

export async function setMaintenanceConfig(
  enabled: boolean,
  message: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [MAINT_ENABLED_KEY, enabled ? "1" : "0", now],
    },
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [MAINT_MESSAGE_KEY, message || "", now],
    },
  ]);
}

// ---------- Camera Global Config (stored as a single JSON Setting) ----------
export interface CameraConfig {
  filter: string;
  aspectRatio: string;
  resolution: string;
  countdown: number;
  mirror: boolean;
  facing: "environment" | "user";
  maxPhotos: number;
}

const CAMERA_CONFIG_KEY = "camera_config_global";
const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  filter: "original",
  aspectRatio: "4:3",
  resolution: "1920x1080",
  countdown: 3,
  mirror: true,
  facing: "environment",
  maxPhotos: 5,
};

export async function getCameraConfig(): Promise<CameraConfig> {
  const json = await getSetting(CAMERA_CONFIG_KEY);
  if (!json) return DEFAULT_CAMERA_CONFIG;
  try {
    const parsed = JSON.parse(json);
    return { ...DEFAULT_CAMERA_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CAMERA_CONFIG;
  }
}

export async function setCameraConfig(config: CameraConfig): Promise<void> {
  await setSetting(
    CAMERA_CONFIG_KEY,
    JSON.stringify({
      filter: config.filter || "original",
      aspectRatio: config.aspectRatio || "4:3",
      resolution: config.resolution || "1920x1080",
      countdown: typeof config.countdown === "number" ? config.countdown : 3,
      mirror: !!config.mirror,
      facing: config.facing === "user" ? "user" : "environment",
      maxPhotos: typeof config.maxPhotos === "number" && config.maxPhotos > 0 ? Math.min(config.maxPhotos, 20) : 5,
    })
  );
}

// ---------- Drive Push Notifications (watch channels) ----------
//
// Google Drive Push Notifications work as follows:
//   1. Admin registers a watch channel via POST /api/drive-watch
//      → calls Google's changes/watch endpoint with their OAuth token
//      → Google sends a "sync" confirmation to our webhook immediately
//   2. When ANY file in the admin's Drive changes, Google POSTs to our
//      /api/drive-webhook endpoint with headers (no body).
//   3. We verify the X-Goog-Channel-Token header matches the stored token,
//      then mark needsSync=1 on all of that admin's auto-sync galleries.
//   4. The admin's browser scheduler checks needsSync every 60s; if set,
//      it triggers an immediate delta-sync (0 writes if nothing actually
//      changed in the watched galleries — true delta).
//
// Channels expire after max 24h. The admin's browser auto-renews channels
// expiring within 2 hours on each page load.

export async function getWatchChannel(
  userEmail: string
): Promise<DriveWatchChannelRow | null> {
  const r = await db.execute({
    sql: "SELECT * FROM DriveWatchChannel WHERE userEmail = ? LIMIT 1",
    args: [userEmail],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    userEmail: String(row.userEmail),
    resourceId: String(row.resourceId ?? ""),
    startPageToken: String(row.startPageToken ?? ""),
    token: String(row.token ?? ""),
    expiration: String(row.expiration ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

export async function upsertWatchChannel(
  input: NewDriveWatchChannelInput
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO DriveWatchChannel (id, userEmail, resourceId, startPageToken, token, expiration, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(userEmail) DO UPDATE SET
            resourceId = excluded.resourceId,
            startPageToken = excluded.startPageToken,
            token = excluded.token,
            expiration = excluded.expiration,
            updatedAt = excluded.updatedAt`,
    args: [
      input.id,
      input.userEmail,
      input.resourceId,
      input.startPageToken,
      input.token,
      input.expiration,
      now,
      now,
    ],
  });
}

export async function deleteWatchChannel(userEmail: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM DriveWatchChannel WHERE userEmail = ?",
    args: [userEmail],
  });
}

/**
 * Finds a watch channel by its channel ID (used by the webhook receiver,
 * which only has the X-Goog-Channel-ID header, not the userEmail).
 */
export async function findWatchChannelById(
  channelId: string
): Promise<{ userEmail: string; token: string } | null> {
  const r = await db.execute({
    sql: "SELECT userEmail, token FROM DriveWatchChannel WHERE id = ? LIMIT 1",
    args: [channelId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    userEmail: String(row.userEmail),
    token: String(row.token ?? ""),
  };
}

// ---------- needsSync flag (set by webhook, cleared by sync) ----------

/**
 * Marks a single project as needing sync (called by Drive webhook).
 * Uses UPDATE ... WHERE to affect exactly one row — minimal write.
 */
export async function markProjectNeedsSync(projectId: string): Promise<void> {
  await db.execute({
    sql: "UPDATE Project SET needsSync = 1 WHERE id = ?",
    args: [projectId],
  });
}

/**
 * Marks ALL auto-sync-enabled galleries as needing sync.
 * Called by the Drive webhook when ANY file in the admin's Drive changes —
 * we don't know which gallery, so we mark all. The true-delta sync means
 * galleries with no actual changes cost 0 writes.
 */
export async function markAllAutoSyncProjectsNeedSync(): Promise<number> {
  const r = await db.execute({
    sql: "UPDATE Project SET needsSync = 1 WHERE autoSyncEnabled = 1",
  });
  return r.rowsAffected;
}

/**
 * Clears the needsSync flag after a sync completes.
 */
export async function clearNeedsSync(projectId: string): Promise<void> {
  await db.execute({
    sql: "UPDATE Project SET needsSync = 0 WHERE id = ?",
    args: [projectId],
  });
}

/**
 * Returns the list of auto-sync-enabled galleries that currently have
 * needsSync=1. The admin's browser scheduler calls this every 60s to detect
 * webhook notifications without polling Google Drive directly.
 */
export async function getProjectsNeedingSync(): Promise<string[]> {
  const r = await db.execute({
    sql: "SELECT id FROM Project WHERE autoSyncEnabled = 1 AND needsSync = 1",
  });
  return r.rows.map((row) => String((row as Record<string, unknown>).id));
}
