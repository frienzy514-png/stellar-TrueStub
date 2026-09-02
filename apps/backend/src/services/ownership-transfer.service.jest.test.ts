/**
 * Jest tests for OwnershipTransferService atomic workflow — issue #154
 *
 * Mirror of ownership-transfer.service.test.ts but using Jest's API so the
 * backend's jest config (testMatch: ["**\/*.jest.test.ts"]) picks them up.
 */

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

      expect(t.state).toBe("PENDING");
      expect(t.fromOwner).toBe("alice");
      expect(t.toOwner).toBe("bob");
      expect(t.initiatedAt).toBeTruthy();
      expect(t.finalizedAt).toBeUndefined();
    });

    it("rejects a duplicate transferId with TRANSFER_CONFLICT", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      await expect(service.initiateTransfer(base)).rejects.toMatchObject({
        statusCode: 409,
        code: TRANSFER_ERROR_CODES.CONFLICT,
      });
    });

    it("throws 400 on missing required fields", async () => {
      const { service } = makeService();

      await expect(
        service.initiateTransfer({ ...base, fromOwner: "" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("acceptTransfer", () => {
    it("moves a PENDING transfer to ACCEPTED", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      const accepted = await service.acceptTransfer(base.transferId);

      expect(accepted.state).toBe("ACCEPTED");
      expect(accepted.finalizedAt).toBeTruthy();
    });

    it("throws 409 ALREADY_FINALIZED when accepting an already-ACCEPTED transfer", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      await service.acceptTransfer(base.transferId);

      await expect(service.acceptTransfer(base.transferId)).rejects.toMatchObject({
        statusCode: 409,
        code: TRANSFER_ERROR_CODES.ALREADY_FINALIZED,
      });
    });

    it("throws 409 ALREADY_FINALIZED when accepting a CANCELLED transfer", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      await service.cancelTransfer(base.transferId);

      await expect(service.acceptTransfer(base.transferId)).rejects.toMatchObject({
        code: TRANSFER_ERROR_CODES.ALREADY_FINALIZED,
      });
    });

    it("throws 404 for a non-existent transferId", async () => {
      const { service } = makeService();

      await expect(service.acceptTransfer("ghost-id")).rejects.toMatchObject({
        statusCode: 404,
        code: TRANSFER_ERROR_CODES.NOT_FOUND,
      });
    });
  });

  describe("cancelTransfer", () => {
    it("moves a PENDING transfer to CANCELLED", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      const cancelled = await service.cancelTransfer(base.transferId);

      expect(cancelled.state).toBe("CANCELLED");
      expect(cancelled.finalizedAt).toBeTruthy();
    });

    it("throws 409 ALREADY_FINALIZED when cancelling an accepted transfer", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      await service.acceptTransfer(base.transferId);

      await expect(service.cancelTransfer(base.transferId)).rejects.toMatchObject({
        code: TRANSFER_ERROR_CODES.ALREADY_FINALIZED,
      });
    });
  });

  describe("concurrent access", () => {
    it("only one of two concurrent accept calls succeeds — no double-accept", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      const results = await Promise.allSettled([
        service.acceptTransfer(base.transferId),
        service.acceptTransfer(base.transferId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
      expect(err.code).toBe(TRANSFER_ERROR_CODES.ALREADY_FINALIZED);
    });

    it("only one of concurrent accept+cancel calls wins", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);

      const results = await Promise.allSettled([
        service.acceptTransfer(base.transferId),
        service.cancelTransfer(base.transferId),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);
    });
  });

  describe("getTransfer", () => {
    it("returns undefined for unknown transferId", async () => {
      const { service } = makeService();
      expect(await service.getTransfer("none")).toBeUndefined();
    });

    it("returns the current state without side effects", async () => {
      const { service } = makeService();
      await service.initiateTransfer(base);
      const t = await service.getTransfer(base.transferId);

      expect(t).not.toBeUndefined();
      expect(t!.state).toBe("PENDING");
    });
  });
});
