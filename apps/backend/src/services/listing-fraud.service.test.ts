import assert from "node:assert/strict";
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

    assert.equal(
      ticketListingFingerprint(messyListing),
      ticketListingFingerprint(baseListing),
    );
  });

  it("flags active duplicate listings from the same seller", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2" },
      [baseListing],
    );

    assert.equal(result.duplicate, true);
    assert.equal(result.riskLevel, "high");
    assert.equal(result.matches.length, 1);
  });

  it("allows different seats for legitimate multi-ticket sellers", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2", seat: "19" },
      [baseListing],
    );

    assert.equal(result.duplicate, false);
    assert.equal(result.matches.length, 0);
  });

  it("ignores inactive historical listings", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2" },
      [{ ...baseListing, status: "sold" }],
    );

    assert.equal(result.duplicate, false);
  });
});
