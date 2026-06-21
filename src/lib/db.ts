import { createClient, type Client } from "@libsql/client";

/**
 * Turso / libSQL database client.
 *
 * Works in three environments without code changes:
 *  - Local dev (sandbox): DATABASE_URL="file:/abs/path/to.db"  (libSQL local file mode)
 *  - Turso (cloud):        DATABASE_URL="libsql://<db>.turso.io" + TURSO_AUTH_TOKEN
 *  - Cloudflare Workers:   same Turso URL + token (HTTP transport, no native binding needed)
 *
 * The client is created LAZILY (on first DB access) so that `next build` can
 * evaluate the module without needing DATABASE_URL set at build time.
 */

const globalForDb = globalThis as unknown as { __lihumDb?: Client };

function createDb(): Client {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. For local dev use 'file:./db/custom.db', for Turso use 'libsql://...'."
    );
  }
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  return createClient({ url, authToken });
}

/** Returns the cached client, creating it on first call (lazy). */
function getDb(): Client {
  if (globalForDb.__lihumDb) return globalForDb.__lihumDb;
  const client = createDb();
  globalForDb.__lihumDb = client;
  return client;
}

/**
 * Lazy proxy — `createDb()` is only invoked on first property access,
 * not at module load. This lets `next build` import the module without
 * DATABASE_URL being set (build-time prerendering won't trigger DB calls).
 */
export const db: Client = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

let schemaPromise: Promise<void> | null = null;

/**
 * Adds a column to a table if it doesn't already exist.
 * Used for schema migrations on existing databases (CREATE TABLE IF NOT EXISTS
 * won't add new columns to an already-existing table).
 */
async function ensureColumn(table: string, column: string, definition: string) {
  const result = await db.execute({ sql: `PRAGMA table_info(${table})` });
  const existing = result.rows.map((r) => String((r as Record<string, unknown>).name));
  if (!existing.includes(column)) {
    await db.execute({ sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}` });
  }
}

/**
 * Idempotently creates the LIHUM schema (Project, Photo, Account) and runs
 * lightweight migrations for new columns. Safe to call on every request.
 * Concurrent calls are deduplicated.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await db.batch([
      {
        sql: `CREATE TABLE IF NOT EXISTS Project (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  driveFolderUrl  TEXT NOT NULL,
  driveFolderId   TEXT NOT NULL,
  displayMode     TEXT NOT NULL DEFAULT 'all',
  autoSyncEnabled INTEGER NOT NULL DEFAULT 0,
  autoSyncInterval TEXT NOT NULL DEFAULT '3m',
  lastSyncedAt    TEXT NOT NULL DEFAULT '',
  photoCount      INTEGER NOT NULL DEFAULT 0,
  createdAt       TEXT NOT NULL
)`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS Photo (
  id             TEXT NOT NULL,
  name           TEXT NOT NULL,
  mimeType       TEXT NOT NULL DEFAULT '',
  thumbnailLink  TEXT NOT NULL DEFAULT '',
  webContentLink TEXT NOT NULL DEFAULT '',
  size           TEXT NOT NULL DEFAULT '',
  createdTime    TEXT NOT NULL DEFAULT '',
  projectId      TEXT NOT NULL,
  PRIMARY KEY (projectId, id),
  FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE
)`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_photo_projectId ON Photo(projectId)`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS Account (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'manager',
  displayName TEXT NOT NULL DEFAULT '',
  addedAt     TEXT NOT NULL
)`,
      },
    ]);

    // Migrations: add new columns to existing Project table (idempotent).
    await ensureColumn("Project", "visibility", "TEXT NOT NULL DEFAULT 'public'");
    await ensureColumn("Project", "password", "TEXT NOT NULL DEFAULT ''");
    await ensureColumn("Project", "isHidden", "INTEGER NOT NULL DEFAULT 0");
  })();
  try {
    await schemaPromise;
  } finally {
    schemaPromise = null;
  }
}
