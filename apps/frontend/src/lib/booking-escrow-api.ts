import { apolloClient } from "@/config/apollo";
import {
  GET_BOOKING_FOR_ESCROW,
  RECORD_BOOKING_ESCROW,
  type BookingForEscrowResult,
} from "@/graphql/queries/booking-escrow-queries";
import { formatListingAddress } from "@/graphql/queries/ticket-listing-queries";
import type {
  BookingData,
  EventData,
  RoomData,
} from "@/interfaces/booking-escrow.interface";

export interface BookingEscrowContext {
  booking: BookingData;
  event: EventData;
  room: RoomData;
}

/**
 * Loads everything the escrow creation form needs for one booking from
 * Hasura in a single round trip: the booking itself, the listing being
 * purchased, and the seller's payout wallet.
 */
export async function fetchBookingEscrowContext(
  bookingId: string
): Promise<BookingEscrowContext> {
  const { data, error } = await apolloClient.query<BookingForEscrowResult>({
    query: GET_BOOKING_FOR_ESCROW,
    variables: { id: bookingId },
    fetchPolicy: "network-only",
  });

  if (error) throw error;

  const bid = data?.bid_requests_by_pk;
  if (!bid) {
    throw new Error(`Booking ${bookingId} was not found.`);
  }

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

  return {
    booking: {
      id: bid.id,
      roomId: listing.id,
      eventId: listing.id,
      totalAmount: bid.proposed_price ?? listing.price,
      currency: "USDC",
      checkInDate: bid.desired_move_in,
      checkOutDate: bid.desired_move_out ?? bid.desired_move_in,
      guestEmail: bid.tenant?.email ?? "",
      guestName: guestName || undefined,
      preferences: { milestonePayments: false },
    },
    event: {
      id: listing.id,
      name: listing.name,
      walletAddress: sellerWallet,
      location: formatListingAddress(listing.address) || undefined,
      imageUrl: listing.image_urls?.[0],
    },
    room: {
      id: listing.id,
      name: listing.name,
      type: "Ticket",
      pricePerNight: listing.price,
      capacity: 1,
      imageUrl: listing.image_urls?.[0],
    },
  };
}

/**
 * Persists a newly created Trustless Work escrow against its booking so the
 * dashboard, webhooks, and subscriptions can find it.
 */
export async function recordBookingEscrow(
  bookingId: string,
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
        bid_request_id: bookingId,
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
