import { gql } from '@apollo/client';

/**
 * Ticket listings are still stored in Hasura's `apartments` table (the
 * pre-pivot name — see docs/PIVOT_NOTES.md). The fields below mirror the
 * TicketListing shape in src/lib/mockData/listings.ts.
 */
const TICKET_LISTING_FIELDS = gql`
  fragment TicketListingFields on apartments {
    id
    name
    description
    price
    warranty_deposit
    is_available
    image_urls
    address
    owner_id
    created_at
  }
`;

export const GET_AVAILABLE_TICKET_LISTINGS = gql`
  ${TICKET_LISTING_FIELDS}
  query GetAvailableTicketListings($limit: Int = 20) {
    apartments(
      where: { is_available: { _eq: true } }
      order_by: { created_at: desc }
      limit: $limit
    ) {
      ...TicketListingFields
    }
  }
`;

export const GET_TICKET_LISTINGS_BY_IDS = gql`
  ${TICKET_LISTING_FIELDS}
  query GetTicketListingsByIds($ids: [uuid!]!) {
    apartments(where: { id: { _in: $ids } }) {
      ...TicketListingFields
    }
  }
`;

export interface TicketListingRow {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  warranty_deposit: number;
  is_available: boolean;
  image_urls?: string[] | null;
  address?: {
    street?: string;
    neighborhood?: string;
    city?: string;
    country?: string;
  } | null;
  owner_id: string;
  created_at: string;
}

export function formatListingAddress(address: TicketListingRow['address']): string {
  if (!address) return '';
  return [address.street, address.neighborhood, address.city, address.country]
    .filter(Boolean)
    .join(', ');
}
import { graphql } from "@/graphql/generated";

export const GET_TICKET_LISTINGS = graphql(`
  query GetTicketListings(
    $limit: Int
    $offset: Int
    $where: ticket_listings_bool_exp
    $order_by: [ticket_listings_order_by!]
  ) {
    ticket_listings(
      limit: $limit
      offset: $offset
      where: $where
      order_by: $order_by
    ) {
      id
      name
      location
      address
      bedrooms
      bathrooms
      price
      status
      promoted
      created_at
      updated_at
      listing_offers_aggregate {
        aggregate {
          count
        }
      }
    }
    ticket_listings_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const GET_TICKET_LISTING_BY_ID = graphql(`
  query GetTicketListingById($id: Int!) {
    ticket_listings_by_pk(id: $id) {
      id
      name
      location
      address
      bedrooms
      bathrooms
      price
      status
      promoted
      created_at
      updated_at
    }
  }
`);

export const GET_LISTING_OFFERS = graphql(`
  query GetListingOffers(
    $listing_id: Int!
    $limit: Int
    $offset: Int
    $order_by: [rental_offers_order_by!]
  ) {
    listing_offers(
      where: { listing_id: { _eq: $listing_id } }
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      id
      buyer_name
      buyer_phone
      buyer_wallet_address
      offer_date
      bid_status
      created_at
    }
    listing_offers_aggregate(where: { listing_id: { _eq: $listing_id } }) {
      aggregate {
        count
      }
    }
  }
`);
