jest.mock("../lib/hasura", () => ({
  hasuraClient: { request: jest.fn() },
}));

import { hasuraClient } from "../lib/hasura";
import { HasuraService } from "./hasura.service";

const hasuraRequest = hasuraClient.request as jest.Mock;

describe("HasuraService.updateEscrowStatus", () => {
  it("updates escrow_transactions by contract_id and returns affected rows", async () => {
    hasuraRequest.mockResolvedValue({ update_escrow_transactions: { affected_rows: 1 } });

    await expect(HasuraService.updateEscrowStatus("contract-123", "funded")).resolves.toEqual({
      affected_rows: 1,
    });
    expect(hasuraRequest).toHaveBeenCalledWith(
      expect.stringContaining("contract_id: { _eq: $contractId }"),
      { contractId: "contract-123", status: "funded" }
    );
  });

  it("reports zero affected rows when no escrow matches", async () => {
    hasuraRequest.mockResolvedValue({ update_escrow_transactions: { affected_rows: 0 } });

    await expect(HasuraService.updateEscrowStatus("unknown", "funded")).resolves.toEqual({
      affected_rows: 0,
    });
  });

  it("throws a generic error instead of faking success when Hasura fails", async () => {
    hasuraRequest.mockRejectedValue(new Error("x-hasura-admin-secret: super-secret rejected"));

    const call = HasuraService.updateEscrowStatus("contract-123", "funded");
    await expect(call).rejects.toThrow("Failed to update escrow status in Hasura");
    await expect(call).rejects.not.toThrow(/super-secret/);
  });
});

describe("HasuraService.getEscrowById", () => {
  it("returns the escrow when the requesting user is a party to it", async () => {
    const escrow = {
      id: "escrow-1",
      contract_id: "contract-123",
      buyer_id: "user-buyer",
      seller_id: "user-seller",
      amount: 500,
      status: "funded",
    };
    hasuraRequest.mockResolvedValue({ escrow_transactions_by_pk: escrow });

    await expect(HasuraService.getEscrowById("escrow-1", "user-buyer")).resolves.toEqual(escrow);
    expect(hasuraRequest).toHaveBeenCalledWith(
      expect.stringContaining("escrow_transactions_by_pk"),
      { id: "escrow-1" }
    );
  });

  it("denies a non-party request for an escrow receipt", async () => {
    const escrow = {
      id: "escrow-1",
      contract_id: "contract-123",
      buyer_id: "user-buyer",
      seller_id: "user-seller",
      amount: 500,
      status: "funded",
    };
    hasuraRequest.mockResolvedValue({ escrow_transactions_by_pk: escrow });

    await expect(HasuraService.getEscrowById("escrow-1", "user-stranger")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("returns 404 when the escrow does not exist", async () => {
    hasuraRequest.mockResolvedValue({ escrow_transactions_by_pk: null });

    await expect(HasuraService.getEscrowById("missing", "user-buyer")).rejects.toMatchObject({
      status: 404,
    });
  });
});
