-- =============================================================================
-- Migration: 011_verify_events_key_integrity.sql
-- Description: Verify (and where safe, repair) the `events` primary key and
--              every foreign key that references `events` / legacy `hotels`
--              after the 002/003/006 rename history (issue #542).
--
-- Numbered 011 because open PR #683 already claims 010.
--
-- What this checks, in order:
--
--   1. public.events exists. Fresh databases where the table is still owned by
--      Hasura and hasn't been created yet are recorded as 'skipped'.
--   2. A legacy public.hotels table does NOT still exist next to events (a
--      sign that two different rename variants ran). Reported, not dropped —
--      dropping data is out of scope for a migration.
--   3. public.events has a primary key. Missing => the migration FAILS,
--      because every FK to events depends on it.
--   4. The primary key is named events_pkey. A leftover hotels_pkey is renamed
--      (same idempotent fix as 006, re-applied in case 006 was skipped or
--      recorded without running).
--   5. Every FK constraint whose target is public.events is validated. FKs
--      created NOT VALID (or left unvalidated by a rename variant) are run
--      through ALTER TABLE … VALIDATE CONSTRAINT, which FAILS the migration
--      with the offending constraint name if any row is dangling.
--   6. No FK constraint still targets public.hotels. Reported.
--   7. FK constraints on events whose names still say "hotel" are reported
--      (cosmetic; Postgres keeps constraint names across a table rename).
--
-- Note on ticket_listings: 004_create_ticket_listings.sql does NOT declare a
-- foreign key to events — listings carry their own name/location columns. The
-- report records whether ticket_listings has an `event_id` column and whether
-- it is constrained, so the absence of an FK is documented rather than
-- assumed.
--
-- The result is written to migration_verification_reports (created by 004)
-- and echoed via RAISE NOTICE so it appears in the migrate:up output. The same
-- checks are available read-only in apps/backend/scripts/check-migration-state.sql
-- (sections 6–8) for environments that should not be migrated yet.
-- =============================================================================

-- Up Migration

DO $$
DECLARE
    v_events         regclass := to_regclass('public.events');
    v_hotels         regclass := to_regclass('public.hotels');
    v_pk_name        text;
    v_fk             record;
    v_fk_total       integer := 0;
    v_fk_validated   text[] := ARRAY[]::text[];
    v_fk_to_hotels   text[] := ARRAY[]::text[];
    v_fk_hotel_named text[] := ARRAY[]::text[];
    v_pk_renamed     boolean := false;
    v_listing_col    boolean := false;
    v_listing_fk     boolean := false;
    v_status         text;
BEGIN
    -- 1. events must exist for anything else to be meaningful.
    IF v_events IS NULL THEN
        RAISE NOTICE '[011] public.events does not exist; nothing to verify.';
        IF to_regclass('public.migration_verification_reports') IS NOT NULL THEN
            INSERT INTO public.migration_verification_reports (migration, details)
            VALUES (
                '011_verify_events_key_integrity',
                jsonb_build_object('status', 'skipped', 'reason', 'public.events does not exist')
            );
        END IF;
        RETURN;
    END IF;

    -- 3. Primary key must exist.
    SELECT c.conname INTO v_pk_name
    FROM pg_constraint c
    WHERE c.conrelid = v_events AND c.contype = 'p';

    IF v_pk_name IS NULL THEN
        RAISE EXCEPTION
            '[011] public.events has no primary key; foreign keys to events cannot be trusted. Restore the primary key before re-running migrations.';
    END IF;

    -- 4. Normalize a leftover hotels_pkey name.
    IF v_pk_name = 'hotels_pkey' THEN
        ALTER TABLE public.events RENAME CONSTRAINT hotels_pkey TO events_pkey;
        v_pk_name := 'events_pkey';
        v_pk_renamed := true;
    END IF;

    -- 5. Validate every FK that targets events.
    FOR v_fk IN
        SELECT c.conname,
               c.conrelid::regclass AS source_table,
               c.convalidated
        FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = v_events
        ORDER BY c.conrelid::regclass::text, c.conname
    LOOP
        v_fk_total := v_fk_total + 1;

        IF NOT v_fk.convalidated THEN
            BEGIN
                EXECUTE format(
                    'ALTER TABLE %s VALIDATE CONSTRAINT %I',
                    v_fk.source_table, v_fk.conname
                );
                v_fk_validated := v_fk_validated || format('%s.%s', v_fk.source_table, v_fk.conname);
            EXCEPTION WHEN foreign_key_violation THEN
                RAISE EXCEPTION
                    '[011] foreign key %.% references rows missing from public.events (dangling reference). Fix or remove the orphaned rows, then re-run migrate:up.',
                    v_fk.source_table, v_fk.conname;
            END;
        END IF;

        -- 7. Constraint names that still carry the legacy domain.
        IF v_fk.conname ILIKE '%hotel%' THEN
            v_fk_hotel_named := v_fk_hotel_named || format('%s.%s', v_fk.source_table, v_fk.conname);
        END IF;
    END LOOP;

    -- 6. Any FK still pointing at a legacy hotels table.
    IF v_hotels IS NOT NULL THEN
        SELECT coalesce(array_agg(format('%s.%s', c.conrelid::regclass, c.conname)), ARRAY[]::text[])
        INTO v_fk_to_hotels
        FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = v_hotels;
    END IF;

    -- ticket_listings → events: document the (expected) absence of an FK.
    IF to_regclass('public.ticket_listings') IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM pg_attribute
            WHERE attrelid = 'public.ticket_listings'::regclass
              AND attname = 'event_id' AND NOT attisdropped
        ) INTO v_listing_col;

        SELECT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE contype = 'f'
              AND conrelid = 'public.ticket_listings'::regclass
              AND confrelid = v_events
        ) INTO v_listing_fk;
    END IF;

    v_status := CASE
        WHEN v_hotels IS NOT NULL OR cardinality(v_fk_to_hotels) > 0
             OR (v_listing_col AND NOT v_listing_fk)
            THEN 'needs_review'
        ELSE 'consistent'
    END;

    RAISE NOTICE '[011] events integrity: status=% pk=% pk_renamed=% fks_to_events=% newly_validated=% fks_to_hotels=% hotel_named_fks=% legacy_hotels_table=% ticket_listings.event_id=% ticket_listings_fk=%',
        v_status, v_pk_name, v_pk_renamed, v_fk_total, v_fk_validated,
        v_fk_to_hotels, v_fk_hotel_named, v_hotels IS NOT NULL,
        v_listing_col, v_listing_fk;

    IF to_regclass('public.migration_verification_reports') IS NOT NULL THEN
        INSERT INTO public.migration_verification_reports (migration, details)
        VALUES (
            '011_verify_events_key_integrity',
            jsonb_build_object(
                'status', v_status,
                'events_pk_name', v_pk_name,
                'events_pk_renamed', v_pk_renamed,
                'fks_referencing_events', v_fk_total,
                'fks_newly_validated', to_jsonb(v_fk_validated),
                'fks_referencing_hotels', to_jsonb(v_fk_to_hotels),
                'fks_with_hotel_in_name', to_jsonb(v_fk_hotel_named),
                'legacy_hotels_table_present', v_hotels IS NOT NULL,
                'ticket_listings_has_event_id', v_listing_col,
                'ticket_listings_fk_to_events', v_listing_fk,
                'note', 'needs_review means a legacy hotels table/FK still exists or ticket_listings.event_id is unconstrained; see docs/DATABASE.md "Events key and foreign-key integrity".'
            )
        );
    END IF;
END
$$;

-- Down Migration
--
-- Only the report rows are removed. The events_pkey rename and any FK
-- validation are intentionally not reversed: undoing them would reintroduce
-- the inconsistency this migration checks for (same reasoning as 006).

DO $$
BEGIN
    IF to_regclass('public.migration_verification_reports') IS NOT NULL THEN
        DELETE FROM public.migration_verification_reports
        WHERE migration = '011_verify_events_key_integrity';
    END IF;
END
$$;
