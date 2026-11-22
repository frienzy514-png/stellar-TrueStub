import { apolloClient } from "@/config/apollo";
import {
  GET_BOOKING_FOR_ESCROW,
  RECORD_BOOKING_ESCROW,
  type BookingForEscrowResult,
} from "@/graphql/queries/booking-escrow-queries";
import { formatListingAddress } from "@/graphql/queries/ticket-listing-queries";
import type {
  EventData,
  TicketListingData,
  TicketPurchaseData,
} from "@/interfaces/ticket-purchase-escrow.interface";

export interface TicketPurchaseEscrowContext {
  purchase: TicketPurchaseData;
  event: EventData;
  listing: TicketListingData;
}

type BookingRow = NonNullable<BookingForEscrowResult["bid_requests_by_pk"]>;

/**
 * Maps a Hasura booking row (a `bid_requests` row joined with its listing and
 * the seller's primary payout wallet) onto the shapes the escrow creation
 * form consumes. Exported for unit testing.
 */
export function mapBookingToEscrowContext(
  bid: BookingRow
): TicketPurchaseEscrowContext {
  const listing = bid.apartment;
  const sellerWallet = listing.owner?.user_wallets[0]?.wallet_address;
  if (!sellerWallet) {
    throw new Error(
      "The seller has not connected a payout wallet yet, so an escrow cannot be created."
    );
  }

  const guestName = [bid.tenant?.first_name, bid.tenant?.last_name]
    .filter(Boolean)
    .join(" ");
  const totalAmount = bid.proposed_price ?? listing.price;
  const imageUrl = listing.image_urls?.[0];

  return {
    purchase: {
      id: bid.id,
      listingId: listing.id,
      eventId: listing.id,
      totalAmount,
      currency: "USDC",
      quantity: 1,
      transferDate: bid.desired_move_in,
      eventDate: bid.desired_move_out ?? bid.desired_move_in,
      guestEmail: bid.tenant?.email ?? "",
      guestName: guestName || undefined,
      preferences: { milestonePayments: false },
    },
    event: {
      id: listing.id,
      name: listing.name,
      walletAddress: sellerWallet,
      location: formatListingAddress(listing.address) || undefined,
      imageUrl,
    },
    listing: {
      id: listing.id,
      name: listing.name,
      seatSection: "General Admission",
      listingPrice: listing.price,
      ticketQuantity: 1,
      pricePerUnit: listing.price,
      allowPartialPurchase: false,
      imageUrl,
    },
  };
}

/**
 * Loads everything the escrow creation form needs for one purchase from
 * Hasura in a single round trip: the purchase itself, the listing being
 * purchased, and the seller's payout wallet.
 */
export async function fetchTicketPurchaseEscrowContext(
  purchaseId: string
): Promise<TicketPurchaseEscrowContext> {
  const { data, error } = await apolloClient.query<BookingForEscrowResult>({
    query: GET_BOOKING_FOR_ESCROW,
    variables: { id: purchaseId },
    fetchPolicy: "network-only",
  });

  if (error) throw error;

  const bid = data?.bid_requests_by_pk;
  if (!bid) {
    throw new Error(`Purchase ${purchaseId} was not found.`);
  }

  return mapBookingToEscrowContext(bid);
}

/**
 * Persists a newly created Trustless Work escrow against its purchase so the
 * dashboard, webhooks, and subscriptions can find it.
 */
export async function recordTicketPurchaseEscrow(
  purchaseId: string,
  escrowInfo: {
    contractId: string;
    escrowStatus: string;
    amount: number;
    unsignedXDR?: string;
  }
): Promise<void> {
  const { error } = await apolloClient.mutate({
    mutation: RECORD_BOOKING_ESCROW,
    variables: {
      object: {
        bid_request_id: purchaseId,
        contract_id: escrowInfo.contractId,
        status: escrowInfo.escrowStatus,
        amount: escrowInfo.amount,
        transaction_type: "create_escrow",
        response_payload: escrowInfo.unsignedXDR
          ? { unsignedXDR: escrowInfo.unsignedXDR }
          : null,
      },
    },
  });

  if (error) throw error;
}
