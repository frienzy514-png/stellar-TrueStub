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

export interface ListingRiskResult {
  fingerprint: string;
  duplicate: boolean;
  riskLevel: "low" | "medium" | "high";
  warning?: string;
  matches: Array<{
    id?: string;
    fingerprint: string;
    reason: string;
  }>;
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

export function assessListingRisk(
  candidate: TicketListingRiskInput,
  existingListings: TicketListingRiskInput[],
): ListingRiskResult {
  const fingerprint = ticketListingFingerprint(candidate);
  const matches = existingListings
    .filter((listing) => listing.id !== candidate.id)
    .filter(isActiveListing)
    .map((listing) => ({
      listing,
      fingerprint: ticketListingFingerprint(listing),
    }))
    .filter(({ fingerprint: existingFingerprint }) => existingFingerprint === fingerprint)
    .map(({ listing, fingerprint }) => ({
      id: listing.id,
      fingerprint,
      reason: "same seller, event, section, row, and seat",
    }));

  if (matches.length > 0) {
    return {
      fingerprint,
      duplicate: true,
      riskLevel: "high",
      warning:
        "This ticket appears to match an active listing from the same seller. Review before publishing.",
      matches,
    };
  }

  return {
    fingerprint,
    duplicate: false,
    riskLevel: "low",
    matches: [],
  };
}
