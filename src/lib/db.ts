/**
 * Database adapter — Cloudflare D1 (production) + libSQL (local dev fallback).
 *
 * Production: uses D1 binding via OpenNext's getCloudflareContext().
 * Local dev: uses libSQL client with file: URL.
 *
 * D1 is FREE (100K writes/day, 5M reads/day, 5GB storage) — runs in-edge
 * (same Cloudflare datacenter as Worker) so latency is ~1ms.
 */

import { createClient, type Client } from "@libsql/client";

interface ExecuteResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
}

// Unified DB interface (subset of libSQL Client that queries.ts uses)
interface UnifiedClient {
  execute(stmt: string | { sql: string; args?: unknown[] }): Promise<ExecuteResult>;
  batch(stmts: { sql: string; args?: unknown[] }[]): Promise<ExecuteResult[]>;
}

// ── D1 adapter (production — Cloudflare Workers) ──
class D1Adapter implements UnifiedClient {
  private d1: any;
  constructor(d1Binding: any) { this.d1 = d1Binding; }

  async execute(stmt: string | { sql: string; args?: unknown[] }): Promise<ExecuteResult> {
    const sqlStr = typeof stmt === "string" ? stmt : stmt.sql;
    const args = typeof stmt === "string" ? undefined : stmt.args;
    const prepared = args && args.length > 0
      ? this.d1.prepare(sqlStr).bind(...args)
      : this.d1.prepare(sqlStr);
    const result = await prepared.all();
    return { rows: result.results || [], rowsAffected: result.meta?.changes || 0 };
  }

  async batch(stmts: { sql: string; args?: unknown[] }[]): Promise<ExecuteResult[]> {
    const prepared = stmts.map(s =>
      s.args && s.args.length > 0
        ? this.d1.prepare(s.sql).bind(...s.args)
        : this.d1.prepare(s.sql)
    );
    const results = await this.d1.batch(prepared);
    return results.map((r: any) => ({
      rows: r.results || [],
      rowsAffected: r.meta?.changes || 0,
    }));
  }
}

// ── libSQL adapter (local dev — file: URL) ──
class LibSqlAdapter implements UnifiedClient {
  private client: Client;
  constructor(client: Client) { this.client = client; }

  async execute(stmt: string | { sql: string; args?: unknown[] }): Promise<ExecuteResult> {
    const result = await this.client.execute(stmt as any);
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      rowsAffected: result.rowsAffected,
    };
  }

  async batch(stmts: { sql: string; args?: unknown[] }[]): Promise<ExecuteResult[]> {
    const results = await this.client.batch(stmts as any);
    return results.map((r) => ({
      rows: r.rows as unknown as Record<string, unknown>[],
      rowsAffected: r.rowsAffected,
    }));
  }
}

const globalForDb = globalThis as unknown as { __lihumDb?: UnifiedClient };

function createDb(): UnifiedClient {
  // ── Production: use D1 binding ──
  // OpenNext exposes Cloudflare env bindings via getCloudflareContext().
  // We use __non_webpack_require__ to avoid bundler issues.
  try {
    const mod = __non_webpack_require__("@opennextjs/cloudflare");
    const ctx = mod.getCloudflareContext();
    if (ctx?.env?.DB) {
      console.log("[DB] Using Cloudflare D1 binding");
      return new D1Adapter(ctx.env.DB);
    }
  } catch {
    // Not in Cloudflare Workers (local dev) — fall through to libSQL
  }

  // ── Local dev: use libSQL client ──
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No database available. In production, D1 binding is used. For local dev, set DATABASE_URL=file:./db/custom.db"
    );
  }
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const client = createClient({ url, authToken });
  console.log("[DB] Using libSQL client (local dev)");
  return new LibSqlAdapter(client);
}

function getDb(): UnifiedClient {
  if (globalForDb.__lihumDb) return globalForDb.__lihumDb;
  const client = createDb();
  globalForDb.__lihumDb = client;
  return client;
}

export const db: UnifiedClient = new Proxy({} as UnifiedClient, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

let schemaPromise: Promise<void> | null = null;

async function ensureColumn(table: string, column: string, definition: string) {
  const result = await db.execute({ sql: `PRAGMA table_info(${table})` });
  const existing = result.rows.map((r) => String((r as Record<string, unknown>).name));
  if (!existing.includes(column)) {
    await db.execute({ sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}` });
  }
}

export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  const p = (async () => {
    // Check if all tables exist (READ ONLY)
    const tableCheck = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Project','Photo','Account','PendingUpload','ProjectFolder','Setting')",
    });
    const existingTables = new Set(
      tableCheck.rows.map((r) => String((r as Record<string, unknown>).name))
    );
    const allTablesExist =
      existingTables.has("Project") &&
      existingTables.has("Photo") &&
      existingTables.has("Account") &&
      existingTables.has("PendingUpload") &&
      existingTables.has("ProjectFolder") &&
      existingTables.has("Setting");

    if (allTablesExist) {
      try {
        await ensureColumn("Project", "visibility", "TEXT NOT NULL DEFAULT 'public'");
        await ensureColumn("Project", "password", "TEXT NOT NULL DEFAULT ''");
        await ensureColumn("Project", "isHidden", "INTEGER NOT NULL DEFAULT 0");
        await ensureColumn("Project", "autoFilterEnabled", "INTEGER NOT NULL DEFAULT 0");
        await ensureColumn("Project", "allowVisitorUpload", "INTEGER NOT NULL DEFAULT 0");
        await ensureColumn("Project", "viewCount", "INTEGER NOT NULL DEFAULT 0");
        await ensureColumn("Project", "downloadCount", "INTEGER NOT NULL DEFAULT 0");
        await ensureColumn("Project", "cameraFilter", "TEXT NOT NULL DEFAULT 'original'");
        await ensureColumn("Project", "cameraAspectRatio", "TEXT NOT NULL DEFAULT '4:3'");
        await ensureColumn("Project", "cameraResolution", "TEXT NOT NULL DEFAULT '1920x1080'");
        await ensureColumn("Project", "cameraCountdown", "INTEGER NOT NULL DEFAULT 3");
        await ensureColumn("Project", "cameraMirror", "INTEGER NOT NULL DEFAULT 1");
        await ensureColumn("Project", "cameraFacing", "TEXT NOT NULL DEFAULT 'environment'");
        await ensureColumn("Photo", "modifiedTime", "TEXT NOT NULL DEFAULT ''");
        await ensureColumn("Photo", "aiHidden", "INTEGER NOT NULL DEFAULT 0");
      } catch (writeErr: any) {
        console.warn("[ensureSchema] Column migration skipped:", writeErr?.message?.slice(0, 80));
      }
      return;
    }

    // Tables missing — create them
    try {
      await db.batch([
        { sql: `CREATE TABLE IF NOT EXISTS Project (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  driveFolderUrl TEXT NOT NULL, driveFolderId TEXT NOT NULL,
  displayMode TEXT NOT NULL DEFAULT 'all',
  visibility TEXT NOT NULL DEFAULT 'public', password TEXT NOT NULL DEFAULT '',
  isHidden INTEGER NOT NULL DEFAULT 0, autoFilterEnabled INTEGER NOT NULL DEFAULT 0,
  allowVisitorUpload INTEGER NOT NULL DEFAULT 0,
  viewCount INTEGER NOT NULL DEFAULT 0, downloadCount INTEGER NOT NULL DEFAULT 0,
  cameraFilter TEXT NOT NULL DEFAULT 'original', cameraAspectRatio TEXT NOT NULL DEFAULT '4:3',
  cameraResolution TEXT NOT NULL DEFAULT '1920x1080', cameraCountdown INTEGER NOT NULL DEFAULT 3,
  cameraMirror INTEGER NOT NULL DEFAULT 1, cameraFacing TEXT NOT NULL DEFAULT 'environment',
  autoSyncEnabled INTEGER NOT NULL DEFAULT 0, autoSyncInterval TEXT NOT NULL DEFAULT '3m',
  lastSyncedAt TEXT NOT NULL DEFAULT '', photoCount INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
)` },
        { sql: `CREATE TABLE IF NOT EXISTS Photo (
  id TEXT NOT NULL, name TEXT NOT NULL, mimeType TEXT NOT NULL DEFAULT '',
  thumbnailLink TEXT NOT NULL DEFAULT '', webContentLink TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '', createdTime TEXT NOT NULL DEFAULT '',
  modifiedTime TEXT NOT NULL DEFAULT '', aiHidden INTEGER NOT NULL DEFAULT 0,
  projectId TEXT NOT NULL, PRIMARY KEY (projectId, id)
)` },
        { sql: `CREATE INDEX IF NOT EXISTS idx_photo_projectId ON Photo(projectId)` },
        { sql: `CREATE TABLE IF NOT EXISTS Account (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'manager',
  displayName TEXT NOT NULL DEFAULT '', addedAt TEXT NOT NULL
)` },
        { sql: `CREATE TABLE IF NOT EXISTS PendingUpload (
  id TEXT PRIMARY KEY, projectId TEXT NOT NULL, fileName TEXT NOT NULL,
  mimeType TEXT NOT NULL DEFAULT 'image/jpeg', base64Data TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0, uploaderIp TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL
)` },
        { sql: `CREATE INDEX IF NOT EXISTS idx_pending_projectId ON PendingUpload(projectId)` },
        { sql: `CREATE TABLE IF NOT EXISTS ProjectFolder (
  id TEXT PRIMARY KEY, projectId TEXT NOT NULL, driveFolderUrl TEXT NOT NULL,
  driveFolderId TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', addedBy TEXT NOT NULL DEFAULT '',
  addedAt TEXT NOT NULL
)` },
        { sql: `CREATE INDEX IF NOT EXISTS idx_projectfolder_projectId ON ProjectFolder(projectId)` },
        { sql: `CREATE TABLE IF NOT EXISTS Setting (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL
)` },
      ]);
    } catch (writeErr: any) {
      console.error("[ensureSchema] Table creation failed:", writeErr?.message?.slice(0, 100));
      throw writeErr;
    }
  })();
  schemaPromise = p;
  try { await p; } catch (err) { schemaPromise = null; throw err; }
}
