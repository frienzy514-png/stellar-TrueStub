-- =============================================================================
-- Migration: 002_create_notifications.sql
-- Description: In-app notification feed backing /dashboard/notifications.
--
-- Shape matches what the backend already writes via
-- HasuraService.insertNotification (user_id / type / title / message / read).
-- user_id is TEXT because it holds the Firebase UID, not a UUID.
--
-- Hasura permissions (role: user):
--   select / update(read) — filter: { user_id: { _eq: X-Hasura-User-Id } }
-- Inserts come from the backend with the admin secret only.
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
