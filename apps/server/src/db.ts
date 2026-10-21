import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { assist } from "./paths.js";

let pool: Pool | null = null;

/**
 * The Postgres connection string. Postgres is required: there is no JSON
 * fallback, so a missing value is a hard, actionable error.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || url === "postgres://...") {
    throw new Error(
      "DATABASE_URL não configurada. Rode `npm run setup` (ou preencha apps/server/.env) e suba o banco com `docker compose up -d`.",
    );
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl(), max: 5 });
    pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Throws with an actionable message when the database is unreachable. */
export async function healthCheck(): Promise<void> {
  try {
    await getPool().query("SELECT 1");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Não foi possível conectar ao Postgres (${detail}). Suba o banco com \`docker compose up -d\` e rode \`npm run db:migrate\`.`,
    );
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(sql, params as never[]);
  return res.rows;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function migrationsDir(): string {
  return assist("db", "migrations");
}

/**
 * Advisory-lock key used to serialize migrations across processes/workers.
 * `CREATE TABLE IF NOT EXISTS` is not concurrency-safe in Postgres (the table's
 * composite type still collides), so parallel Vitest workers or a server boot
 * racing the Atualizar flow could apply the same migration twice. Advisory
 * locks are cluster-wide and released automatically if the connection dies.
 */
const MIGRATION_LOCK_KEY = 0x4c58_504d; // "LXPM"

/**
 * Apply every not-yet-applied `*.sql` migration in lexical order, each in its
 * own transaction, recording it in `schema_migrations`. Idempotent: re-running
 * with no new files is a no-op. Concurrent callers are serialized with an
 * advisory lock, so only one process applies a given migration.
 */
export async function runMigrations(): Promise<string[]> {
  const dir = migrationsDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied: string[] = [];

  const client = await getPool().connect();
  let lockHeld = false;
  let unlockFailed = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    lockHeld = true;

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const { rowCount } = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (rowCount && rowCount > 0) continue;

      const sql = readFileSync(path.join(dir, file), "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      }
      applied.push(version);
    }

    return applied;
  } finally {
    if (lockHeld) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
      } catch {
        // Never return a connection to the pool while it still holds the lock.
        unlockFailed = true;
      }
    }
    client.release(unlockFailed);
  }
}
