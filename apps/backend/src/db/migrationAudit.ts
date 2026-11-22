import { promises as fs } from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Deploy-time migration audit (issue #422).
 *
 * node-pg-migrate keeps its own `pgmigrations` bookkeeping table, but that is
 * infrastructure state, not a human-readable audit trail of "who deployed which
 * schema change when". This module records, for every deploy, which migrations
 * were applied, when, and as part of which release.
 *
 * It can be used in two ways:
 *
 *   1. Programmatically, wrapping a migration run:
 *
 *        const audit = await startMigrationAudit();
 *        await runMigrations();
 *        await audit.finish();
 *
 *   2. As a standalone script that diffs `pgmigrations` before/after, or that
 *      accepts an explicit list of applied migrations:
 *
 *        tsx src/db/migrationAudit.ts --before
 *        tsx src/db/migrationAudit.ts --after
 *        tsx src/db/migrationAudit.ts --applied 1700000000000_name,1700000000001_other
 */

const AUDIT_TABLE = 'migration_audit_log';
const DEFAULT_LOG_FILE = 'deploy-migrations.log';
/**
 * Baseline written by `--before` and consumed (then removed) by `--after`, so
 * the audited migration script (`yarn migrate:up:audited`) records exactly the
 * migrations applied by that run rather than every migration ever applied.
 */
export const BASELINE_FILE = '.migration-audit-before.json';

export interface MigrationAuditRecord {
  /** Release/deploy identifier, e.g. "1.4.2" or a CI build number. */
  releaseVersion: string;
  /** ISO-8601 timestamp of when the record was written. */
  deployedAt: string;
  /** Deployment environment (development, test, production, ...). */
  environment: string;
  /** Migrations applied during this deploy, in the order they ran. */
  appliedMigrations: string[];
  /** Optional free-form note (e.g. deployer, commit sha, pipeline id). */
  note?: string;
}

export interface MigrationAuditOptions {
  /** Explicit release version; falls back to RELEASE_VERSION, then package.json. */
  releaseVersion?: string;
  /** Explicit environment; falls back to env.NODE_ENV. */
  environment?: string;
  /** Path to the human-readable deploy log file. */
  logFile?: string;
  /** Optional note attached to the record. */
  note?: string;
  /** Skip writing to the dedicated audit table. */
  skipDatabase?: boolean;
  /** Skip appending to the human-readable deploy log file. */
  skipFile?: boolean;
}

/**
 * Resolve the release version from (in order): explicit option, RELEASE_VERSION
 * env var, release.config.js, package.json version.
 */
export function resolveReleaseVersion(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const fromEnv = process.env.RELEASE_VERSION;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const fromReleaseConfig = readReleaseConfigVersion();
  if (fromReleaseConfig) {
    return fromReleaseConfig;
  }

  const fromPackageJson = readPackageJsonVersion();
  if (fromPackageJson) {
    return fromPackageJson;
  }

  return 'unknown';
}

function readReleaseConfigVersion(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), 'release.config.js'),
    path.resolve(process.cwd(), 'release.config.cjs'),
    path.resolve(__dirname, '../../../../release.config.js'),
    path.resolve(__dirname, '../../../../release.config.cjs'),
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const config = require(candidate);
      const version =
        (config && (config.version || (config.release && config.release.version))) || undefined;
      if (typeof version === 'string' && version.trim().length > 0) {
        return version.trim();
      }
    } catch {
      // Candidate does not exist or is not loadable; try the next one.
    }
  }

  return undefined;
}

function readPackageJsonVersion(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), 'package.json'),
    path.resolve(__dirname, '../../../../package.json'),
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require(candidate);
      if (pkg && typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
        return pkg.version.trim();
      }
    } catch {
      // Candidate does not exist or is not loadable; try the next one.
    }
  }

  return undefined;
}

function resolveEnvironment(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }
  return env.NODE_ENV || 'unknown';
}

function resolveLogFile(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const fromEnv = process.env.MIGRATION_AUDIT_LOG_FILE;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return path.resolve(process.cwd(), DEFAULT_LOG_FILE);
}

/**
 * Read the set of migrations currently recorded in node-pg-migrate's
 * `pgmigrations` table. Returns an empty array if the table does not exist yet
 * (i.e. this is the very first deploy).
 */
export async function readAppliedMigrations(client: PoolClient | Pool): Promise<string[]> {
  try {
    const result = await client.query<{ name: string; run_on: Date | string }>(
      'SELECT name, run_on FROM pgmigrations ORDER BY run_on ASC, id ASC',
    );
    return result.rows.map((row) => row.name);
  } catch (error) {
    const code = (error as { code?: string }).code;
    // 42P01 = undefined_table: no migrations have ever run.
    if (code === '42P01') {
      return [];
    }
    throw error;
  }
}

/**
 * Compute the migrations present in `after` that were not present in `before`,
 * preserving the order of `after`.
 */
export function diffMigrations(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((name) => !beforeSet.has(name));
}

/**
 * Idempotently create the dedicated audit table.
 */
export async function ensureAuditTable(client: PoolClient | Pool): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
      id SERIAL PRIMARY KEY,
      release_version TEXT NOT NULL,
      environment TEXT NOT NULL,
      deployed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_migrations TEXT[] NOT NULL DEFAULT '{}',
      note TEXT
    )
  `);
}

/**
 * Insert the audit record into the dedicated `migration_audit_log` table.
 */
export async function recordAuditInDatabase(
  client: PoolClient | Pool,
  record: MigrationAuditRecord,
): Promise<void> {
  await ensureAuditTable(client);
  await client.query(
    `INSERT INTO ${AUDIT_TABLE}
       (release_version, environment, deployed_at, applied_migrations, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      record.releaseVersion,
      record.environment,
      record.deployedAt,
      record.appliedMigrations,
      record.note ?? null,
    ],
  );
}

/**
 * Append a human-readable line to the deploy log file.
 */
export async function appendToDeployLog(
  record: MigrationAuditRecord,
  logFile: string,
): Promise<void> {
  const migrations =
    record.appliedMigrations.length > 0 ? record.appliedMigrations.join(', ') : '(none)';
  const line =
    `[${record.deployedAt}] release=${record.releaseVersion} ` +
    `environment=${record.environment} migrations=${record.appliedMigrations.length} ` +
    `applied=[${migrations}]` +
    (record.note ? ` note=${record.note}` : '') +
    '\n';

  await fs.appendFile(logFile, line, 'utf8');
}

/**
 * Emit a structured log entry via the shared logger.
 */
export function logAuditRecord(record: MigrationAuditRecord): void {
  logger.info('migration audit', {
    releaseVersion: record.releaseVersion,
    environment: record.environment,
    deployedAt: record.deployedAt,
    appliedMigrations: record.appliedMigrations,
    appliedCount: record.appliedMigrations.length,
    note: record.note,
  });
}

/**
 * Write a complete audit record: structured log, human-readable deploy log,
 * and (unless skipped) the dedicated audit table.
 */
export async function writeMigrationAudit(
  record: MigrationAuditRecord,
  options: MigrationAuditOptions = {},
  client?: PoolClient | Pool,
): Promise<void> {
  logAuditRecord(record);

  if (!options.skipFile) {
    try {
      await appendToDeployLog(record, resolveLogFile(options.logFile));
    } catch (error) {
      logger.warn('failed to append migration audit to deploy log', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!options.skipDatabase && client) {
    try {
      await recordAuditInDatabase(client, record);
    } catch (error) {
      logger.warn('failed to record migration audit in database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Build a record from the given applied migrations and options.
 */
export function buildAuditRecord(
  appliedMigrations: string[],
  options: MigrationAuditOptions = {},
): MigrationAuditRecord {
  return {
    releaseVersion: resolveReleaseVersion(options.releaseVersion),
    environment: resolveEnvironment(options.environment),
    deployedAt: new Date().toISOString(),
    appliedMigrations,
    note: options.note,
  };
}

export interface MigrationAuditHandle {
  /** Migrations recorded in pgmigrations when the audit started. */
  before: string[];
  /** Finish the audit, diffing pgmigrations and writing the record. */
  finish: (options?: MigrationAuditOptions) => Promise<MigrationAuditRecord>;
}

/**
 * Start an audit around a migration run. Reads the current state of
 * `pgmigrations` so that `finish()` can determine exactly which migrations were
 * applied during this deploy.
 */
export async function startMigrationAudit(
  client: PoolClient | Pool,
): Promise<MigrationAuditHandle> {
  const before = await readAppliedMigrations(client);

  return {
    before,
    async finish(options: MigrationAuditOptions = {}): Promise<MigrationAuditRecord> {
      const after = await readAppliedMigrations(client);
      const applied = diffMigrations(before, after);
      const record = buildAuditRecord(applied, options);
      await writeMigrationAudit(record, options, client);
      return record;
    },
  };
}

/**
 * Record an explicit list of applied migrations (e.g. supplied by CI).
 */
export async function recordAppliedMigrations(
  appliedMigrations: string[],
  options: MigrationAuditOptions = {},
  client?: PoolClient | Pool,
): Promise<MigrationAuditRecord> {
  const record = buildAuditRecord(appliedMigrations, options);
  await writeMigrationAudit(record, options, client);
  return record;
}

function parseArgs(argv: string[]): {
  mode: 'before' | 'after' | 'applied' | 'record';
  applied: string[];
  options: MigrationAuditOptions;
} {
  const options: MigrationAuditOptions = {};
  let mode: 'before' | 'after' | 'applied' | 'record' = 'record';
  let applied: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--before':
        mode = 'before';
        break;
      case '--after':
        mode = 'after';
        break;
      case '--applied': {
        mode = 'applied';
        const value = argv[i + 1];
        if (value) {
          applied = value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
          i += 1;
        }
        break;
      }
      case '--release':
        options.releaseVersion = argv[i + 1];
        i += 1;
        break;
      case '--environment':
        options.environment = argv[i + 1];
        i += 1;
        break;
      case '--log-file':
        options.logFile = argv[i + 1];
        i += 1;
        break;
      case '--note':
        options.note = argv[i + 1];
        i += 1;
        break;
      case '--skip-database':
        options.skipDatabase = true;
        break;
      case '--skip-file':
        options.skipFile = true;
        break;
      default:
        break;
    }
  }

  return { mode, applied, options };
}

/**
 * Standalone entry point. Intended to be invoked alongside node-pg-migrate,
 * e.g.:
 *
 *   yarn migrate:up:audited
 *
 * which runs `--before`, `node-pg-migrate up`, then `--after`.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { mode, applied, options } = parseArgs(argv);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.warn('migration audit skipped: DATABASE_URL is not set');
    return;
  }

  const pool = new Pool({ connectionString });
  try {
    if (mode === 'applied') {
      await recordAppliedMigrations(applied, options, pool);
      return;
    }

    const baselineFile = path.resolve(process.cwd(), BASELINE_FILE);

    if (mode === 'before') {
      const before = await readAppliedMigrations(pool);
      // Persist the baseline so the matching `--after` run can diff against it
      // (issue #544: without this, `--after` always fell back to recording
      // every migration ever applied).
      await fs.writeFile(
        baselineFile,
        JSON.stringify({ capturedAt: new Date().toISOString(), migrations: before }, null, 2),
        'utf8',
      );
      logger.info('migration audit baseline', { before, count: before.length, baselineFile });
      return;
    }

    // mode === 'after' or 'record': diff against the baseline file if present,
    // otherwise record the full current set of applied migrations.
    let before: string[] = [];
    try {
      const raw = await fs.readFile(baselineFile, 'utf8');
      const parsed = JSON.parse(raw) as { migrations?: string[] };
      before = Array.isArray(parsed.migrations) ? parsed.migrations : [];
    } catch {
      // No baseline recorded; fall back to recording everything currently applied.
    }

    const after = await readAppliedMigrations(pool);
    const newlyApplied = diffMigrations(before, after);
    const record = buildAuditRecord(newlyApplied, options);
    await writeMigrationAudit(record, options, pool);
    // Remove the consumed baseline so a stale one can't skew the next run.
    await fs.rm(baselineFile, { force: true });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('migration audit failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}