import { createHash } from "node:crypto";

/**
 * Fraud-detection utilities for ticket listings.
 *
 * Addresses the gap described in issue #47: the README promises protection
 * against duplicate-sold tickets, but nothing in the codebase fingerprints a
 * listing or flags probable duplicates. This module is intentionally
 * transport-agnostic (no DB/Express dependency) so it can be wired into the
 * listing-creation route once `apps/backend` has one, or called from a
 * GraphQL resolver / Hasura action.
 */

export interface ListingCandidate {
  eventId: string;
  sellerId: string;
  section?: string | null;
  seat?: string | null;
  /** ISO date string for the event, used to scope duplicate checks. */
  eventDate?: string | null;
}

export interface ExistingListing extends ListingCandidate {
  id: string;
  /** Only "active" listings should be considered — cancelled/sold ones are ignored by the caller. */
  status: "active" | "sold" | "cancelled" | "expired";
}

export type DuplicateMatchReason = "exact-seat" | "same-section-and-seller" | "same-event-and-seller";

export interface DuplicateMatch {
  listingId: string;
  reason: DuplicateMatchReason;
  /** 0-1 confidence that this is a true duplicate rather than a legitimate multi-ticket seller. */
  confidence: number;
}

export interface DuplicateCheckResult {
  fingerprint: string;
  isProbableDuplicate: boolean;
  matches: DuplicateMatch[];
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Fingerprints a listing from (event, seat/section, seller). Two listings
 * with the same fingerprint are the same ticket listed twice.
 */
export function fingerprintListing(listing: ListingCandidate): string {
  const key = [normalize(listing.eventId), normalize(listing.sellerId), normalize(listing.section), normalize(listing.seat)].join(
    "|",
  );

  return createHash("sha256").update(key).digest("hex");
}

/**
 * Compares a candidate listing against a seller's other active listings and
 * flags probable duplicates.
 *
 * - `exact-seat`: same event + seat/section + seller — near-certain duplicate.
 * - `same-section-and-seller`: same event + section but no seat info to disambiguate.
 * - `same-event-and-seller`: same event, no section/seat overlap — most likely a
 *   legitimate multi-ticket seller (e.g. a season-ticket holder), so it carries
 *   low confidence and should surface only as a soft warning, not a block.
 */
export function checkForDuplicateListing(candidate: ListingCandidate, existingListings: ExistingListing[]): DuplicateCheckResult {
  const fingerprint = fingerprintListing(candidate);
  const activeListings = existingListings.filter((listing) => listing.status === "active");
  const matches: DuplicateMatch[] = [];

  for (const listing of activeListings) {
    if (normalize(listing.eventId) !== normalize(candidate.eventId) || normalize(listing.sellerId) !== normalize(candidate.sellerId)) {
      continue;
    }

    const sameSeat = normalize(listing.seat) !== "" && normalize(listing.seat) === normalize(candidate.seat);
    const sameSection = normalize(listing.section) !== "" && normalize(listing.section) === normalize(candidate.section);

    if (sameSeat && sameSection) {
      matches.push({ listingId: listing.id, reason: "exact-seat", confidence: 0.95 });
    } else if (sameSection) {
      matches.push({ listingId: listing.id, reason: "same-section-and-seller", confidence: 0.6 });
    } else {
      matches.push({ listingId: listing.id, reason: "same-event-and-seller", confidence: 0.2 });
    }
  }

  // Only block/warn on matches with meaningful confidence; low-confidence
  // matches (bulk season-ticket sellers) are returned but not treated as
  // probable duplicates, keeping the false-positive rate low.
  const isProbableDuplicate = matches.some((match) => match.confidence >= 0.5);

  return { fingerprint, isProbableDuplicate, matches };
}
