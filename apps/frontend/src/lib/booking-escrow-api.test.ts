jest.mock("@/config/apollo", () => ({
  apolloClient: { query: jest.fn(), mutate: jest.fn() },
}));

import { apolloClient } from "@/config/apollo";
import {
  fetchTicketPurchaseEscrowContext,
  mapBookingToEscrowContext,
  recordTicketPurchaseEscrow,
} from "./booking-escrow-api";

const mockedQuery = apolloClient.query as jest.Mock;
const mockedMutate = apolloClient.mutate as jest.Mock;

const booking = {
  id: "purchase-1",
  apartment_id: "listing-1",
  proposed_price: 180,
  desired_move_in: "2026-12-01T00:00:00Z",
  desired_move_out: "2026-12-05T00:00:00Z",
  current_status: "accepted",
  tenant: { email: "buyer@example.com", first_name: "Ada", last_name: "Lovelace" },
  apartment: {
    id: "listing-1",
    name: "Floor Section A",
    description: null,
    price: 200,
    warranty_deposit: 0,
    image_urls: ["/img/a.png"],
    address: { city: "Miami", country: "US" },
    owner: { user_wallets: [{ wallet_address: "GSELLER" }] },
  },
};

describe("booking-escrow-api", () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedMutate.mockReset();
  });

  it("maps a booking row onto the escrow form shapes", () => {
    const { purchase, event, listing } = mapBookingToEscrowContext(booking);

    expect(purchase).toMatchObject({
      id: "purchase-1",
      listingId: "listing-1",
      totalAmount: 180,
      quantity: 1,
      guestEmail: "buyer@example.com",
      guestName: "Ada Lovelace",
    });
    expect(event).toMatchObject({
      name: "Floor Section A",
      walletAddress: "GSELLER",
      location: "Miami, US",
      imageUrl: "/img/a.png",
    });
    expect(listing).toMatchObject({ id: "listing-1", listingPrice: 200 });
  });

  it("falls back to the listing price when no price was proposed", () => {
    const { purchase } = mapBookingToEscrowContext({ ...booking, proposed_price: null });
    expect(purchase.totalAmount).toBe(200);
  });

  it("refuses to build an escrow when the seller has no payout wallet", () => {
    expect(() =>
      mapBookingToEscrowContext({
        ...booking,
        apartment: { ...booking.apartment, owner: { user_wallets: [] } },
      })
    ).toThrow(/payout wallet/);
  });

  it("throws a not-found error when the purchase does not exist", async () => {
    mockedQuery.mockResolvedValue({ data: { bid_requests_by_pk: null } });
    await expect(fetchTicketPurchaseEscrowContext("missing")).rejects.toThrow(
      /Purchase missing was not found/
    );
  });

  it("propagates GraphQL errors from the purchase query", async () => {
    mockedQuery.mockResolvedValue({ data: undefined, error: new Error("boom") });
    await expect(fetchTicketPurchaseEscrowContext("purchase-1")).rejects.toThrow("boom");
  });

  it("records the created escrow against the purchase", async () => {
    mockedMutate.mockResolvedValue({ data: {} });

    await recordTicketPurchaseEscrow("purchase-1", {
      contractId: "C123",
      escrowStatus: "pending",
      amount: 180,
      unsignedXDR: "AAAA",
    });

    expect(mockedMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          object: expect.objectContaining({
            bid_request_id: "purchase-1",
            contract_id: "C123",
            status: "pending",
            amount: 180,
            response_payload: { unsignedXDR: "AAAA" },
          }),
        },
      })
    );
  });

  it("throws when recording the escrow fails", async () => {
    mockedMutate.mockResolvedValue({ error: new Error("insert failed") });
    await expect(
      recordTicketPurchaseEscrow("purchase-1", {
        contractId: "C123",
        escrowStatus: "pending",
        amount: 180,
      })
    ).rejects.toThrow("insert failed");
  });
});
