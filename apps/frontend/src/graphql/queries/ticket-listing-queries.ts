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
