-- =============================================================================
-- Migration: 006_normalize_events_primary_key.sql
-- Description: Normalize the primary-key constraint after the hotels → events
--              rename across databases that applied different rename variants.
-- =============================================================================

DO $$
BEGIN
    IF to_regclass('public.events') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'hotels_pkey'
             AND conrelid = 'public.events'::regclass
       ) THEN
        ALTER TABLE public.events RENAME CONSTRAINT hotels_pkey TO events_pkey;
    END IF;
END
$$;