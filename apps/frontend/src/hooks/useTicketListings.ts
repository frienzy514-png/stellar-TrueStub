"use client";

import { useQuery } from "@apollo/client/react";
import { GET_TICKET_LISTINGS } from "@/graphql/queries/ticket-listing-queries";
import type { ListingOccupancyStatus } from "@/components/dashboard/listings/ListingStatusBadge";

interface UseTicketListingsOptions {
  limit: number;
  offset: number;
  search?: string;
}

/** A ticket listing row as rendered by browse/search tables. */
export interface TicketListingRow {
  id: string;
  name: string;
  location: string;
  price: number;
  status: ListingOccupancyStatus;
  promoted: boolean;
  offers: number;
  created_at: string;
}

interface UseTicketListingsResult {
  data: {
    ticket_listings: TicketListingRow[];
    ticket_listings_aggregate: { aggregate: { count: number } };
  };
  loading: boolean;
  error: Error | undefined;
}

interface GetTicketListingsData {
  ticket_listings: Array<{
    id: number | string;
    name: string;
    location: string;
    price: number | string;
    status: string;
    promoted: boolean | null;
    created_at: string;
    listing_offers_aggregate?: { aggregate?: { count: number } | null } | null;
  }>;
  ticket_listings_aggregate: { aggregate?: { count: number } | null };
}

/**
 * Builds the Hasura `where` clause for a free-text search over name/location.
 */
function buildWhere(search: string) {
  const query = search.trim();
  if (!query) return {};

  const pattern = `%${query}%`;
  return {
    _or: [
      { name: { _ilike: pattern } },
      { location: { _ilike: pattern } },
    ],
  };
}

/**
 * Paginated, searchable ticket listings backed by Hasura (GET_TICKET_LISTINGS).
 * Filtering and pagination happen server-side via query variables.
 */
export function useTicketListings({
  limit,
  offset,
  search = "",
}: UseTicketListingsOptions): UseTicketListingsResult {
  const { data, loading, error } = useQuery(GET_TICKET_LISTINGS, {
    variables: {
      limit,
      offset,
      where: buildWhere(search),
      order_by: [{ created_at: "desc" as const }],
    },
  });

  const result = data as GetTicketListingsData | undefined;

  const listings: TicketListingRow[] = (result?.ticket_listings ?? []).map(
    (listing) => ({
      id: String(listing.id),
      name: listing.name,
      location: listing.location,
      price: Number(listing.price),
      status: listing.status as ListingOccupancyStatus,
      promoted: Boolean(listing.promoted),
      offers: listing.listing_offers_aggregate?.aggregate?.count ?? 0,
      created_at: listing.created_at,
    }),
  );

  return {
    data: {
      ticket_listings: listings,
      ticket_listings_aggregate: {
        aggregate: {
          count: result?.ticket_listings_aggregate.aggregate?.count ?? 0,
        },
      },
    },
    loading,
    error: error as Error | undefined,
  };
}
