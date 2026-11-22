import { Client } from "pg";
import { env } from "./env";

/**
 * Fail-fast connectivity check for DATABASE_URL (#568).
 *
 * DATABASE_URL is used by node-pg-migrate and direct Postgres access. A
 * configured-but-unreachable or wrongly-credentialed database should stop the
 * process at boot with a clear error rather than failing on first use.
 * When DATABASE_URL is unset the check is skipped (the database is optional).
 */
export async function assertDatabaseReachable(): Promise<void> {
  if (!env.DATABASE_URL) return;

  const client = new Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
    query_timeout: env.PG_QUERY_TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`DATABASE_URL is unreachable or misconfigured: ${reason}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}
