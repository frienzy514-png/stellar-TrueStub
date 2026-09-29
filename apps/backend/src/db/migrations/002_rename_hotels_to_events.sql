-- =============================================================================
-- Migration: 002_rename_hotels_to_events.sql
-- Description: Finish the hotel → event domain rename at the data-model level
--              (see docs/PIVOT_NOTES.md). The frontend's dashboard/events pages
--              already target public.events.
--
-- The table's columns (name, description, address, location_area, coordinates)
-- are already domain-neutral, so only the table itself is renamed. Postgres
-- carries indexes, constraints and grants across a rename automatically.
--
-- Idempotent: a no-op when public.hotels doesn't exist (fresh databases) or
-- when public.events already exists (migration already applied).
--
-- After applying, reload Hasura metadata and re-track the table as `events`
-- (Hasura tracks tables by name, so the old `hotels` tracking will go stale).
--
-- -----------------------------------------------------------------------------
-- SafeTrust-era data verification (issue #335)
-- -----------------------------------------------------------------------------
-- Databases carried over from SafeTrust may have real (non-fresh) rows in
-- public.hotels. A rename alone does not prove those rows are meaningful in
-- the ticket-resale domain: hospitality-shaped rows renamed into an events
-- table do not automatically become valid ticket-resale events.
--
-- This migration therefore records a verification pass. It does NOT mutate or
-- delete legacy rows (that would be destructive and out of scope); instead it
-- classifies each renamed row so operators can decide what to do:
--
--   * 'fresh'      – no legacy rows existed; nothing to verify (fresh DBs).
--   * 'verified'   – every renamed row has sensible ticket-resale values.
--   * 'needs_review' – at least one renamed row still looks hospitality-shaped
--                      (e.g. a hotel-style name/description) and must be
--                      reviewed/backfilled before it is treated as an event.
--
-- The result is written to a small audit table so the outcome is documented
-- and queryable after the migration runs.
-- =============================================================================

DO $$
BEGIN
    IF to_regclass('public.hotels') IS NOT NULL
       AND to_regclass('public.events') IS NULL THEN
        ALTER TABLE public.hotels RENAME TO events;

        -- Keep the conventional primary-key constraint name in step.
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'hotels_pkey'
              AND conrelid = 'public.events'::regclass
        ) THEN
            ALTER TABLE public.events RENAME CONSTRAINT hotels_pkey TO events_pkey;
        END IF;
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Verification pass: classify renamed rows for the ticket-resale domain.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events_migration_verification (
    id              serial PRIMARY KEY,
    checked_at      timestamptz NOT NULL DEFAULT now(),
    status          text NOT NULL CHECK (status IN ('fresh', 'verified', 'needs_review')),
    total_rows      integer NOT NULL DEFAULT 0,
    flagged_rows    integer NOT NULL DEFAULT 0,
    notes           text
);

DO $$
DECLARE
    v_total   integer := 0;
    v_flagged integer := 0;
    v_status  text;
BEGIN
    -- Only meaningful once the events table exists.
    IF to_regclass('public.events') IS NULL THEN
        RETURN;
    END IF;

    SELECT count(*) INTO v_total FROM public.events;

    IF v_total = 0 THEN
        v_status := 'fresh';
    ELSE
        -- Flag rows that still look hospitality-shaped rather than
        -- ticket-resale events. These are the rows a rename alone cannot
        -- validate; they need human review or a backfill.
        SELECT count(*) INTO v_flagged
        FROM public.events
        WHERE (name IS NULL OR btrim(name) = '')
           OR (description IS NOT NULL AND (
                   description ILIKE '%hotel%'
                OR description ILIKE '%room%'
                OR description ILIKE '%check-in%'
                OR description ILIKE '%check in%'
                OR description ILIKE '%night stay%'
                OR description ILIKE '%per night%'
                OR description ILIKE '%guest%'
                OR description ILIKE '%booking%'
           ))
           OR (name ILIKE '%hotel%')
           OR (name ILIKE '%room%');

        IF v_flagged > 0 THEN
            v_status := 'needs_review';
        ELSE
            v_status := 'verified';
        END IF;
    END IF;

    INSERT INTO public.events_migration_verification
        (status, total_rows, flagged_rows, notes)
    VALUES (
        v_status,
        v_total,
        v_flagged,
        CASE v_status
            WHEN 'fresh' THEN
                'No legacy SafeTrust rows present; nothing to verify.'
            WHEN 'verified' THEN
                'All renamed rows have sensible ticket-resale values.'
            ELSE
                'Renamed rows still look hospitality-shaped; review/backfill before treating as events.'
        END
    );
END
$$;
