import { gql } from '@apollo/client';

/**
 * A "booking" in the escrow purchase flow is a `bid_requests` row: a buyer's
 * request against a listing (`apartments`). The seller's payout wallet is the
 * listing owner's primary wallet in `user_wallets`.
 */
export const GET_BOOKING_FOR_ESCROW = gql`
  query GetBookingForEscrow($id: uuid!) {
    bid_requests_by_pk(id: $id) {
      id
      apartment_id
      proposed_price
      desired_move_in
      desired_move_out
      current_status
      tenant {
        email
        first_name
        last_name
      }
      apartment {
        id
        name
        description
        price
        warranty_deposit
        image_urls
        address
        owner {
          user_wallets(where: { is_primary: { _eq: true } }, limit: 1) {
            wallet_address
          }
        }
      }
    }
  }
`;

export const RECORD_BOOKING_ESCROW = gql`
  mutation RecordBookingEscrow($object: escrow_transactions_insert_input!) {
    insert_escrow_transactions_one(object: $object) {
      id
      contract_id
      status
    }
  }
`;

export interface BookingForEscrowResult {
  bid_requests_by_pk: {
    id: string;
    apartment_id: string;
    proposed_price: number | null;
    desired_move_in: string;
    desired_move_out: string | null;
    current_status: string;
    tenant: {
      email: string;
      first_name?: string | null;
      last_name?: string | null;
    } | null;
    apartment: {
      id: string;
      name: string;
      description?: string | null;
      price: number;
      warranty_deposit: number;
      image_urls?: string[] | null;
      address?: {
        street?: string;
        neighborhood?: string;
        city?: string;
        country?: string;
      } | null;
      owner: {
        user_wallets: { wallet_address: string }[];
      } | null;
    };
  } | null;
}
