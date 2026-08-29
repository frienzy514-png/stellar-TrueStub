/**
 * Tests for RefundService idempotency guard — issue #153
 *
 * Uses node:test (same pattern as existing fraud-detection.test.ts).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  RefundService,
  InMemoryRefundStore,
  REFUND_ERROR_CODES,
} from "./refund.service";
import { AppError } from "../middleware/errorHandler";

function makeService() {
  const store = new InMemoryRefundStore();
  const service = new RefundService(store);
  return { service, store };
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

      assert.equal(record.refundId, basePayload.refundId);
      assert.equal(record.escrowId, basePayload.escrowId);
      assert.equal(record.amount, basePayload.amount);
      assert.equal(record.currency, basePayload.currency);
      assert.equal(record.claimedBy, basePayload.claimedBy);
      assert.ok(record.claimedAt, "claimedAt should be set");
    });

    it("throws RefundAlreadyClaimed on second call with the same refundId", async () => {
      const { service } = makeService();

      await service.claimRefund(basePayload);

      await assert.rejects(
        () => service.claimRefund(basePayload),
        (err: unknown) => {
          assert.ok(err instanceof AppError, "should be AppError");
          assert.equal((err as AppError).statusCode, 409);
          assert.equal((err as AppError).code, REFUND_ERROR_CODES.ALREADY_CLAIMED);
          assert.ok(
            (err as AppError).message.includes(basePayload.refundId),
            "error message should include the refundId"
          );
          return true;
        }
      );
    });

    it("allows independent claims for different refundIds", async () => {
      const { service } = makeService();

      await service.claimRefund({ ...basePayload, refundId: "refund-1" });
      const second = await service.claimRefund({ ...basePayload, refundId: "refund-2" });

      assert.equal(second.refundId, "refund-2");
    });

    it("throws 400 when refundId is missing", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.claimRefund({ refundId: "", escrowId: "escrow-1" }),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 400);
          assert.equal((err as AppError).code, REFUND_ERROR_CODES.INVALID_PAYLOAD);
          return true;
        }
      );
    });

    it("throws 400 when escrowId is missing", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.claimRefund({ refundId: "refund-1", escrowId: "" }),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 400);
          return true;
        }
      );
    });
  });

  describe("getClaimStatus", () => {
    it("returns undefined for an unclaimed refundId", async () => {
      const { service } = makeService();

      const result = await service.getClaimStatus("non-existent");
      assert.equal(result, undefined);
    });

    it("returns the claim record after it has been claimed", async () => {
      const { service } = makeService();

      await service.claimRefund(basePayload);
      const result = await service.getClaimStatus(basePayload.refundId);

      assert.ok(result);
      assert.equal(result!.refundId, basePayload.refundId);
    });
  });

  describe("cleanup", () => {
    it("removes records older than the retention window", async () => {
      const { service, store } = makeService();

      // Claim a refund and then manually backdate its claimedAt
      await service.claimRefund(basePayload);
      const existing = await store.get(basePayload.refundId);
      assert.ok(existing);

      // Backdate to 100 days ago
      const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      await store.set(basePayload.refundId, { ...existing, claimedAt: old });

      const removed = await service.cleanup(90); // 90-day retention

      assert.equal(removed, 1);
      assert.equal(store.size, 0);
    });

    it("retains records within the retention window", async () => {
      const { service, store } = makeService();

      await service.claimRefund(basePayload);
      const removed = await service.cleanup(90);

      assert.equal(removed, 0);
      assert.equal(store.size, 1);
    });

    it("documents: cleanup removes nothing when the store is empty", async () => {
      const { service } = makeService();

      const removed = await service.cleanup(90);
      assert.equal(removed, 0);
    });
  });
});
