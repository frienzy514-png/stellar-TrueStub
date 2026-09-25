-- =============================================================================
-- Migration: 001_create_ratings_reviews.sql
-- Description: Minimal rating and review schema for buyer/seller reputation
-- Run via node-pg-migrate: `yarn workspace @truestub/backend migrate:up`
-- =============================================================================

-- Up Migration

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_id VARCHAR(255) NOT NULL,
    reviewer_id VARCHAR(255) NOT NULL,
    reviewer_name VARCHAR(255),
    reviewee_id VARCHAR(255) NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    role VARCHAR(50) NOT NULL CHECK (role IN ('buyer', 'seller', 'tenant', 'owner')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_escrow_reviewer UNIQUE (escrow_id, reviewer_id)
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_escrow_id ON reviews(escrow_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- View to compute aggregate reputation metrics for users
CREATE OR REPLACE VIEW user_reputation_summary AS
SELECT 
    reviewee_id AS user_id,
    COUNT(*)::INTEGER AS total_reviews,
    ROUND(AVG(rating)::NUMERIC, 2)::FLOAT AS average_rating,
    COUNT(*) FILTER (WHERE rating = 5)::INTEGER AS five_star_count,
    COUNT(*) FILTER (WHERE rating = 4)::INTEGER AS four_star_count,
    COUNT(*) FILTER (WHERE rating = 3)::INTEGER AS three_star_count,
    COUNT(*) FILTER (WHERE rating = 2)::INTEGER AS two_star_count,
    COUNT(*) FILTER (WHERE rating = 1)::INTEGER AS one_star_count,
    ROUND((COUNT(*) FILTER (WHERE rating >= 4)::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC, 1)::FLOAT AS positive_percentage
FROM reviews
GROUP BY reviewee_id;

-- Down Migration

DROP VIEW IF EXISTS user_reputation_summary;
DROP TABLE IF EXISTS reviews;
