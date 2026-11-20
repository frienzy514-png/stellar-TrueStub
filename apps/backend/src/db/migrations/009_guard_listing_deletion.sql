-- =============================================================================
-- Migration: 009_guard_listing_deletion.sql
-- Description: Protect ticket listing history on delete and remove inert,
-- listing-specific dependents. Escrow/dispute schemas are owned outside this
-- migration set, so inspect their row JSON rather than assuming every column.
-- =============================================================================

-- Up Migration

CREATE OR REPLACE FUNCTION guard_ticket_listing_delete()
RETURNS TRIGGER AS $$
DECLARE
    has_reference BOOLEAN := FALSE;
    dependent_table TEXT;
BEGIN
    -- Listing ids have historically used more than one representation. Compare
    -- the serialized listing_id/listing_name where present so this guard also
    -- works for externally-managed escrow tables without adding a lossy FK.
    FOREACH dependent_table IN ARRAY ARRAY[
        'escrow_transactions',
        'ticket_escrow_transactions',
        'escrows'
    ] LOOP
        IF to_regclass(format('public.%I', dependent_table)) IS NOT NULL THEN
            EXECUTE format(
                'SELECT EXISTS (
                    SELECT 1 FROM public.%I AS e
                    WHERE (to_jsonb(e)->>''listing_id'' = $1
                           OR to_jsonb(e)->>''listing_name'' = $2)
                )',
                dependent_table
            ) INTO has_reference USING OLD.id::text, OLD.name;
            IF has_reference THEN
                RAISE EXCEPTION
                    'LISTING_DELETE_BLOCKED: listing % is referenced by an escrow; resolve and retain escrow history before deleting it',
                    OLD.id USING ERRCODE = 'foreign_key_violation';
            END IF;
        END IF;
    END LOOP;

    -- Disputes may point directly at a listing or indirectly through an escrow.
    -- Preserve every dispute, including resolved/withdrawn records, so deleting
    -- a listing cannot leave its audit history detached.
    IF to_regclass('public.disputes') IS NOT NULL THEN
        EXECUTE $query$
            SELECT EXISTS (
                SELECT 1
                  FROM public.disputes AS d
                 WHERE to_jsonb(d)->>'listing_id' = $1
                    OR to_jsonb(d)->>'listing_name' = $2
            )
        $query$ INTO has_reference USING OLD.id::text, OLD.name;
        IF has_reference THEN
            RAISE EXCEPTION
                'LISTING_DELETE_BLOCKED: listing % is referenced by a dispute; retain the listing until dispute history is no longer attached',
                OLD.id USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    -- Watchlist price tracking and other optional relational dependents are
    -- inert after deletion. Delete only records that explicitly carry this
    -- listing id; saved-search rules without listing_id remain reusable.
    FOREACH dependent_table IN ARRAY ARRAY[
        'watchlist_price_tracking',
        'listing_alerts',
        'saved_searches'
    ] LOOP
        IF to_regclass(format('public.%I', dependent_table)) IS NOT NULL
           AND EXISTS (
               SELECT 1 FROM pg_attribute
                WHERE attrelid = to_regclass(format('public.%I', dependent_table))
                  AND attname = 'listing_id'
                  AND NOT attisdropped
           ) THEN
            EXECUTE format(
                'DELETE FROM public.%I WHERE listing_id::text = $1',
                dependent_table
            ) USING OLD.id::text;
        END IF;
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_ticket_listing_delete ON ticket_listings;
CREATE TRIGGER trg_guard_ticket_listing_delete
    BEFORE DELETE ON ticket_listings
    FOR EACH ROW
    EXECUTE FUNCTION guard_ticket_listing_delete();

-- Down Migration
DROP TRIGGER IF EXISTS trg_guard_ticket_listing_delete ON ticket_listings;
DROP FUNCTION IF EXISTS guard_ticket_listing_delete();
