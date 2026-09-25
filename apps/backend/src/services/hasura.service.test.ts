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
