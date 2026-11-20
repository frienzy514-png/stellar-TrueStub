jest.mock("../lib/hasura", () => ({
  hasuraClient: { request: jest.fn() },
}));

import { hasuraClient } from "../lib/hasura";
import { HasuraService } from "./hasura.service";
import { readFileSync } from "fs";
import { join } from "path";

const hasuraRequest = hasuraClient.request as jest.Mock;

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe("migration 006_normalize_events_primary_key", () => {
  const migrationPath = join(
    __dirname,
    "../../migrations/006_normalize_events_primary_key.sql"
  );

  (TEST_DATABASE_URL ? it : it.skip)(
    "is idempotent: running it twice does not error and leaves events_pkey in place",
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require("pg");
      const migrationSql = readFileSync(migrationPath, "utf8");

      const client = new Client({ connectionString: TEST_DATABASE_URL });
      await client.connect();
      try {
        await client.query(migrationSql);
        await expect(client.query(migrationSql)).resolves.toBeDefined();

        const { rows } = await client.query(
          `SELECT conname FROM pg_constraint
           WHERE conrelid = 'events'::regclass AND contype = 'p'`
        );
        expect(rows.map((row: { conname: string }) => row.conname)).toEqual(["events_pkey"]);
      } finally {
        await client.end();
      }
    }
  );
});

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

describe("HasuraService.deleteTicketListing", () => {
  it("deletes only the requested listing owned by the authenticated user", async () => {
    hasuraRequest.mockResolvedValue({ delete_ticket_listings: { affected_rows: 1, returning: [{ id: 17 }] } });

    await expect(HasuraService.deleteTicketListing(17, "seller-1")).resolves.toBe(true);
    expect(hasuraRequest).toHaveBeenCalledWith(
      expect.stringContaining("owner_id: { _eq: $ownerId }"),
      { id: 17, ownerId: "seller-1" }
    );
  });

  it("returns false when the listing is absent or not owned by the caller", async () => {
    hasuraRequest.mockResolvedValue({ delete_ticket_listings: { affected_rows: 0, returning: [] } });

    await expect(HasuraService.deleteTicketListing(17, "other-user")).resolves.toBe(false);
  });

  it("converts an escrow guard failure into a clear conflict", async () => {
    hasuraRequest.mockRejectedValue(new Error("database rejected: LISTING_DELETE_BLOCKED escrow"));

    await expect(HasuraService.deleteTicketListing(17, "seller-1")).rejects.toMatchObject({
      statusCode: 409,
      code: "LISTING_DELETE_BLOCKED",
      message: expect.stringContaining("escrow references it"),
    });
  });

  it("converts a dispute guard failure into a clear conflict", async () => {
    hasuraRequest.mockRejectedValue(new Error("database rejected: LISTING_DELETE_BLOCKED dispute"));

    await expect(HasuraService.deleteTicketListing(17, "seller-1")).rejects.toMatchObject({
      statusCode: 409,
      code: "LISTING_DELETE_BLOCKED",
      message: expect.stringContaining("dispute references it"),
    });
  });
});
