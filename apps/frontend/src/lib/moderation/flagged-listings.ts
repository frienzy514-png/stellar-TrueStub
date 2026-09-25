export type FlagSource = "user_report" | "duplicate_detection" | "fraud_detection";
export type ModerationStatus = "pending" | "approved" | "removed";

export interface FlaggedListing {
  id: string;
  listingId: string;
  eventName: string;
  sellerId: string;
  price: number;
  source: FlagSource;
  reason: string;
  flaggedAt: string;
  status: ModerationStatus;
}

export const FLAG_SOURCE_LABEL: Record<FlagSource, string> = {
  user_report: "User report",
  duplicate_detection: "Duplicate listing",
  fraud_detection: "Fraud detection",
};

/**
 * Seed data until the moderation endpoints are wired to the backend
 * (see backend/src/services/listing-fraud.service.ts for the detector that
 * will feed this queue).
 */
export const INITIAL_FLAGGED_LISTINGS: FlaggedListing[] = [
  {
    id: "flag-1",
    listingId: "lst-1042",
    eventName: "Coldplay — West Floor",
    sellerId: "usr-8841",
    price: 405,
    source: "duplicate_detection",
    reason: "Same seat listed by 2 sellers",
    flaggedAt: "2026-09-22T10:14:00Z",
    status: "pending",
  },
  {
    id: "flag-2",
    listingId: "lst-1077",
    eventName: "Burna Boy — VIP",
    sellerId: "usr-2210",
    price: 90,
    source: "fraud_detection",
    reason: "Price far below face value; new seller account",
    flaggedAt: "2026-09-23T08:40:00Z",
    status: "pending",
  },
  {
    id: "flag-3",
    listingId: "lst-1093",
    eventName: "Wizkid — Section B",
    sellerId: "usr-5567",
    price: 310,
    source: "user_report",
    reason: "Reported: ticket image appears edited",
    flaggedAt: "2026-09-23T15:02:00Z",
    status: "pending",
  },
];

/** Returns a new list with the given flag resolved; unknown ids are a no-op. */
export function resolveFlag(
  flags: FlaggedListing[],
  id: string,
  decision: Exclude<ModerationStatus, "pending">,
): FlaggedListing[] {
  return flags.map((f) => (f.id === id ? { ...f, status: decision } : f));
}
