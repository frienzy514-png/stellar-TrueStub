-- =============================================================================
-- Migration: 004_create_ticket_listings.sql
-- Description: Ticket listings + offers backing /dashboard/listings.
--
-- Columns match what the frontend already queries (GET_TICKET_LISTINGS) plus
-- the fields collected by NewListingForm. listing_offers cascades on delete so
-- removing a listing also removes its offers.
--
-- Hasura permissions (role: user):
--   select  — all rows
--   insert  — check { owner_id: { _eq: X-Hasura-User-Id } }
--   delete  — filter: { owner_id: { _eq: X-Hasura-User-Id } }
-- Relationship: ticket_listings.listing_offers (array, listing_offers.listing_id)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ticket_listings (
    id SERIAL PRIMARY KEY,
    owner_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    details TEXT,
    bedrooms INTEGER,
    bathrooms INTEGER,
    pet_friendly BOOLEAN NOT NULL DEFAULT FALSE,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    ticket_quantity INTEGER NOT NULL DEFAULT 1 CHECK (ticket_quantity >= 1),
    allow_partial_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    bundle_price NUMERIC(12, 2) CHECK (bundle_price >= 0),
    promotion_percent INTEGER NOT NULL DEFAULT 0
        CHECK (promotion_percent >= 0 AND promotion_percent <= 100),
    promoted BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'unavailable')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_offers (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL REFERENCES ticket_listings(id) ON DELETE CASCADE,
    buyer_name VARCHAR(255),
    buyer_phone VARCHAR(50),
    buyer_wallet_address VARCHAR(255),
    offer_date TIMESTAMPTZ,
    bid_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_listings_owner_id ON ticket_listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_ticket_listings_created_at ON ticket_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_offers_listing_id ON listing_offers(listing_id);
