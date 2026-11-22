import assert from "node:assert/strict";
import {
  assessListingRisk,
  ticketListingFingerprint,
  isActiveListing,
  evaluateSellerFraudEscalation,
  SELLER_FRAUD_ESCALATION_THRESHOLDS,
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
  // ── Fingerprint normalisation ──────────────────────────────────────────────

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

  // ── Tier 1: exact duplicate (high) ────────────────────────────────────────

  it("flags active duplicate listings from the same seller", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2" },
      [baseListing],
    );

    expect(result.duplicate).toBe(true);
    expect(result.riskLevel).toBe("high");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe(0.95);
    expect(result.matches[0].reason).toMatch(/section, row, and seat/);
  });

  it("ignores inactive historical listings (exact fingerprint)", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2" },
      [{ ...baseListing, status: "sold" }],
    );

    expect(result.duplicate).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  // ── Tier 2: same section, different seat (medium) ─────────────────────────

  it("returns medium risk for same seller/event/section but different seat", () => {
    const existing: TicketListingRiskInput = {
      ...baseListing,
      id: "listing-1",
      seat: "17",          // different seat from candidate
      status: "active",
    };

    const result = assessListingRisk(
      { ...baseListing, id: "listing-2", seat: "19" },
      [existing],
    );

    expect(result.duplicate).toBe(false);
    expect(result.riskLevel).toBe("medium");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe(0.6);
    expect(result.matches[0].reason).toMatch(/different row or seat/);
    expect(result.warning).toBeTruthy();
  });

  it("does not produce a section match when sections differ", () => {
    const existing: TicketListingRiskInput = {
      ...baseListing,
      id: "listing-1",
      section: "B",        // different section
      seat: "17",
      status: "active",
    };

    const result = assessListingRisk(
      { ...baseListing, id: "listing-2", seat: "19" },
      [existing],
    );

    // Falls through to tier 3 soft match (same event+seller, different section)
    expect(result.riskLevel).toBe("low");
    expect(result.matches[0]?.confidence).toBe(0.2);
  });

  // ── Tier 3: same event+seller, no section/seat overlap (low + warning) ────

  it("returns low risk with warning for same seller/event but different section", () => {
    const existing: TicketListingRiskInput = {
      ...baseListing,
      id: "listing-1",
      section: "C",
      row: "1",
      seat: "1",
      status: "pending",   // pending is still an active status
    };

    const result = assessListingRisk(
      { ...baseListing, id: "listing-2", section: "D", row: "2", seat: "2" },
      [existing],
    );

    expect(result.duplicate).toBe(false);
    expect(result.riskLevel).toBe("low");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe(0.2);
    expect(result.matches[0].reason).toMatch(/no section or seat overlap/);
    expect(result.warning).toBeTruthy();
  });

  // ── Non-active listings are excluded ─────────────────────────────────────

  it("does not match cancelled, sold, or expired listings", () => {
    const inactiveStatuses = ["sold", "cancelled", "expired"];

    for (const status of inactiveStatuses) {
      const result = assessListingRisk(
        { ...baseListing, id: "listing-2" },
        [{ ...baseListing, status }],
      );

      expect(result.duplicate).toBe(false);
      expect(result.matches).toHaveLength(0);
    }
  });

  it("treats reserved and pending listings as active", () => {
    for (const status of ["reserved", "pending"] as const) {
      const result = assessListingRisk(
        { ...baseListing, id: "listing-2" },
        [{ ...baseListing, status }],
      );

      expect(result.duplicate).toBe(true);
      expect(result.riskLevel).toBe("high");
    }
  });

  // ── isActiveListing helper ────────────────────────────────────────────────

  it("isActiveListing returns true for active/pending/reserved", () => {
    expect(isActiveListing({ ...baseListing, status: "active" })).toBe(true);
    expect(isActiveListing({ ...baseListing, status: "pending" })).toBe(true);
    expect(isActiveListing({ ...baseListing, status: "reserved" })).toBe(true);
  });

  it("isActiveListing returns false for sold/cancelled/expired", () => {
    expect(isActiveListing({ ...baseListing, status: "sold" })).toBe(false);
    expect(isActiveListing({ ...baseListing, status: "cancelled" })).toBe(false);
    expect(isActiveListing({ ...baseListing, status: "expired" })).toBe(false);
  });

  // ── Clean (no match) path ─────────────────────────────────────────────────

  it("allows different seats for legitimate multi-ticket sellers", () => {
    const result = assessListingRisk(
      { ...baseListing, id: "listing-2", seat: "19" },
      [baseListing],
    );

    // Different seat in same section → section-level (medium) match, not exact
    expect(result.duplicate).toBe(false);
    expect(result.riskLevel).toBe("medium");
  });

  it("returns low risk with no matches when there are no existing listings", () => {
    const result = assessListingRisk(baseListing, []);

    expect(result.duplicate).toBe(false);
    expect(result.riskLevel).toBe("low");
    expect(result.matches).toHaveLength(0);
    expect(result.warning).toBeUndefined();
  });

  it("excludes the candidate itself when it appears in the existing list", () => {
    const result = assessListingRisk(baseListing, [baseListing]);

    expect(result.duplicate).toBe(false);
    expect(result.matches).toHaveLength(0);
  });
});

describe("evaluateSellerFraudEscalation (#555)", () => {
  const NOW = new Date("2026-06-01T00:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;

  function high(sellerId: string, daysAgo: number) {
    return {
      sellerId,
      riskLevel: "high" as const,
      detectedAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    };
  }

  it("takes no action for a seller with no high-risk detections", () => {
    const result = evaluateSellerFraudEscalation("seller-a", [], NOW);
    expect(result).toMatchObject({ action: "none", highRiskCount: 0 });
  });

  it("does not escalate below the review threshold", () => {
    const detections = [high("seller-a", 1), high("seller-a", 2)];
    expect(evaluateSellerFraudEscalation("seller-a", detections, NOW).action).toBe("none");
  });

  it("flags for review at the review threshold", () => {
    const detections = [high("seller-a", 1), high("seller-a", 2), high("seller-a", 3)];
    expect(evaluateSellerFraudEscalation("seller-a", detections, NOW)).toMatchObject({
      action: "flag_for_review",
      highRiskCount: 3,
    });
  });

  it("holds new listings at the suspend threshold", () => {
    const detections = [1, 2, 3, 4, 5].map((d) => high("seller-a", d));
    expect(evaluateSellerFraudEscalation("seller-a", detections, NOW)).toMatchObject({
      action: "suspend_pending_review",
      highRiskCount: 5,
    });
  });

  it("ignores detections for other sellers", () => {
    const detections = [high("seller-b", 1), high("seller-b", 2), high("seller-b", 3), high("seller-b", 4), high("seller-b", 5)];
    expect(evaluateSellerFraudEscalation("seller-a", detections, NOW)).toMatchObject({
      action: "none",
      highRiskCount: 0,
    });
  });

  it("ignores detections outside the rolling window", () => {
    const window = SELLER_FRAUD_ESCALATION_THRESHOLDS.windowDays;
    const detections = [high("seller-a", 1), high("seller-a", 2), high("seller-a", window + 1)];
    expect(evaluateSellerFraudEscalation("seller-a", detections, NOW)).toMatchObject({
      action: "none",
      highRiskCount: 2,
    });
  });

  it("counts only high-risk detections", () => {
    const detections = [
      high("seller-a", 1),
      high("seller-a", 2),
      { sellerId: "seller-a", riskLevel: "medium" as const, detectedAt: NOW.toISOString() },
      { sellerId: "seller-a", riskLevel: "low" as const, detectedAt: NOW.toISOString() },
    ];
    expect(evaluateSellerFraudEscalation("seller-a", detections, NOW).highRiskCount).toBe(2);
  });

  it("respects custom thresholds", () => {
    const detections = [high("seller-a", 1)];
    const result = evaluateSellerFraudEscalation("seller-a", detections, NOW, {
      review: 1,
      suspend: 2,
      windowDays: 30,
    });
    expect(result.action).toBe("flag_for_review");
  });
});
