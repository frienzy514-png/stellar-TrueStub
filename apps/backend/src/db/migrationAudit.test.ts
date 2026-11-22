/**
 * Issue #544 — confirm `migrate:up:audited` meaningfully differs from
 * `migrate:up` rather than being a near-duplicate script.
 *
 * `migrate:up` only runs node-pg-migrate, which records bookkeeping in
 * `pgmigrations`. `migrate:up:audited` additionally captures a baseline before
 * the run and, afterwards, writes a release-tagged record of exactly which
 * migrations that run applied to `migration_audit_log` and the deploy log.
 */
import path from 'path';
import { buildAuditRecord, BASELINE_FILE, diffMigrations } from './migrationAudit';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const backendPkg = require(path.resolve(__dirname, '../../package.json')) as {
  scripts: Record<string, string>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rootPkg = require(path.resolve(__dirname, '../../../../package.json')) as {
  scripts: Record<string, string>;
};

describe('migrate:up vs migrate:up:audited (#544)', () => {
  const plain = backendPkg.scripts['migrate:up'];
  const audited = backendPkg.scripts['migrate:up:audited'];

  it('defines both scripts in the backend workspace', () => {
    expect(plain).toBeDefined();
    expect(audited).toBeDefined();
  });

  it('root scripts delegate to the matching backend workspace scripts', () => {
    expect(rootPkg.scripts['migrate:up']).toBe('yarn workspace @truestub/backend migrate:up');
    expect(rootPkg.scripts['migrate:up:audited']).toBe(
      'yarn workspace @truestub/backend migrate:up:audited',
    );
  });

  it('are not the same command', () => {
    expect(audited).not.toBe(plain);
  });

  it('plain migrate:up does not invoke the audit', () => {
    expect(plain).not.toMatch(/migrationAudit/);
  });

  it('audited variant captures a baseline, runs the same migrations, then records the audit', () => {
    const steps = audited.split('&&').map((step) => step.trim());
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/migrationAudit\.ts --before$/);
    expect(steps[1]).toBe('yarn migrate up');
    expect(steps[2]).toMatch(/migrationAudit\.ts --after$/);
  });

  it('uses a baseline file that is git-ignored', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    const gitignore = fs.readFileSync(path.resolve(__dirname, '../../../../.gitignore'), 'utf8');
    expect(gitignore.split(/\r?\n/)).toContain(BASELINE_FILE);
  });
});

describe('migration audit record contents', () => {
  it('records only migrations applied by this run, in order', () => {
    expect(diffMigrations(['001_a', '002_b'], ['001_a', '002_b', '003_c', '004_d'])).toEqual([
      '003_c',
      '004_d',
    ]);
    expect(diffMigrations(['001_a'], ['001_a'])).toEqual([]);
  });

  it('carries release, environment and timestamp beyond what pgmigrations stores', () => {
    const record = buildAuditRecord(['003_c'], {
      releaseVersion: '1.2.3',
      environment: 'production',
      note: 'pipeline 42',
    });
    expect(record).toMatchObject({
      releaseVersion: '1.2.3',
      environment: 'production',
      appliedMigrations: ['003_c'],
      note: 'pipeline 42',
    });
    expect(Number.isNaN(Date.parse(record.deployedAt))).toBe(false);
  });
});
