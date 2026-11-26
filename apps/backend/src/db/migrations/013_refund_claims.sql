-- =============================================================================
-- Migration: 013_refund_claims.sql
-- Description: Postgres-backed refund idempotency store (#516). The primary
--              key on refund_id makes insert-first idempotency atomic across
--              restarts and backend instances.
-- =============================================================================

-- Up Migration

CREATE TABLE IF NOT EXISTS refund_claims (
    refund_id  TEXT PRIMARY KEY,
    escrow_id  TEXT NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL,
    record     JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refund_claims_claimed_at
    ON refund_claims(claimed_at);

-- Down Migration

DROP TABLE IF EXISTS refund_claims;
