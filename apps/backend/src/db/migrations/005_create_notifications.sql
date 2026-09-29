-- =============================================================================
-- Migration: 005_create_notifications.sql
-- Description: In-app notification feed backing /dashboard/notifications.
--
-- This migration was originally numbered 002. It is repeated at a unique
-- version because deployed databases have already recorded the original name;
-- all statements are idempotent so existing installations can safely apply it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id) WHERE read = FALSE;

CREATE TABLE IF NOT EXISTS watchlist_price_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    listing_id UUID NOT NULL,
    saved_price NUMERIC(14, 2) NOT NULL,
    last_notified_price NUMERIC(14, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_price_tracking_listing
    ON watchlist_price_tracking(listing_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_price_tracking_user
    ON watchlist_price_tracking(user_id);