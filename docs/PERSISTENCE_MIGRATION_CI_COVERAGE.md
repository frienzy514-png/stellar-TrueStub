# Persistence migrations: CI coverage check (issue #599)

> **Status: Living (checklist).** Follow this in the PR that adds the
> disputes, refunds and transfers tables. Don't assume CI covers new
> migrations without checking.

## What CI already does

`.github/workflows/backend-ci.yml` runs these steps against a real Postgres
service on every PR that touches `apps/backend/**`:

| Step | What it checks |
| --- | --- |
| Snapshot pre-migration schema | Records the `public` tables before anything runs |
| Apply database migrations | `migrate:up --check-order`: every migration applies, in filename order |
| Roll back every migration | Runs `migrate:down` once per `*.sql` file, then checks that `pgmigrations` is empty and that the table list matches the pre-migration snapshot |
| Re-apply after rollback | `migrate:up --check-order` again on the rolled-back schema |

Separately, `.github/workflows/migration-collision-check.yml` comments on a
PR when its migration number matches one added in another open PR.

## Why "it's covered automatically" needs checking

The steps above pick up any new `src/db/migrations/*.sql` file without
config changes. But there are a few ways a new migration can pass while
not really being tested:

1. **The rollback count comes from the file count.** The loop runs
   `migrate:down` once per `.sql` file. There are already two `007_*` files
   (`007_add_idempotency_unique_constraints.sql`,
   `007_create_notification_dead_letters.sql`). If a new migration shares a
   number, or node-pg-migrate skips or merges a file, the loop count and the
   `pgmigrations` count can stop matching. The `pgmigrations` empty-check
   catches *too few* rollbacks, but check by hand that each new file was
   actually rolled back.
2. **The schema diff only compares table names.** The check compares
   `information_schema.tables` names. A `-- Down Migration` that drops the
   table but leaves an enum type, sequence, index on another table, or
   function behind would still pass.
3. **An empty or no-op `-- Down Migration` section.** If the Down section
   is missing, node-pg-migrate may still "roll back" by removing the
   `pgmigrations` row without dropping anything. Then the table-name diff
   would fail, but only if the Up section created a table. A migration that
   only `ALTER`s an existing table would pass with a no-op Down.
4. **Re-apply isn't checked for data.** Re-applying on an empty schema
   doesn't test the Up migration against existing rows. That matters if the
   new migrations backfill or add `NOT NULL` columns.
5. **The test suite doesn't use the tables.** `yarn test` runs with Jest
   mocks, not against the migrated Postgres. A migration can apply and roll
   back cleanly while the store code points at the wrong column names.

## Checklist for the persistence PR

### Locally, against a disposable Postgres

```bash
docker compose up -d postgres
export DATABASE_URL=postgres://postgres:postgrespassword@localhost:5432/safetrust

yarn workspace @truestub/backend migrate:up --check-order
psql "$DATABASE_URL" -c '\dt public.*'          # new tables listed?
psql "$DATABASE_URL" -c 'SELECT name FROM pgmigrations ORDER BY run_on;'
```

- [ ] Each new migration appears in `pgmigrations`.
- [ ] Each new table exists, with the expected columns, constraints and
      indexes (`\d+ <table>`). In particular, the unique constraint on
      `refund_id` that `RefundStore.insertIfAbsent` relies on.

Roll back **only the new migrations**, one at a time:

```bash
yarn workspace @truestub/backend migrate:down        # repeat once per new file
psql "$DATABASE_URL" -c '\dt public.*'               # new tables gone?
psql "$DATABASE_URL" -c '\dT public.*'               # no leftover enum types?
psql "$DATABASE_URL" -c '\ds public.*'               # no leftover sequences?
psql "$DATABASE_URL" -c '\df public.*'               # no leftover functions?
yarn workspace @truestub/backend migrate:up --check-order
```

- [ ] Every new migration has a real `-- Down Migration` section that undoes
      everything its Up created (tables, types, sequences, functions,
      indexes, triggers).
- [ ] After the down/up cycle, `\d+` output for each new table matches what
      it was before. Save both outputs and diff them.

Then run the full CI sequence locally. The easiest way is to run the
commands from `backend-ci.yml` in order, on a fresh database:

- [ ] Apply → roll back all → schema diff empty → re-apply all passes.

### In CI

- [ ] In the **Roll back every migration** step's log, each new file
      appears as reverted (`### MIGRATION <name> (DOWN) ###`).
- [ ] The **Migration Collision Check** posted no comment, or the
      collision was fixed by renumbering.

### Suggested hardening (separate PR, optional)

The gaps in *Why "it's covered automatically" needs checking* are general
to all migrations, not just this one. Worth fixing in `backend-ci.yml`:

- Compare a full `pg_dump --schema-only` before and after rollback, not
  just table names (gaps 2 and 3).
- Drive the rollback loop from `SELECT count(*) FROM pgmigrations` rather
  than `ls *.sql | wc -l` (gap 1).
- Add a small integration test, run after **Apply database migrations**,
  that does an insert and read through each new Postgres-backed store,
  including the `refund_id` unique-violation path (gap 5).

## Record

In the persistence PR description:

```markdown
### Migration CI coverage (#599)

- New migrations: `0NN_…sql`, `0NN_…sql`
- Local apply / rollback / re-apply: ✅
- Leftover objects after rollback (`\dt \dT \ds \df`): none
- `\d+` diff before/after down-up cycle: empty
- CI rollback log shows each new file reverted: <link to run>
```

## Acceptance

- [ ] The *Record* block is filled in on the persistence PR, and every
      checklist item above is ticked.
