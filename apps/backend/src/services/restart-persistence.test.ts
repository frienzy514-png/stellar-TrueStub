/**
 * #519 — regression guard: refund claims must survive a simulated restart.
 * A fresh store instance (cold process memory) shares only the database.
 */
const table = new Map<string, { record: unknown; claimedAt: string }>();

jest.mock("../lib/postgres", () => ({
  queryWithTimeout: jest.fn(async (sql: string, params: unknown[]) => {
    const [id] = params as string[];
    if (sql.startsWith("SELECT 1")) return { rowCount: table.has(id) ? 1 : 0, rows: [] };
    if (sql.startsWith("SELECT record")) {
      const row = table.get(id);
      return { rowCount: row ? 1 : 0, rows: row ? [{ record: row.record }] : [] };
    }
    if (sql.includes("INSERT INTO refund_claims")) {
      if (table.has(id) && sql.includes("DO NOTHING")) return { rowCount: 0, rows: [] };
      table.set(id, { claimedAt: params[2] as string, record: JSON.parse(params[3] as string) });
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  }),
  withTransaction: jest.fn(),
}));

import { PostgresRefundStore, type ClaimedRefund } from "./refund.service";

describe("refund claims across a simulated backend restart (#519)", () => {
  const claim: ClaimedRefund = {
    refundId: "refund-restart-1",
    escrowId: "escrow-1",
    claimedAt: new Date().toISOString(),
  } as ClaimedRefund;

  it("is still findable from a fresh store instance", async () => {
    const before = new PostgresRefundStore();
    expect(await before.insertIfAbsent(claim.refundId, claim)).toBe(true);

    const afterRestart = new PostgresRefundStore();
    expect(await afterRestart.has(claim.refundId)).toBe(true);
    expect((await afterRestart.get(claim.refundId))?.escrowId).toBe("escrow-1");
    expect(await afterRestart.insertIfAbsent(claim.refundId, claim)).toBe(false);
  });
});
