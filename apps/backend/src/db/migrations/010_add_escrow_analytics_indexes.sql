-- =============================================================================
-- Migration: 010_add_escrow_analytics_indexes.sql
-- Description: Support the analytics query patterns in routes/analytics.ts,
--   which filter escrow_transactions by a created_at range (ordered by
--   created_at, id) and by status _in (the active-escrow scan). escrow_transactions
--   is externally managed by Hasura and is NOT created by this migration set,
--   so every statement is guarded by to_regclass(...) — a no-op on a fresh CI
--   database, an index add in production. (Issue #631)
-- =============================================================================

-- Up Migration

DO $$
BEGIN
    IF to_regclass('public.escrow_transactions') IS NOT NULL THEN
        -- Supports the status _in (active-escrow) scan and any combined
        -- status + created_at-range filter. EXPLAIN shows an Index Scan using
        -- this index for `WHERE status = ANY(...)`.
        CREATE INDEX IF NOT EXISTS idx_escrow_transactions_status_created_at
            ON public.escrow_transactions (status, created_at);

        -- Supports the created_at range scan ordered by created_at, id
        -- (fetchEscrows pagination). EXPLAIN shows an Index Scan using this
        -- index for `WHERE created_at >= ... AND created_at <= ... ORDER BY
        -- created_at, id`.
        CREATE INDEX IF NOT EXISTS idx_escrow_transactions_created_at_id
            ON public.escrow_transactions (created_at, id);
    END IF;
END
$$;

-- Down Migration

DO $$
BEGIN
    IF to_regclass('public.escrow_transactions') IS NOT NULL THEN
        DROP INDEX IF EXISTS public.idx_escrow_transactions_status_created_at;
        DROP INDEX IF EXISTS public.idx_escrow_transactions_created_at_id;
    END IF;
END
$$;
