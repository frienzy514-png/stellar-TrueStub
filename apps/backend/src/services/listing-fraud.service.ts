export interface TicketListingRiskInput {
  id?: string;
  eventName: string;
  eventDate?: string;
  section?: string;
  row?: string;
  seat?: string;
  sellerId: string;
  status?: string;
}

export interface ListingRiskMatch {
  id?: string;
  fingerprint: string;
  reason: string;
  confidence: number;
}

export interface ListingRiskResult {
  fingerprint: string;
  duplicate: boolean;
  riskLevel: "low" | "medium" | "high";
  warning?: string;
  matches: ListingRiskMatch[];
}

const ACTIVE_STATUSES = new Set(["active", "pending", "reserved"]);

function normalize(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSeat(value: string | undefined): string {
  return normalize(value).replace(/[^a-z0-9-]/g, "");
}

export function ticketListingFingerprint(listing: TicketListingRiskInput): string {
  const parts = [
    normalize(listing.eventName),
    normalize(listing.eventDate),
    normalizeSeat(listing.section),
    normalizeSeat(listing.row),
    normalizeSeat(listing.seat),
    normalize(listing.sellerId),
  ];

  return parts.join("|");
}

export function isActiveListing(listing: TicketListingRiskInput): boolean {
  return ACTIVE_STATUSES.has(normalize(listing.status) || "active");
}

/**
 * Assesses fraud risk for a candidate listing against a seller's existing
 * active listings.
 *
 * Match tiers (merged from fraud-detection.ts #371/#372):
 *  - exact fingerprint match       → high risk, duplicate=true,  confidence 0.95
 *  - same section+seller+event,
 *    different row/seat             → medium risk, duplicate=false, confidence 0.6
 *  - same event+seller, no section/
 *    seat overlap (e.g. season-
 *    ticket holder)                 → low risk, soft warning only, confidence 0.2
 */
export function assessListingRisk(
  candidate: TicketListingRiskInput,
  existingListings: TicketListingRiskInput[],
): ListingRiskResult {
  const fingerprint = ticketListingFingerprint(candidate);
  const actives = existingListings
    .filter((l) => l.id !== candidate.id)
    .filter(isActiveListing);

  // ── Tier 1: exact fingerprint match ───────────────────────────────────────
  const exactMatches: ListingRiskMatch[] = actives
    .map((l) => ({ listing: l, fp: ticketListingFingerprint(l) }))
    .filter(({ fp }) => fp === fingerprint)
    .map(({ listing, fp }) => ({
      id: listing.id,
      fingerprint: fp,
      reason: "same seller, event, section, row, and seat",
      confidence: 0.95,
    }));

  if (exactMatches.length > 0) {
    return {
      fingerprint,
      duplicate: true,
      riskLevel: "high",
      warning:
        "This ticket appears to match an active listing from the same seller. Review before publishing.",
      matches: exactMatches,
    };
  }

  // ── Tier 2: same event+seller+section, different row/seat ─────────────────
  const sectionMatches: ListingRiskMatch[] = actives
    .filter((l) => {
      const sameEvent = normalize(l.eventName) === normalize(candidate.eventName);
      const sameSeller = normalize(l.sellerId) === normalize(candidate.sellerId);
      const sameSection =
        normalizeSeat(l.section) !== "" &&
        normalizeSeat(l.section) === normalizeSeat(candidate.section);
      return sameEvent && sameSeller && sameSection;
    })
    .map((l) => ({
      id: l.id,
      fingerprint: ticketListingFingerprint(l),
      reason: "same seller, event, and section — different row or seat",
      confidence: 0.6,
    }));

  if (sectionMatches.length > 0) {
    return {
      fingerprint,
      duplicate: false,
      riskLevel: "medium",
      warning:
        "This ticket is from the same seller and section as an existing listing. Verify it is a different seat.",
      matches: sectionMatches,
    };
  }

  // ── Tier 3: same event+seller, no section/seat overlap ────────────────────
  const softMatches: ListingRiskMatch[] = actives
    .filter((l) => {
      const sameEvent = normalize(l.eventName) === normalize(candidate.eventName);
      const sameSeller = normalize(l.sellerId) === normalize(candidate.sellerId);
      return sameEvent && sameSeller;
    })
    .map((l) => ({
      id: l.id,
      fingerprint: ticketListingFingerprint(l),
      reason: "same seller and event — no section or seat overlap",
      confidence: 0.2,
    }));

  if (softMatches.length > 0) {
    return {
      fingerprint,
      duplicate: false,
      riskLevel: "low",
      warning:
        "This seller has other active listings for the same event. Likely legitimate but worth a quick review.",
      matches: softMatches,
    };
  }

  return {
    fingerprint,
    duplicate: false,
    riskLevel: "low",
    matches: [],
  };
}

// ── Seller-level escalation (#555) ─────────────────────────────────────────
//
// Single listings are assessed by `assessListingRisk`. A seller whose listings
// keep tripping high-risk detection needs an account-level response, so this
// layer turns a seller's recent detection history into a recommended action:
//
//   count of high-risk detections in the window  →  action
//   >= SELLER_FRAUD_ESCALATION_THRESHOLDS.review    →  "flag_for_review"
//   >= SELLER_FRAUD_ESCALATION_THRESHOLDS.suspend   →  "suspend_pending_review"
//   otherwise                                       →  "none"
//
// The function is pure: it does not read or write storage and does not change
// any account. Callers record each high-risk detection, call this function with
// that seller's history, and act on the result. "suspend_pending_review" means
// the seller's new listings should be held until an admin reviews the account;
// it is not a final ban. Final account action stays a manual admin decision.

export interface SellerFraudEscalationThresholds {
  /** High-risk detections within the window before a seller is flagged for review. */
  review: number;
  /** High-risk detections within the window before new listings are held. */
  suspend: number;
  /** Rolling window, in days, over which detections are counted. */
  windowDays: number;
}

export const SELLER_FRAUD_ESCALATION_THRESHOLDS: SellerFraudEscalationThresholds = {
  review: 3,
  suspend: 5,
  windowDays: 30,
};

export type SellerEscalationAction = "none" | "flag_for_review" | "suspend_pending_review";

export interface SellerFraudDetection {
  sellerId: string;
  riskLevel: ListingRiskResult["riskLevel"];
  /** ISO timestamp or Date of when the detection happened. */
  detectedAt: string | Date;
}

export interface SellerFraudEscalation {
  sellerId: string;
  action: SellerEscalationAction;
  /** High-risk detections counted inside the window. */
  highRiskCount: number;
  windowDays: number;
}

/**
 * Decides whether a seller's recent detection history needs escalation.
 * Only `riskLevel: "high"` detections count. Detections for other sellers, and
 * detections older than the window, are ignored.
 */
export function evaluateSellerFraudEscalation(
  sellerId: string,
  detections: SellerFraudDetection[],
  now: Date = new Date(),
  thresholds: SellerFraudEscalationThresholds = SELLER_FRAUD_ESCALATION_THRESHOLDS,
): SellerFraudEscalation {
  const windowStart = now.getTime() - thresholds.windowDays * 24 * 60 * 60 * 1000;

  const highRiskCount = detections.filter((d) => {
    if (d.sellerId !== sellerId || d.riskLevel !== "high") return false;
    const at = new Date(d.detectedAt).getTime();
    return Number.isFinite(at) && at >= windowStart && at <= now.getTime();
  }).length;

  let action: SellerEscalationAction = "none";
  if (highRiskCount >= thresholds.suspend) {
    action = "suspend_pending_review";
  } else if (highRiskCount >= thresholds.review) {
    action = "flag_for_review";
  }

  return { sellerId, action, highRiskCount, windowDays: thresholds.windowDays };
}
