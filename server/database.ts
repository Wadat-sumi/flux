import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export async function openDatabase(options: {
  url?: string;
  directory?: string;
  production?: boolean;
}): Promise<Database> {
  if (options.url) {
    const url = new URL(options.url);
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw new Error("DATABASE_URL must use PostgreSQL");
    // TLS certificate verification stays enabled; never accept rejectUnauthorized:false.
    if (options.production && url.searchParams.get("sslmode") !== "verify-full")
      throw new Error("Production DATABASE_URL requires sslmode=verify-full");
    const pool = new pg.Pool({
      connectionString: options.url,
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    });
    return {
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => (await pool.query<T>(sql, values)).rows,
      exec: async (sql) => {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
  }
  if (options.production)
    throw new Error(
      "Production requires DATABASE_URL; embedded storage is local-only",
    );
  if (options.directory)
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const local = new PGlite(options.directory);
  await local.waitReady;
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await local.query<T>(sql, values)).rows,
    exec: async (sql) => {
      await local.exec(sql);
    },
    close: () => local.close(),
  };
}

export async function migrate(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS flux_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS flux_users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flux_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES flux_users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS flux_session_expiry ON flux_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS flux_scenarios (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES flux_users(id) ON DELETE CASCADE,
      document TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS flux_scenario_owner ON flux_scenarios(owner_id);
    CREATE TABLE IF NOT EXISTS flux_datasets (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES flux_users(id) ON DELETE CASCADE,
      document TEXT NOT NULL, raw_content TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS flux_dataset_owner ON flux_datasets(owner_id);
    CREATE TABLE IF NOT EXISTS flux_jobs (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES flux_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')),
      progress INTEGER NOT NULL CHECK(progress BETWEEN 0 AND 100), input TEXT NOT NULL,
      results TEXT, error TEXT, created_at TEXT NOT NULL, finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS flux_job_owner ON flux_jobs(owner_id, created_at);
    CREATE INDEX IF NOT EXISTS flux_job_queue ON flux_jobs(status, created_at);
  `);
  await db.query(
    "INSERT INTO flux_migrations(version, applied_at) VALUES ($1,$2) ON CONFLICT(version) DO NOTHING",
    [1, new Date().toISOString()],
  );
}
