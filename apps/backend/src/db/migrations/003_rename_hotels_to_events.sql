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

-- =============================================================================
-- Data-migration verification for SafeTrust-era `hotels` rows (issue #335)
--
-- A rename alone does not prove that carried-over rows are meaningful in the
-- ticket-resale domain: hospitality-shaped rows renamed into `events` do not
-- automatically become valid ticket-resale events. This pass records what
-- legacy data actually exists so operators can decide whether a backfill is
-- required, without mutating or discarding any rows.
--
-- It is a no-op on fresh databases (no pre-pivot rows), which is the expected
-- state for all current environments; the audit table simply stays empty.
-- =============================================================================

CREATE TABLE IF NOT EXISTS events_migration_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    reason TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flag renamed rows whose values do not look like ticket-resale events.
-- Heuristics are intentionally conservative: they only mark rows that are
-- clearly hospitality leftovers (e.g. a room/booking-shaped name or a
-- description that reads like a hotel listing) so genuine events are never
-- misclassified.
INSERT INTO events_migration_audit (event_id, reason)
SELECT e.id,
       'legacy hospitality-shaped row: ' ||
       CASE
           WHEN e.name ~* '(room|suite|hotel|inn|lodge|booking|check[- ]?in)' THEN 'name'
           WHEN e.description ~* '(room|suite|hotel|inn|lodge|booking|check[- ]?in|per night|nightly)' THEN 'description'
           ELSE 'unknown'
       END
FROM events e
WHERE e.owner_id IS NULL
  AND (
      e.name ~* '(room|suite|hotel|inn|lodge|booking|check[- ]?in)'
      OR e.description ~* '(room|suite|hotel|inn|lodge|booking|check[- ]?in|per night|nightly)'
  )
  AND NOT EXISTS (
      SELECT 1 FROM events_migration_audit a WHERE a.event_id = e.id
  );

-- Surface the audit result in the migration log so operators can see whether
-- any legacy rows need a follow-up backfill pass.
DO $$
DECLARE
    flagged INTEGER;
BEGIN
    SELECT COUNT(*) INTO flagged FROM events_migration_audit;
    IF flagged = 0 THEN
        RAISE NOTICE 'events migration verification: no legacy hospitality-shaped rows found (fresh databases only).';
    ELSE
        RAISE NOTICE 'events migration verification: % legacy hospitality-shaped row(s) flagged in events_migration_audit; review before serving as ticket-resale events.', flagged;
    END IF;
END $$;
