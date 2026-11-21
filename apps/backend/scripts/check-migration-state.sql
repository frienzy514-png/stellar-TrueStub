-- =============================================================================
-- check-migration-state.sql — read-only migration-state check (issue #378)
--
-- Run against one environment at a time:
--
--   psql "$DATABASE_URL" -f apps/backend/scripts/check-migration-state.sql
--
-- Confirms the database is not just "has the migration files" but actually in
-- the state 006_normalize_events_primary_key.sql is meant to leave it in,
-- regardless of which of the duplicate 002/003 rename migrations it applied.
-- Record the output in docs/DATABASE.md ("Cross-environment migration state"
-- and "Events key and foreign-key integrity").
--
-- Nothing here writes to the database.
-- =============================================================================

\echo '--- 1. Applied migrations (node-pg-migrate records these in pgmigrations)'
SELECT id, name, run_on
FROM pgmigrations
ORDER BY run_on, id;

\echo '--- 2. Has 006_normalize_events_primary_key run?'
SELECT EXISTS (
    SELECT 1 FROM pgmigrations WHERE name = '006_normalize_events_primary_key'
) AS migration_006_applied;

\echo '--- 3. Primary-key constraint name on public.events (expect: events_pkey)'
SELECT c.conname AS events_pk_name
FROM pg_constraint c
WHERE c.conrelid = to_regclass('public.events')
  AND c.contype = 'p';

\echo '--- 4. Leftover legacy objects (expect: both false)'
SELECT
    to_regclass('public.hotels') IS NOT NULL AS hotels_table_still_exists,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotels_pkey') AS hotels_pkey_still_exists;

\echo '--- 5. Overall verdict'
SELECT CASE
    WHEN to_regclass('public.events') IS NULL
        THEN 'INCONSISTENT: public.events does not exist'
    WHEN NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '006_normalize_events_primary_key')
        THEN 'INCONSISTENT: 006 has not been applied; run migrate:up'
    WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotels_pkey')
        THEN 'INCONSISTENT: hotels_pkey still present after 006'
    WHEN to_regclass('public.hotels') IS NOT NULL
        THEN 'INCONSISTENT: legacy public.hotels table still present'
    WHEN NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.events') AND contype = 'p' AND conname = 'events_pkey'
    )
        THEN 'INCONSISTENT: public.events primary key is not named events_pkey'
    ELSE 'CONSISTENT'
END AS verdict;

-- =============================================================================
-- Events key / foreign-key integrity (issue #542). Read-only equivalent of
-- migration 011_verify_events_key_integrity.sql.
-- =============================================================================

\echo '--- 6. Foreign keys referencing public.events (expect: every row convalidated = true)'
SELECT c.conrelid::regclass AS source_table,
       c.conname,
       pg_get_constraintdef(c.oid) AS definition,
       c.convalidated
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid = to_regclass('public.events')
ORDER BY 1, 2;

\echo '--- 7. Foreign keys still referencing a legacy public.hotels table (expect: no rows)'
SELECT c.conrelid::regclass AS source_table,
       c.conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid = to_regclass('public.hotels')
ORDER BY 1, 2;

\echo '--- 8. ticket_listings → events link (004 declares no FK; expect: has_event_id = false)'
SELECT
    EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('public.ticket_listings')
          AND attname = 'event_id' AND NOT attisdropped
    ) AS has_event_id,
    EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = to_regclass('public.ticket_listings')
          AND confrelid = to_regclass('public.events')
    ) AS has_fk_to_events;

\echo '--- 9. Integrity verdict'
SELECT CASE
    WHEN to_regclass('public.events') IS NULL
        THEN 'SKIPPED: public.events does not exist'
    WHEN NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.events') AND contype = 'p'
    )
        THEN 'BROKEN: public.events has no primary key'
    WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND confrelid = to_regclass('public.events') AND NOT convalidated
    )
        THEN 'NEEDS VALIDATION: unvalidated FK to events; run migrate:up (011 validates it)'
    WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND confrelid = to_regclass('public.hotels')
    )
        THEN 'NEEDS REVIEW: FK still references legacy public.hotels'
    ELSE 'INTACT'
END AS integrity_verdict;
