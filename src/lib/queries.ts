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
  autoSyncEnabled: number; // 0 | 1
  autoSyncInterval: string;
  lastSyncedAt: string;
  photoCount: number;
  createdAt: string;
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
  autoSyncEnabled: Number(r.autoSyncEnabled ?? 0),
  autoSyncInterval: String(r.autoSyncInterval ?? "3m"),
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
  sort: PhotoSort = "default"
): Promise<{ project: ProjectRow; photos: PhotoRow[] } | null> {
  const project = await findProjectById(id);
  if (!project) return null;
  const orderClause = SORT_CLAUSES[sort] || SORT_CLAUSES.default;
  // orderClause is from a fixed whitelist (not user string) — safe to interpolate.
  const r = await db.execute({
    sql: `SELECT * FROM Photo WHERE projectId = ? ORDER BY ${orderClause}`,
    args: [id],
  });
  return {
    project,
    photos: r.rows.map((row) => asPhoto(row as Record<string, unknown>)),
  };
}

export async function createProject(input: NewProjectInput): Promise<ProjectRow> {
  await db.execute({
    sql: `INSERT INTO Project (id, name, description, driveFolderUrl, driveFolderId, displayMode, visibility, password, isHidden, autoSyncEnabled, autoSyncInterval, lastSyncedAt, photoCount, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.autoSyncEnabled ? 1 : 0,
      input.autoSyncInterval,
      "",
      0,
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
    autoSyncEnabled:
      input.autoSyncEnabled !== undefined
        ? input.autoSyncEnabled
          ? 1
          : 0
        : existing.autoSyncEnabled,
    autoSyncInterval: input.autoSyncInterval ?? existing.autoSyncInterval,
    lastSyncedAt: input.lastSyncedAt !== undefined ? input.lastSyncedAt : existing.lastSyncedAt,
  };

  await db.execute({
    sql: `UPDATE Project SET name=?, description=?, driveFolderUrl=?, driveFolderId=?, displayMode=?, visibility=?, password=?, isHidden=?, autoSyncEnabled=?, autoSyncInterval=?, lastSyncedAt=? WHERE id=?`,
    args: [
      merged.name,
      merged.description,
      merged.driveFolderUrl,
      merged.driveFolderId,
      merged.displayMode,
      merged.visibility,
      merged.password,
      merged.isHidden,
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

// ---------- Photos ----------
/**
 * Replaces all photos for a project WITHOUT a "zero photos" window.
 *
 * The old implementation did DELETE-all-then-INSERT. During the gap between
 * DELETE and the chunked INSERTs finishing, concurrent GET requests would
 * see 0 photos — bad UX when thousands of visitors are polling every 15s
 * and auto-sync runs every 30s.
 *
 * New strategy (swap-free, no empty window):
 *  1. UPSERT all new photos (INSERT OR REPLACE) in chunks — old photos that
 *     still exist in the new batch keep their row; new photos are added.
 *     During this phase the gallery shows either old OR new data — never empty.
 *  2. DELETE only the photos that are NOT in the new batch — i.e. photos that
 *     were removed from Google Drive since last sync. This runs AFTER all
 *     upserts complete, so the gallery always has photos during the operation.
 *
 * This makes the sync effectively atomic from the visitor's perspective.
 */
export async function replaceProjectPhotos(
  projectId: string,
  photos: NewPhotoInput[]
): Promise<void> {
  const CHUNK_SIZE = 500;
  // INSERT OR REPLACE so existing rows (same id+projectId) are updated in place
  // instead of failing on PRIMARY KEY conflict.
  const upsertSql = `INSERT OR REPLACE INTO Photo (id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime, projectId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // Step 1: Upsert all new photos in chunks.
  // During this phase, the gallery shows the previous data + newly added photos.
  const newIds = new Set<string>();
  for (let i = 0; i < photos.length; i += CHUNK_SIZE) {
    const chunk = photos.slice(i, i + CHUNK_SIZE);
    const stmts = chunk.map((p) => {
      newIds.add(p.id);
      return {
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
      };
    });
    await db.batch(stmts);
  }

  // Step 2: Delete only photos that are NOT in the new batch.
  // This runs AFTER all upserts, so the gallery never appears empty.
  // We fetch existing IDs first, compute the diff, then delete in chunks.
  const existing = await db.execute({
    sql: "SELECT id FROM Photo WHERE projectId = ?",
    args: [projectId],
  });
  const existingIds = existing.rows.map((r) => String((r as Record<string, unknown>).id));
  const toDelete = existingIds.filter((id) => !newIds.has(id));

  if (toDelete.length > 0) {
    // DELETE in chunks using individual statements (libSQL doesn't support
    // array binding for IN clause; chunk to avoid batch size limits).
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
