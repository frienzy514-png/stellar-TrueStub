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
