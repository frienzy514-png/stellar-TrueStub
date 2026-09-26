import { fingerprintListing, checkForDuplicateListing, type ExistingListing } from "./fraud-detection";

describe("fingerprintListing", () => {
  it("produces the same fingerprint for the same event/seat/seller regardless of casing", () => {
    const a = fingerprintListing({ eventId: "evt-1", sellerId: "seller-1", section: "A", seat: "12" });
    const b = fingerprintListing({ eventId: "EVT-1", sellerId: "Seller-1", section: "a", seat: "12" });
    expect(a).toBe(b);
  });

  it("produces a different fingerprint for a different seat", () => {
    const a = fingerprintListing({ eventId: "evt-1", sellerId: "seller-1", section: "A", seat: "12" });
    const b = fingerprintListing({ eventId: "evt-1", sellerId: "seller-1", section: "A", seat: "13" });
    expect(a).not.toBe(b);
  });
});

describe("checkForDuplicateListing", () => {
  const existing: ExistingListing[] = [
    { id: "listing-1", eventId: "evt-1", sellerId: "seller-1", section: "A", seat: "12", status: "active" },
    { id: "listing-2", eventId: "evt-1", sellerId: "seller-1", section: "B", seat: "1", status: "active" },
    { id: "listing-3", eventId: "evt-1", sellerId: "seller-1", section: "A", seat: "12", status: "sold" },
  ];

  it("flags an exact seat match as a probable duplicate", () => {
    const result = checkForDuplicateListing(
      { eventId: "evt-1", sellerId: "seller-1", section: "A", seat: "12" },
      existing,
    );
    expect(result.isProbableDuplicate).toBe(true);
    expect(result.matches[0].reason).toBe("exact-seat");
  });

  it("ignores non-active listings", () => {
    const result = checkForDuplicateListing(
      { eventId: "evt-1", sellerId: "seller-1", section: "A", seat: "12" },
      existing.filter((listing) => listing.id === "listing-3"),
    );
    expect(result.matches).toHaveLength(0);
    expect(result.isProbableDuplicate).toBe(false);
  });

  it("does not flag a different seller listing the same seat", () => {
    const result = checkForDuplicateListing(
      { eventId: "evt-1", sellerId: "seller-2", section: "A", seat: "12" },
      existing,
    );
    expect(result.matches).toHaveLength(0);
  });

  it("gives a low-confidence, non-blocking match for a season-ticket-style seller with no seat overlap", () => {
    const result = checkForDuplicateListing(
      { eventId: "evt-1", sellerId: "seller-1", section: "C", seat: "5" },
      existing,
    );
    expect(result.isProbableDuplicate).toBe(false);
    expect(result.matches.every((match) => match.confidence < 0.5)).toBe(true);
  });
});
