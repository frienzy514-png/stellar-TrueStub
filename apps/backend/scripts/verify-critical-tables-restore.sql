-- =============================================================================
-- verify-critical-tables-restore.sql (issue #545)
--
-- Fingerprint (no persistent writes; uses a session temp table) of the money-critical tables: disputes, refunds and
-- transfers (plus their idempotency and audit tables). Run it against the
-- SOURCE database and the RESTORED database and diff the two outputs:
--
--   psql "$DATABASE_URL"         -X -q -A -t -f apps/backend/scripts/verify-critical-tables-restore.sql > source.txt
--   psql "$RESTORE_DATABASE_URL" -X -q -A -t -f apps/backend/scripts/verify-critical-tables-restore.sql > restored.txt
--   diff source.txt restored.txt && echo "critical tables restored intact"
--
-- For each table it reports the row count and an md5 checksum over every row
-- (ordered by the full row), so a restore that drops, truncates, duplicates or
-- alters any dispute/refund/transfer record produces a diff, not just one that
-- loses the whole table. Tables that do not exist in this environment yet
-- (still in-memory or Hasura-managed) are reported as MISSING, so a table that
-- exists in the source but not in the restore is also caught.
--
-- Take the source fingerprint from the same point in time as the snapshot (or
-- with writes paused); otherwise legitimate new rows will show up as a diff.
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS _critical_table_fingerprint (
    table_name TEXT PRIMARY KEY,
    row_count  BIGINT,
    checksum   TEXT
) ON COMMIT PRESERVE ROWS;

TRUNCATE _critical_table_fingerprint;

DO $$
DECLARE
    critical_table TEXT;
    n BIGINT;
    digest TEXT;
BEGIN
    FOREACH critical_table IN ARRAY ARRAY[
        'disputes',
        'refunds',
        'refund_idempotency',
        'ownership_transfers',
        'transfers',
        'transfer_idempotency',
        'row_change_audit'
    ] LOOP
        IF to_regclass(format('public.%I', critical_table)) IS NULL THEN
            INSERT INTO _critical_table_fingerprint VALUES (critical_table, NULL, 'MISSING');
            CONTINUE;
        END IF;

        EXECUTE format(
            'SELECT count(*), md5(COALESCE(string_agg(t::text, E''\n'' ORDER BY t::text), ''''))
               FROM public.%I AS t',
            critical_table
        ) INTO n, digest;

        INSERT INTO _critical_table_fingerprint VALUES (critical_table, n, digest);
    END LOOP;
END;
$$;

SELECT table_name || '|' || COALESCE(row_count::text, '-') || '|' || checksum
  FROM _critical_table_fingerprint
 ORDER BY table_name;
