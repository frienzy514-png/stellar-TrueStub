-- =============================================================================
-- Migration: 010_persistent_state_stores.sql
-- Description: Replace the in-memory stores for disputes, ownership transfers
--              and webhook delivery dedup with Postgres-backed tables.
--
-- Issues: #515 (disputes), #517 (ownership transfers), #518 (webhook dedup).
--
-- All statements are idempotent so the migration can be re-applied safely.
-- =============================================================================

-- Up Migration

-- ---------------------------------------------------------------------------
-- Disputes (#515)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
    dispute_id   TEXT PRIMARY KEY,
    escrow_id    TEXT NOT NULL,
    raised_by    TEXT NOT NULL,
    reason       TEXT NOT NULL,
    state        TEXT NOT NULL
        CHECK (state IN ('OPEN', 'ESCALATED', 'RESOLVED', 'WITHDRAWN')),
    opened_at    TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    escalated_at TIMESTAMPTZ,
    resolved_at  TIMESTAMPTZ,
    resolution   TEXT
);

CREATE INDEX IF NOT EXISTS idx_disputes_escrow_id
    ON disputes(escrow_id);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_by_opened_at
    ON disputes(raised_by, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_state
    ON disputes(state);

-- ---------------------------------------------------------------------------
-- Ownership transfers (#517)
-- ---------------------------------------------------------------------------
-- transfer_id is the idempotency key: the UNIQUE constraint is what makes a
-- duplicate/concurrent initiate fail atomically across every backend instance
-- (no in-process lock required).
CREATE TABLE IF NOT EXISTS ownership_transfers (
    transfer_id  TEXT PRIMARY KEY,
    escrow_id    TEXT NOT NULL,
    from_owner   TEXT NOT NULL,
    to_owner     TEXT NOT NULL,
    state        TEXT NOT NULL
        CHECK (state IN ('PENDING', 'ACCEPTED', 'CANCELLED')),
    initiated_at TIMESTAMPTZ NOT NULL,
    finalized_at TIMESTAMPTZ,
    CONSTRAINT ownership_transfers_transfer_id_unique UNIQUE (transfer_id)
);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_escrow_id
    ON ownership_transfers(escrow_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_state
    ON ownership_transfers(state);

-- ---------------------------------------------------------------------------
-- Processed webhook deliveries (#518)
-- ---------------------------------------------------------------------------
-- One row per dedup key. The primary key (and its unique index) is the
-- authoritative cross-instance dedup guard; old rows are pruned by the
-- scheduled cleanup job in routes/webhooks.ts.
CREATE TABLE IF NOT EXISTS processed_webhook_events (
    dedup_key    TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
    ON processed_webhook_events(processed_at);

-- Down Migration

DROP TABLE IF EXISTS processed_webhook_events;
DROP TABLE IF EXISTS ownership_transfers;
DROP TABLE IF EXISTS disputes;
