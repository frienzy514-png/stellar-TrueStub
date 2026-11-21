-- =============================================================================
-- Migration: 012_row_change_audit.sql
-- Description: Database-level row change auditing for money-critical tables
-- (issue #546).
--
-- The write-once changelog only captures events the application deliberately
-- writes. A direct manual edit (an operator fixing a stuck dispute in psql, a
-- one-off script, a Hasura console edit) bypasses it entirely. These triggers
-- record every UPDATE and DELETE (and TRUNCATE) on the audited tables at the
-- database level, independent of application code.
--
-- Audited tables: disputes, ownership_transfers, transfers, refunds. Some of
-- these are still in-memory or Hasura-managed and may not exist yet, so the
-- trigger is attached only to tables that exist. When a persistence migration
-- creates one of them later, it must call:
--
--     SELECT attach_row_change_audit('<table_name>');
--
-- Application writes can label themselves by running
--     SET LOCAL truestub.change_source = 'application';
-- inside their transaction. Rows without that label are recorded with
-- change_source = 'direct', which is what flags a manual edit.
-- =============================================================================

-- Up Migration

CREATE TABLE IF NOT EXISTS row_change_audit (
    id              BIGSERIAL PRIMARY KEY,
    table_name      TEXT        NOT NULL,
    operation       TEXT        NOT NULL CHECK (operation IN ('UPDATE', 'DELETE', 'TRUNCATE')),
    row_pk          TEXT,
    old_row         JSONB,
    new_row         JSONB,
    changed_columns TEXT[],
    change_source   TEXT        NOT NULL DEFAULT 'direct',
    db_user         TEXT        NOT NULL DEFAULT current_user,
    session_user_name TEXT      NOT NULL DEFAULT session_user,
    application_name TEXT,
    client_addr     INET,
    txid            BIGINT      NOT NULL DEFAULT txid_current(),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_row_change_audit_table_pk
    ON row_change_audit (table_name, row_pk, changed_at);
CREATE INDEX IF NOT EXISTS idx_row_change_audit_source
    ON row_change_audit (change_source, changed_at);

-- The audit trail itself is append-only: block edits and deletes of audit rows.
CREATE OR REPLACE FUNCTION row_change_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ROW_CHANGE_AUDIT_IMMUTABLE: row_change_audit is append-only'
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_row_change_audit_immutable ON row_change_audit;
CREATE TRIGGER trg_row_change_audit_immutable
    BEFORE UPDATE OR DELETE ON row_change_audit
    FOR EACH ROW
    EXECUTE FUNCTION row_change_audit_immutable();

DROP TRIGGER IF EXISTS trg_row_change_audit_no_truncate ON row_change_audit;
CREATE TRIGGER trg_row_change_audit_no_truncate
    BEFORE TRUNCATE ON row_change_audit
    FOR EACH STATEMENT
    EXECUTE FUNCTION row_change_audit_immutable();

-- Row-level capture for UPDATE / DELETE.
CREATE OR REPLACE FUNCTION record_row_change()
RETURNS TRIGGER AS $$
DECLARE
    old_json JSONB := to_jsonb(OLD);
    new_json JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END;
    changed  TEXT[];
    pk_value TEXT;
    source   TEXT  := COALESCE(NULLIF(current_setting('truestub.change_source', true), ''), 'direct');
BEGIN
    -- Primary-key column names differ per table (id, dispute_id, transfer_id,
    -- ...), so resolve them from the catalog. Composite keys are joined by ':'.
    SELECT string_agg(old_json ->> a.attname, ':' ORDER BY array_position(i.indkey::int2[], a.attnum))
      INTO pk_value
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = TG_RELID AND i.indisprimary;

    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(o.key ORDER BY o.key)
          INTO changed
          FROM jsonb_each(old_json) AS o
         WHERE new_json -> o.key IS DISTINCT FROM o.value;

        -- A no-op UPDATE (no column actually changed) is not worth recording.
        IF changed IS NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO row_change_audit
        (table_name, operation, row_pk, old_row, new_row, changed_columns,
         change_source, application_name, client_addr)
    VALUES
        (TG_TABLE_NAME, TG_OP, COALESCE(pk_value, old_json ->> 'id'), old_json, new_json, changed,
         source, current_setting('application_name', true), inet_client_addr());

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Statement-level capture for TRUNCATE (row triggers do not fire for it).
CREATE OR REPLACE FUNCTION record_table_truncate()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO row_change_audit
        (table_name, operation, change_source, application_name, client_addr)
    VALUES
        (TG_TABLE_NAME, 'TRUNCATE',
         COALESCE(NULLIF(current_setting('truestub.change_source', true), ''), 'direct'),
         current_setting('application_name', true), inet_client_addr());
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach the audit triggers to a table. Idempotent; a no-op if the table does
-- not exist yet. Persistence migrations call this after creating the table.
CREATE OR REPLACE FUNCTION attach_row_change_audit(target_table TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
        RETURN FALSE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_row_change_audit ON public.%I', target_table);
    EXECUTE format(
        'CREATE TRIGGER trg_row_change_audit
            AFTER UPDATE OR DELETE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION record_row_change()',
        target_table
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_row_change_audit_truncate ON public.%I', target_table);
    EXECUTE format(
        'CREATE TRIGGER trg_row_change_audit_truncate
            AFTER TRUNCATE ON public.%I
            FOR EACH STATEMENT EXECUTE FUNCTION record_table_truncate()',
        target_table
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION detach_row_change_audit(target_table TEXT)
RETURNS VOID AS $$
BEGIN
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
        RETURN;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_row_change_audit ON public.%I', target_table);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_row_change_audit_truncate ON public.%I', target_table);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    audited_table TEXT;
BEGIN
    FOREACH audited_table IN ARRAY ARRAY['disputes', 'ownership_transfers', 'transfers', 'refunds'] LOOP
        PERFORM attach_row_change_audit(audited_table);
    END LOOP;
END;
$$;

-- Down Migration

DO $$
DECLARE
    audited_table TEXT;
BEGIN
    FOREACH audited_table IN ARRAY ARRAY['disputes', 'ownership_transfers', 'transfers', 'refunds'] LOOP
        PERFORM detach_row_change_audit(audited_table);
    END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS attach_row_change_audit(TEXT);
DROP FUNCTION IF EXISTS detach_row_change_audit(TEXT);
DROP FUNCTION IF EXISTS record_table_truncate();
DROP FUNCTION IF EXISTS record_row_change();
DROP TRIGGER IF EXISTS trg_row_change_audit_no_truncate ON row_change_audit;
DROP TRIGGER IF EXISTS trg_row_change_audit_immutable ON row_change_audit;
DROP TABLE IF EXISTS row_change_audit;
DROP FUNCTION IF EXISTS row_change_audit_immutable();
