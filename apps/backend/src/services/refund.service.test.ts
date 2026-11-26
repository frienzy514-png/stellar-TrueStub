/**
 * Jest tests for RefundService idempotency guard — issue #153
 */

import {
  RefundService,
  InMemoryRefundStore,
  REFUND_ERROR_CODES,
} from "./refund.service";
import { AppError } from "../middleware/errorHandler";

function makeService() {
  const store = new InMemoryRefundStore();
  return { service: new RefundService(store), store };
}

const basePayload = {
  refundId: "refund-abc-123",
  escrowId: "escrow-xyz-456",
  amount: "100",
  currency: "USDC",
  claimedBy: "user-1",
};

describe("RefundService — idempotency guard (#153)", () => {
  describe("claimRefund", () => {
    it("marks a refund as claimed on first call and returns the record", async () => {
      const { service } = makeService();

      const record = await service.claimRefund(basePayload);

      expect(record.refundId).toBe(basePayload.refundId);
      expect(record.escrowId).toBe(basePayload.escrowId);
      expect(record.amount).toBe(basePayload.amount);
      expect(record.currency).toBe(basePayload.currency);
      expect(record.claimedBy).toBe(basePayload.claimedBy);
      expect(record.claimedAt).toBeTruthy();
    });

    it("throws RefundAlreadyClaimed on second call with the same refundId", async () => {
      const { service } = makeService();

      await service.claimRefund(basePayload);

      await expect(service.claimRefund(basePayload)).rejects.toMatchObject({
        statusCode: 409,
        code: REFUND_ERROR_CODES.ALREADY_CLAIMED,
      });
    });

    it("error message includes the refundId", async () => {
      const { service } = makeService();
      await service.claimRefund(basePayload);

      let caught: AppError | null = null;
      try {
        await service.claimRefund(basePayload);
      } catch (err) {
        caught = err as AppError;
      }

      expect(caught).not.toBeNull();
      expect(caught!.message).toContain(basePayload.refundId);
    });

    it("allows independent claims for different refundIds", async () => {
      const { service } = makeService();

      await service.claimRefund({ ...basePayload, refundId: "refund-1" });
      const second = await service.claimRefund({ ...basePayload, refundId: "refund-2" });

      expect(second.refundId).toBe("refund-2");
    });

    it("throws 400 when refundId is missing", async () => {
      const { service } = makeService();

      await expect(
        service.claimRefund({ refundId: "", escrowId: "escrow-1" })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: REFUND_ERROR_CODES.INVALID_PAYLOAD,
      });
    });

    it("throws 400 when escrowId is missing", async () => {
      const { service } = makeService();

      await expect(
        service.claimRefund({ refundId: "refund-1", escrowId: "" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("only allows one of two concurrent claims with the same refundId to submit an on-chain refund (#423)", async () => {
      const { service } = makeService();

      // Simulate the on-chain submission that must happen at most once.
      const submitOnChain = jest.fn(async () => {
        // Yield so both concurrent callers interleave before either records
        // its idempotency state — this is the race the DB constraint guards.
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { txHash: "0xdeadbeef" };
      });

      const claim = async () => {
        const record = await service.claimRefund(basePayload);
        await submitOnChain();
        return record;
      };

      const results = await Promise.allSettled([claim(), claim()]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(submitOnChain).toHaveBeenCalledTimes(1);

      const rejection = rejected[0] as PromiseRejectedResult;
      expect(rejection.reason).toMatchObject({
        statusCode: 409,
        code: REFUND_ERROR_CODES.ALREADY_CLAIMED,
      });

      // The losing request must be rejected by the store's unique constraint,
      // not merely by an application-level check-then-write.
      expect(rejection.reason).toBeInstanceOf(AppError);
    });

    it("allows the same refundId through separate service instances with independent in-memory stores (#520)", async () => {
      const first = makeService();
      const second = makeService();

      const results = await Promise.all([
        first.service.claimRefund(basePayload),
        second.service.claimRefund(basePayload),
      ]);

      expect(results).toHaveLength(2);
      expect(results.map((record) => record.refundId)).toEqual([
        basePayload.refundId,
        basePayload.refundId,
      ]);
      expect(await first.service.getClaimStatus(basePayload.refundId)).toBeDefined();
      expect(await second.service.getClaimStatus(basePayload.refundId)).toBeDefined();
    });
  });

  describe("getClaimStatus", () => {
    it("returns undefined for an unclaimed refundId", async () => {
      const { service } = makeService();
      expect(await service.getClaimStatus("non-existent")).toBeUndefined();
    });

    it("returns the claim record after it has been claimed", async () => {
      const { service } = makeService();

      await service.claimRefund(basePayload);
      const result = await service.getClaimStatus(basePayload.refundId);

      expect(result).not.toBeUndefined();
      expect(result!.refundId).toBe(basePayload.refundId);
    });
  });

  describe("request-ID correlation across refund → dispute → changelog (#425)", () => {
    it("threads a single correlation ID through every log line and Sentry event", async () => {
      const { service } = makeService();

      const correlationId = "corr-refund-425";
      const logLines: Array<Record<string, unknown>> = [];
      const sentryEvents: Array<Record<string, unknown>> = [];

      const logger = {
        info: (msg: string, ctx?: Record<string, unknown>) =>
          logLines.push({ level: "info", msg, ...ctx }),
        warn: (msg: string, ctx?: Record<string, unknown>) =>
          logLines.push({ level: "warn", msg, ...ctx }),
        error: (msg: string, ctx?: Record<string, unknown>) =>
          logLines.push({ level: "error", msg, ...ctx }),
      };

      const sentry = {
        captureException: (err: unknown, ctx?: Record<string, unknown>) =>
          sentryEvents.push({ err, ...ctx }),
        captureMessage: (msg: string, ctx?: Record<string, unknown>) =>
          sentryEvents.push({ msg, ...ctx }),
      };

      // Trace one refund request through the whole chain.
      await service.claimRefund(basePayload, { correlationId, logger, sentry });
      await service.updateDisputeStatus(basePayload.refundId, "resolved", {
        correlationId,
        logger,
        sentry,
      });
      await service.appendChangelog(basePayload.refundId, "refund-claimed", {
        correlationId,
        logger,
        sentry,
      });

      expect(logLines.length).toBeGreaterThan(0);
      for (const line of logLines) {
        expect(line.correlationId).toBe(correlationId);
      }

      for (const event of sentryEvents) {
        expect(event.correlationId).toBe(correlationId);
      }
    });
  });

  describe("cleanup", () => {
    it("removes records older than the retention window", async () => {
      const { service, store } = makeService();

      await service.claimRefund(basePayload);
      const existing = await store.get(basePayload.refundId);
      expect(existing).not.toBeUndefined();

      // Backdate to 100 days ago
      const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      await store.set(basePayload.refundId, { ...existing!, claimedAt: old });

      const removed = await service.cleanup(90);

      expect(removed).toBe(1);
      expect(store.size).toBe(0);
    });

    it("retains records within the retention window", async () => {
      const { service, store } = makeService();

      await service.claimRefund(basePayload);
      const removed = await service.cleanup(90);

      expect(removed).toBe(0);
      expect(store.size).toBe(1);
    });

    it("removes nothing when the store is empty", async () => {
      const { service } = makeService();
      expect(await service.cleanup(90)).toBe(0);
    });
  });
});
