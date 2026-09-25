-- =============================================================================
-- Migration: 003_rename_hotels_to_events.sql
-- Description: Domain rename hotels → events (see docs/PIVOT_NOTES.md).
--
-- Databases carried over from SafeTrust have public.hotels; it is renamed in
-- place so existing rows survive. Fresh databases get public.events directly.
-- Column limits are kept identical to the original hotels table.
--
-- Hasura permissions (role: user):
--   select  — all rows
--   insert  — columns name, description, address, location_area, coordinates,
--             owner_id; check { owner_id: { _eq: X-Hasura-User-Id } }
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
BEGIN
    IF to_regclass('public.hotels') IS NOT NULL
       AND to_regclass('public.events') IS NULL THEN
        ALTER TABLE public.hotels RENAME TO events;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(20) NOT NULL,
    description VARCHAR(50),
    address VARCHAR(50) NOT NULL,
    location_area VARCHAR(20),
    coordinates geometry(Point, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
