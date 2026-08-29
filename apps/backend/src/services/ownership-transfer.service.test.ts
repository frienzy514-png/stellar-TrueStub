/**
 * Tests for OwnershipTransferService — issue #154
 *
 * Covers: initiate, accept, cancel, duplicate transferId guard,
 * double-finalise guard, and concurrent access atomicity.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OwnershipTransferService,
  InMemoryOwnershipStore,
  TRANSFER_ERROR_CODES,
} from "./ownership-transfer.service";
import { AppError } from "../middleware/errorHandler";

function makeService() {
  const store = new InMemoryOwnershipStore();
  return { service: new OwnershipTransferService(store), store };
}

const base = {
  transferId: "tx-001",
  escrowId: "escrow-001",
  fromOwner: "alice",
  toOwner: "bob",
};

describe("OwnershipTransferService — atomic workflow (#154)", () => {
  describe("initiateTransfer", () => {
    it("creates a PENDING transfer", async () => {
      const { service } = makeService();
      const t = await service.initiateTransfer(base);

      assert.equal(t.state, "PENDING");
      assert.equal(t.fromOwner, "alice");
      assert.equal(t.toOwner, "bob");
      assert.ok(t.initiatedAt);
      assert.equal(t.finalizedAt, undefined);
    });

    it("rejects a duplicate transferId with TRANSFER_CONFLICT", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      await assert.rejects(
        () => service.initiateTransfer(base),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 409);
          assert.equal((err as AppError).code, TRANSFER_ERROR_CODES.CONFLICT);
          return true;
        }
      );
    });

    it("throws 400 on missing required fields", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.initiateTransfer({ ...base, fromOwner: "" }),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 400);
          return true;
        }
      );
    });
  });

  describe("acceptTransfer", () => {
    it("moves a PENDING transfer to ACCEPTED", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      const accepted = await service.acceptTransfer(base.transferId);

      assert.equal(accepted.state, "ACCEPTED");
      assert.ok(accepted.finalizedAt);
    });

    it("throws 409 ALREADY_FINALIZED when accepting an already-ACCEPTED transfer", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      await service.acceptTransfer(base.transferId);

      await assert.rejects(
        () => service.acceptTransfer(base.transferId),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 409);
          assert.equal((err as AppError).code, TRANSFER_ERROR_CODES.ALREADY_FINALIZED);
          return true;
        }
      );
    });

    it("throws 409 ALREADY_FINALIZED when accepting a CANCELLED transfer", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      await service.cancelTransfer(base.transferId);

      await assert.rejects(
        () => service.acceptTransfer(base.transferId),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).code, TRANSFER_ERROR_CODES.ALREADY_FINALIZED);
          return true;
        }
      );
    });

    it("throws 404 for a non-existent transferId", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.acceptTransfer("ghost-id"),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 404);
          assert.equal((err as AppError).code, TRANSFER_ERROR_CODES.NOT_FOUND);
          return true;
        }
      );
    });
  });

  describe("cancelTransfer", () => {
    it("moves a PENDING transfer to CANCELLED", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      const cancelled = await service.cancelTransfer(base.transferId);

      assert.equal(cancelled.state, "CANCELLED");
      assert.ok(cancelled.finalizedAt);
    });

    it("prevents partial states — no transfer state beyond ACCEPTED or CANCELLED exists", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      const accepted = await service.acceptTransfer(base.transferId);

      // Once ACCEPTED the record is immutable for further transitions
      await assert.rejects(
        () => service.cancelTransfer(base.transferId),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).code, TRANSFER_ERROR_CODES.ALREADY_FINALIZED);
          return true;
        }
      );

      // State has not changed from ACCEPTED
      assert.equal(accepted.state, "ACCEPTED");
    });
  });

  describe("concurrent access", () => {
    it("only one of two concurrent accept calls succeeds — no double-accept", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      // Fire two accepts simultaneously
      const results = await Promise.allSettled([
        service.acceptTransfer(base.transferId),
        service.acceptTransfer(base.transferId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      assert.equal(fulfilled.length, 1, "exactly one accept should succeed");
      assert.equal(rejected.length, 1, "exactly one accept should fail");

      const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
      assert.equal(err.code, TRANSFER_ERROR_CODES.ALREADY_FINALIZED);
    });

    it("only one of concurrent accept+cancel calls wins", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      const results = await Promise.allSettled([
        service.acceptTransfer(base.transferId),
        service.cancelTransfer(base.transferId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      assert.equal(fulfilled.length, 1, "only one final state can be set");
    });
  });

  describe("getTransfer", () => {
    it("returns undefined for unknown transferId", async () => {
      const { service } = makeService();
      assert.equal(await service.getTransfer("none"), undefined);
    });

    it("returns the current state without side effects", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      const t = await service.getTransfer(base.transferId);

      assert.ok(t);
      assert.equal(t!.state, "PENDING");
    });
  });
});
