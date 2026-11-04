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
  visitorData: string; // base64 data URL for visitor-uploaded photos (empty for Drive photos)
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
  visitorData?: string; // base64 data URL for visitor-uploaded photos (optional)
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
  visitorData: String(r.visitorData ?? ""),
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
 * BATCHED counters for view + download — critical for high-traffic events.
 *
 * Old approach: 1 write per view/download = 87K writes/day at 20K visitors.
 * That blew past the 100K/day D1 free-tier limit during wisuda.
 *
 * New approach: buffer increments in globalThis (per-isolate), flush every 30s
 * OR when buffer reaches 50 entries. This reduces writes by ~80% even with
 * isolate fragmentation (popular galleries concentrate on same isolates).
 *
 * Trade-off: counters may lag by ~30s, and isolate death before flush loses
 * up to 30s of counts. Acceptable — counters are analytics, not critical.
 * If D1 write fails (quota), buffer keeps accumulating until next flush.
 *
 * Estimated savings at wisuda (25K visitors, 125K downloads):
 *   Before: 87K writes/day (view 25K + download 62K)
 *   After:  ~12K writes/day (flushes × galleries)
 *   = 88% reduction = safely within 100K/day free-tier limit
 */

// In-memory buffer shared across all requests in this Worker isolate.
// Each entry = { projectId: pendingViewCount, pendingDownloadCount }.
interface CounterBuffer {
  views: Map<string, number>;
  downloads: Map<string, number>;
  flushTimer: ReturnType<typeof setInterval> | null;
  lastFlush: number;
}

const globalForCounters = globalThis as unknown as { __lihumCounters?: CounterBuffer };

function getCounterBuffer(): CounterBuffer {
  if (!globalForCounters.__lihumCounters) {
    globalForCounters.__lihumCounters = {
      views: new Map(),
      downloads: new Map(),
      flushTimer: null,
      lastFlush: Date.now(),
    };
  }
  return globalForCounters.__lihumCounters;
}

const FLUSH_INTERVAL_MS = 30000; // 30 seconds
const FLUSH_THRESHOLD = 50; // flush early if buffer gets large

async function flushCounters(): Promise<void> {
  const buf = getCounterBuffer();
  if (buf.views.size === 0 && buf.downloads.size === 0) return;

  // Snapshot + clear the buffers atomically (within this synchronous block).
  const viewsToFlush = new Map(buf.views);
  const downloadsToFlush = new Map(buf.downloads);
  buf.views.clear();
  buf.downloads.clear();
  buf.lastFlush = Date.now();

  // Build a batch of UPDATE statements — one per project with pending counts.
  const stmts: { sql: string; args: unknown[] }[] = [];
  for (const [pid, count] of viewsToFlush) {
    stmts.push({
      sql: "UPDATE Project SET viewCount = viewCount + ? WHERE id = ?",
      args: [count, pid],
    });
  }
  for (const [pid, count] of downloadsToFlush) {
    stmts.push({
      sql: "UPDATE Project SET downloadCount = downloadCount + ? WHERE id = ?",
      args: [count, pid],
    });
  }

  if (stmts.length === 0) return;

  try {
    await db.batch(stmts);
  } catch (err) {
    // D1 write failed (quota exceeded, etc.) — put counts back in the buffer
    // so they're retried on the next flush. Caps at flush threshold to avoid
    // unbounded growth if D1 is persistently unavailable.
    for (const [pid, count] of viewsToFlush) {
      const current = buf.views.get(pid) || 0;
      if (current < FLUSH_THRESHOLD) {
        buf.views.set(pid, current + count);
      }
    }
    for (const [pid, count] of downloadsToFlush) {
      const current = buf.downloads.get(pid) || 0;
      if (current < FLUSH_THRESHOLD) {
        buf.downloads.set(pid, current + count);
      }
    }
    console.warn("[Counters] Flush failed (will retry):", err);
  }
}

function ensureFlushTimer(buf: CounterBuffer): void {
  if (buf.flushTimer) return;
  buf.flushTimer = setInterval(flushCounters, FLUSH_INTERVAL_MS);
  // Don't keep the event loop alive just for this timer.
  if (buf.flushTimer.unref) {
    buf.flushTimer.unref();
  }
}

/**
 * Increments the view counter for a project (batched, ~30s latency).
 * Fire-and-forget: returns immediately, actual write happens on flush.
 */
export async function incrementProjectViews(id: string): Promise<void> {
  const buf = getCounterBuffer();
  buf.views.set(id, (buf.views.get(id) || 0) + 1);
  ensureFlushTimer(buf);
  // Flush immediately if buffer is large (prevents unbounded growth).
  const total = buf.views.size + buf.downloads.size;
  if (total >= FLUSH_THRESHOLD) {
    flushCounters().catch(() => {});
  }
}

/**
 * Increments the download counter for a project (batched, ~30s latency).
 * Fire-and-forget: returns immediately, actual write happens on flush.
 */
export async function incrementProjectDownloads(
  id: string,
  count: number = 1
): Promise<void> {
  if (count <= 0) return;
  const buf = getCounterBuffer();
  buf.downloads.set(id, (buf.downloads.get(id) || 0) + count);
  ensureFlushTimer(buf);
  const total = buf.views.size + buf.downloads.size;
  if (total >= FLUSH_THRESHOLD) {
    flushCounters().catch(() => {});
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
  // visitorData is also preserved — visitor-uploaded photos must NOT be
  // deleted or overwritten when an admin syncs from Google Drive.
  const existing = await db.execute({
    sql: "SELECT id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime, visitorData FROM Photo WHERE projectId = ?",
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
      visitorData: string;
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
      visitorData: String(r.visitorData ?? ""),
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

  // Step 2: Delete only photos that are NOT in the new batch AND are NOT
  // visitor-uploaded photos. Visitor photos (visitorData != "") are preserved
  // across Drive syncs — they were uploaded by visitors, not from Drive.
  const toDelete = [...existingMap.entries()]
    .filter(([id, data]) => !newIds.has(id) && !data.visitorData)
    .map(([id]) => id);

  // Step 1: Upsert only new + changed photos.
  // Use ON CONFLICT DO UPDATE to preserve visitorData + aiHidden on existing rows.
  if (toUpsert.length > 0) {
    const upsertSql = `INSERT INTO Photo (id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime, projectId)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(projectId, id) DO UPDATE SET
                name = excluded.name,
                mimeType = excluded.mimeType,
                thumbnailLink = excluded.thumbnailLink,
                webContentLink = excluded.webContentLink,
                size = excluded.size,
                createdTime = excluded.createdTime,
                modifiedTime = excluded.modifiedTime`;
    // visitorData + aiHidden are NOT in the SET clause → preserved on existing rows
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
  const insertSql = `INSERT INTO Photo (id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime, visitorData, projectId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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
        p.visitorData || "",
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

// ---------- Visitor Upload Frame Overlay ----------
//
// Admin-configured frame (PNG with transparency) that gets composited onto
// every visitor-uploaded photo before it's stored. This makes LIHUM's
// upload mandiri produce the same framed output as the ARAY Android app.
//
// Stored as two Setting rows:
//   visitor_frame_enabled (0/1) — whether to apply frame
//   visitor_frame_image (base64 PNG data URL) — the frame overlay
//
// The frame is fetched by the visitor's browser via GET /api/settings/visitor-frame
// and composited client-side via canvas before uploading the photo.

const FRAME_ENABLED_KEY = "visitor_frame_enabled";
const FRAME_IMAGE_KEY = "visitor_frame_image";

export interface VisitorFrameConfig {
  enabled: boolean;
  frameImage: string; // base64 data URL (e.g. "data:image/png;base64,...")
}

export async function getVisitorFrameConfig(): Promise<VisitorFrameConfig> {
  const enabledRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [FRAME_ENABLED_KEY],
  });
  const imageRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [FRAME_IMAGE_KEY],
  });
  const enabled =
    enabledRes.rows.length > 0 &&
    String((enabledRes.rows[0] as Record<string, unknown>).value) === "1";
  const frameImage =
    imageRes.rows.length > 0
      ? String((imageRes.rows[0] as Record<string, unknown>).value)
      : "";
  return { enabled, frameImage };
}

export async function setVisitorFrameConfig(
  enabled: boolean,
  frameImage: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [FRAME_ENABLED_KEY, enabled ? "1" : "0", now],
    },
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [FRAME_IMAGE_KEY, frameImage || "", now],
    },
  ]);
}

// ---------- Collage Template (multi-slot frame, ARAY-style) ----------
//
// Admin uploads a PNG template with transparent holes (slots). The system
// auto-detects slots via alpha channel + computes rotation angle via image
// moments (ported from ARAY v4.7.67). Photos are drawn into slots at any
// angle (horizontal, vertical, tilted). Fit mode = contain (no crop) or
// fill (cover, crop).
//
// Stored as 3 Setting rows:
//   collage_enabled (0/1) — whether collage mode is active
//   collage_image (base64 PNG data URL) — the template with transparent holes
//   collage_fit_mode ("fit" | "fill") — how photos fill slots

const COLLAGE_ENABLED_KEY = "collage_enabled";
const COLLAGE_IMAGE_KEY = "collage_image";
const COLLAGE_FIT_KEY = "collage_fit_mode";

export interface CollageConfig {
  enabled: boolean;
  templateImage: string; // base64 data URL PNG with transparent holes
  fitMode: "fit" | "fill";
}

export async function getCollageConfig(): Promise<CollageConfig> {
  const enabledRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [COLLAGE_ENABLED_KEY],
  });
  const imageRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [COLLAGE_IMAGE_KEY],
  });
  const fitRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [COLLAGE_FIT_KEY],
  });
  const enabled =
    enabledRes.rows.length > 0 &&
    String((enabledRes.rows[0] as Record<string, unknown>).value) === "1";
  const templateImage =
    imageRes.rows.length > 0
      ? String((imageRes.rows[0] as Record<string, unknown>).value)
      : "";
  const fitModeRaw =
    fitRes.rows.length > 0
      ? String((fitRes.rows[0] as Record<string, unknown>).value)
      : "fill";
  const fitMode: "fit" | "fill" = fitModeRaw === "fit" ? "fit" : "fill";
  return { enabled, templateImage, fitMode };
}

export async function setCollageConfig(
  enabled: boolean,
  templateImage: string,
  fitMode: "fit" | "fill"
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [COLLAGE_ENABLED_KEY, enabled ? "1" : "0", now],
    },
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [COLLAGE_IMAGE_KEY, templateImage || "", now],
    },
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [COLLAGE_FIT_KEY, fitMode, now],
    },
  ]);
}

// ---------- Drive Sync Token (refresh token for visitor photo upload) ----------
//
// When an admin logs in, we save their Google OAuth refresh token to D1.
// The Worker can then exchange it for short-lived access tokens and run
// background sync (upload visitor photos to Drive) 24/7 without requiring
// the admin to keep a browser tab open.
//
// Stored as 2 Setting rows:
//   drive_sync_refresh_token — the refresh token (sensitive, never returned to client)
//   drive_sync_user_email — which admin provided the token (for display)

const DRIVE_SYNC_TOKEN_KEY = "drive_sync_refresh_token";
const DRIVE_SYNC_EMAIL_KEY = "drive_sync_user_email";

export interface DriveSyncTokenConfig {
  connected: boolean;
  userEmail: string;
  connectedAt: string;
}

export async function getDriveSyncTokenConfig(): Promise<DriveSyncTokenConfig> {
  const tokenRes = await db.execute({
    sql: "SELECT value, updatedAt FROM Setting WHERE key = ? LIMIT 1",
    args: [DRIVE_SYNC_TOKEN_KEY],
  });
  const emailRes = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [DRIVE_SYNC_EMAIL_KEY],
  });
  const hasToken = tokenRes.rows.length > 0 && String((tokenRes.rows[0] as Record<string, unknown>).value).length > 0;
  const userEmail = emailRes.rows.length > 0 ? String((emailRes.rows[0] as Record<string, unknown>).value) : "";
  const connectedAt = tokenRes.rows.length > 0 ? String((tokenRes.rows[0] as Record<string, unknown>).updatedAt) : "";
  return {
    connected: hasToken,
    userEmail,
    connectedAt,
  };
}

export async function getDriveSyncRefreshToken(): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT value FROM Setting WHERE key = ? LIMIT 1",
    args: [DRIVE_SYNC_TOKEN_KEY],
  });
  if (r.rows.length === 0) return null;
  const val = String((r.rows[0] as Record<string, unknown>).value);
  return val || null;
}

export async function setDriveSyncToken(refreshToken: string, userEmail: string): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [DRIVE_SYNC_TOKEN_KEY, refreshToken, now],
    },
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [DRIVE_SYNC_EMAIL_KEY, userEmail, now],
    },
  ]);
}

export async function clearDriveSyncToken(): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [DRIVE_SYNC_TOKEN_KEY, "", now],
    },
    {
      sql: `INSERT INTO Setting (key, value, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      args: [DRIVE_SYNC_EMAIL_KEY, "", now],
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
