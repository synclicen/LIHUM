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
  // photoCount is stored on the Project row itself (kept in sync by sync route),
  // so a single SELECT is enough — no JOIN needed.
  const r = await db.execute("SELECT * FROM Project ORDER BY createdAt ASC");
  return r.rows.map((row) => asProject(row as Record<string, unknown>));
}

export async function findProjectById(id: string): Promise<ProjectRow | null> {
  const r = await db.execute({ sql: "SELECT * FROM Project WHERE id = ?", args: [id] });
  if (r.rows.length === 0) return null;
  return asProject(r.rows[0] as Record<string, unknown>);
}

export async function getProjectWithPhotos(
  id: string
): Promise<{ project: ProjectRow; photos: PhotoRow[] } | null> {
  const project = await findProjectById(id);
  if (!project) return null;
  const r = await db.execute({
    sql: "SELECT * FROM Photo WHERE projectId = ? ORDER BY createdTime ASC",
    args: [id],
  });
  return {
    project,
    photos: r.rows.map((row) => asPhoto(row as Record<string, unknown>)),
  };
}

export async function createProject(input: NewProjectInput): Promise<ProjectRow> {
  await db.execute({
    sql: `INSERT INTO Project (id, name, description, driveFolderUrl, driveFolderId, displayMode, visibility, password, autoSyncEnabled, autoSyncInterval, lastSyncedAt, photoCount, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.name,
      input.description,
      input.driveFolderUrl,
      input.driveFolderId,
      input.displayMode,
      input.visibility,
      input.password,
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
    sql: `UPDATE Project SET name=?, description=?, driveFolderUrl=?, driveFolderId=?, displayMode=?, visibility=?, password=?, autoSyncEnabled=?, autoSyncInterval=?, lastSyncedAt=? WHERE id=?`,
    args: [
      merged.name,
      merged.description,
      merged.driveFolderUrl,
      merged.driveFolderId,
      merged.displayMode,
      merged.visibility,
      merged.password,
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
 * Atomically replaces all photos for a project.
 * Runs delete + inserts in a single libSQL batch/transaction.
 */
export async function replaceProjectPhotos(
  projectId: string,
  photos: NewPhotoInput[]
): Promise<void> {
  const stmts: { sql: string; args: unknown[] }[] = [
    { sql: "DELETE FROM Photo WHERE projectId = ?", args: [projectId] },
  ];
  for (const p of photos) {
    stmts.push({
      sql: `INSERT INTO Photo (id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, projectId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.id,
        p.name,
        p.mimeType,
        p.thumbnailLink,
        p.webContentLink,
        p.size,
        p.createdTime,
        projectId,
      ],
    });
  }
  await db.batch(stmts);
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
  const stmts = photos.map((p) => ({
    sql: `INSERT INTO Photo (id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, projectId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      p.id,
      p.name,
      p.mimeType,
      p.thumbnailLink,
      p.webContentLink,
      p.size,
      p.createdTime,
      projectId,
    ],
  }));
  await db.batch(stmts);
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
