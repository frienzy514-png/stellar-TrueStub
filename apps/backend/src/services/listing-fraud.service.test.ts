import {
  assessListingRisk,
  ticketListingFingerprint,
  type TicketListingRiskInput,
} from "./listing-fraud.service";

const baseListing: TicketListingRiskInput = {
  id: "listing-1",
  eventName: "TrueStub Live",
  eventDate: "2026-09-12",
  section: "A",
  row: "4",
  seat: "18",
  sellerId: "seller-1",
  status: "active",
};

describe("listing fraud risk checks", () => {
  it("normalizes listing fingerprints across casing and spacing", () => {
    const messyListing = {
      ...baseListing,
      eventName: "  truestub   live ",
      section: " a ",
      row: " 4 ",
      seat: "18",
      sellerId: "SELLER-1",
    };

    expect(ticketListingFingerprint(messyListing)).toBe(
      ticketListingFingerprint(baseListing)
    );
  });

  it("flags active duplicate listings from the same seller", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2" },
      [baseListing],
    );

    expect(result.duplicate).toBe(true);
    expect(result.riskLevel).toBe("high");
    expect(result.matches).toHaveLength(1);
  });

  it("allows different seats for legitimate multi-ticket sellers", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2", seat: "19" },
      [baseListing],
    );

    expect(result.duplicate).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it("ignores inactive historical listings", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2" },
      [{ ...baseListing, status: "sold" }],
    );

    expect(result.duplicate).toBe(false);
  });
});
