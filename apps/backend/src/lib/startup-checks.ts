/**
 * Fail-fast startup checks (#565, #566).
 *
 * The backend runs these before it binds the HTTP port. If a check fails, the
 * process exits non-zero with a clear message instead of starting and failing
 * on the first real request.
 *
 * - Hasura check (#566): one real admin-authenticated request to Hasura, so a
 *   wrong URL or admin secret fails at boot instead of on the first user request.
 *
 * - Schema check (#565): every SQL migration file shipped in the image must be
 *   recorded in node-pg-migrate's `pgmigrations` table. The container does NOT
 *   run migrations itself (see Dockerfile); it refuses to serve traffic against
 *   an out-of-date schema.
 */
import { promises as fs, existsSync } from "fs";
import path from "path";
import { Client } from "pg";
import { hasuraClient } from "./hasura";
import { env } from "../config/env";
import { logger } from "./logger";

/** node-pg-migrate's default bookkeeping table. */
export const MIGRATIONS_TABLE = "pgmigrations";

/** Postgres error code for "relation does not exist". */
const UNDEFINED_TABLE = "42P01";

const MIGRATION_FILE_RE = /^\d+_.+\.sql$/;

/**
 * Locates the migrations directory both from source (`src/lib`) and from the
 * compiled output (`dist/lib`). The Dockerfile copies the SQL files into
 * `apps/backend/src/db/migrations` in both cases.
 */
export function defaultMigrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, "../db/migrations"),
    path.resolve(__dirname, "../../src/db/migrations"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[1];
}

/** Migration names as node-pg-migrate records them (file name without `.sql`). */
export async function listMigrationNames(migrationsDir: string): Promise<string[]> {
  const files = await fs.readdir(migrationsDir);
  return files
    .filter((file) => MIGRATION_FILE_RE.test(file))
    .map((file) => file.replace(/\.sql$/, ""))
    .sort();
}

/** Returns expected migration names that are not in the applied list, in order. */
export function computePendingMigrations(expected: string[], applied: string[]): string[] {
  const appliedSet = new Set(applied);
  return expected.filter((name) => !appliedSet.has(name));
}

/**
 * Reads the names of applied migrations from the database. A database that has
 * never been migrated has no bookkeeping table, which means nothing is applied.
 */
export async function fetchAppliedMigrations(databaseUrl: string): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<{ name: string }>(`SELECT name FROM ${MIGRATIONS_TABLE}`);
    return result.rows.map((row) => row.name);
  } catch (err) {
    if ((err as { code?: string }).code === UNDEFINED_TABLE) {
      return [];
    }
    throw err;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Throws if the database is missing any migration shipped with this build.
 * The error lists the pending names and the command that fixes it.
 */
export async function assertMigrationsUpToDate(
  databaseUrl: string,
  migrationsDir: string = defaultMigrationsDir(),
): Promise<void> {
  const expected = await listMigrationNames(migrationsDir);
  const applied = await fetchAppliedMigrations(databaseUrl);
  const pending = computePendingMigrations(expected, applied);

  if (pending.length > 0) {
    throw new Error(
      `Database schema is out of date: ${pending.length} pending migration(s): ` +
        `${pending.join(", ")}. Run "yarn workspace @truestub/backend migrate:up" ` +
        "against this database before starting the backend.",
    );
  }
}

/** Query used for the Hasura startup check; it touches no tables. */
export const HASURA_STARTUP_QUERY = "query StartupHealthCheck { __typename }";

/** Upper bound on the Hasura startup request so a hung endpoint cannot block boot. */
export const HASURA_CHECK_TIMEOUT_MS = 5000;

/**
 * Makes one real, admin-authenticated Hasura request (#566). Env-var presence
 * alone does not prove that the URL and admin secret work, so a wrong value
 * would otherwise only surface on the first user request.
 *
 * Skipped with a warning when Hasura is not configured at all. Fails when it is
 * only half-configured, or when the request errors or times out. The thrown
 * message never includes the admin secret.
 */
export async function assertHasuraReachable(): Promise<void> {
  const url = env.HASURA_GRAPHQL_URL;
  const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

  if (!url && !adminSecret) {
    logger.warn("Hasura startup check skipped: HASURA_GRAPHQL_URL is not configured");
    return;
  }
  if (!url || !adminSecret) {
    throw new Error(
      "Hasura is partially configured: HASURA_GRAPHQL_URL and HASURA_GRAPHQL_ADMIN_SECRET must both be set",
    );
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no response within ${HASURA_CHECK_TIMEOUT_MS}ms`)),
      HASURA_CHECK_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([hasuraClient.request(HASURA_STARTUP_QUERY), timeout]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    throw new Error(
      `Hasura connectivity check failed for ${url}: ${reason}. ` +
        "Verify HASURA_GRAPHQL_URL and HASURA_GRAPHQL_ADMIN_SECRET.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs every startup check. Checks whose dependency is not configured are
 * skipped with a warning so local runs without a database or Hasura still work.
 */
export async function runStartupChecks(): Promise<void> {
  if (env.DATABASE_URL) {
    await assertMigrationsUpToDate(env.DATABASE_URL);
  } else {
    logger.warn("Migration startup check skipped: DATABASE_URL is not configured");
  }
  await assertHasuraReachable();
}
