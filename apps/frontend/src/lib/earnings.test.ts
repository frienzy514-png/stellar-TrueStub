import { summarizeEarnings, type PayoutEscrow } from "./earnings";

const e = (id: string, amount: number, releasedAt?: string, status = "released"): PayoutEscrow => ({
  id,
  listingName: id,
  amount,
  currency: "USDC",
  status,
  releasedAt,
});

const escrows = [
  e("a", 100, "2026-03-02T10:00:00Z"), // Monday
  e("b", 50, "2026-03-04T10:00:00Z"), // same week
  e("c", 200, "2026-04-15T10:00:00Z"),
  e("pending", 999, undefined, "funded"),
  e("disputed", 999, "2026-03-05T10:00:00Z", "disputed"),
];

describe("summarizeEarnings", () => {
  it("totals only released escrows", () => {
    const s = summarizeEarnings(escrows, "month");
    expect(s.total).toBe(350);
    expect(s.count).toBe(3);
  });

  it("buckets by month, oldest first", () => {
    const s = summarizeEarnings(escrows, "month");
    expect(s.buckets).toEqual([
      { key: "2026-03-01", total: 150, count: 2 },
      { key: "2026-04-01", total: 200, count: 1 },
    ]);
  });

  it("buckets by ISO week (Monday start)", () => {
    const s = summarizeEarnings(escrows, "week");
    expect(s.buckets[0]).toEqual({ key: "2026-03-02", total: 150, count: 2 });
  });

  it("buckets by day", () => {
    expect(summarizeEarnings(escrows, "day").buckets).toHaveLength(3);
  });

  it("returns an empty summary with no payouts", () => {
    expect(summarizeEarnings([], "month")).toEqual({ total: 0, count: 0, buckets: [] });
  });
});
