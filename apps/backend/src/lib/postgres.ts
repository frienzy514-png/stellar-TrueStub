/**
 * Shared Postgres transport for backend services.
 *
 * `lib/hasura.ts` is the transport for Hasura/GraphQL; this module is its
 * counterpart for code that needs real transactional semantics (row locking,
 * `INSERT ... ON CONFLICT`, `SELECT ... FOR UPDATE`). Domain queries live in
 * the stores that use these helpers, not here.
 */
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../config/env";

let pool: Pool | undefined;

/** True when a Postgres connection string is configured. */
export function isPostgresConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

/**
 * Returns the process-wide connection pool, creating it lazily so importing a
 * store never opens sockets (unit tests can import modules without a database).
 */
export function getPool(): Pool {
  if (!pool) {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be configured for Postgres-backed stores");
    }
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.PG_POOL_MAX,
      idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
      query_timeout: env.PG_QUERY_TIMEOUT_MS,
    });
  }
  return pool;
}

/** Runs a single query through the shared pool. */
export async function queryWithTimeout<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

/**
 * Runs `fn` inside a transaction. The client is always released; COMMIT is
 * issued only when `fn` resolves, otherwise the transaction is rolled back.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Closes the pool (used by tests and graceful shutdown). */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end().catch(() => undefined);
}
