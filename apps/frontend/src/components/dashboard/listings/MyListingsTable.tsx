"use client";

import { useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListingStatusBadge } from "@/components/dashboard/listings/ListingStatusBadge";
import { ListingActionsMenu } from "@/components/dashboard/listings/ListingActionsMenu";
import { useTicketListings } from "@/hooks/useTicketListings";

const ITEMS_PER_PAGE = 5;

export function MyListingsTable() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const offset = page * ITEMS_PER_PAGE;

  const { data, loading, error } = useTicketListings({
    limit: ITEMS_PER_PAGE,
    offset,
    search,
  });

  const listings = data.ticket_listings;
  const total = data.ticket_listings_aggregate.aggregate.count;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          My listings
        </h1>
        <Button asChild className="w-fit bg-orange-500 text-white hover:bg-orange-600">
          <Link href="/dashboard/listings/new">
            <Home className="mr-2 h-4 w-4" />
            New listing
          </Link>
        </Button>
      </div>

      <Input
        placeholder="Search anything..."
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
        className="max-w-xs"
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {listings.length} of {total}
        </span>
        <span>Items per page: {ITEMS_PER_PAGE}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID No.</TableHead>
              <TableHead>Listing name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Offers</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Promoted</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || error || listings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {loading
                    ? "Loading listings..."
                    : error
                      ? "Failed to load listings."
                      : "No listings found."}
                </TableCell>
              </TableRow>
            ) : (
              listings.map((listing, index) => (
                <TableRow key={listing.id}>
                  <TableCell className="text-muted-foreground">
                    {offset + index + 1}
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    {listing.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {listing.location}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {listing.offers}
                  </TableCell>
                  <TableCell>
                    <ListingStatusBadge status={listing.status} />
                  </TableCell>
                  <TableCell>
                    {listing.promoted && (
                      <span className="text-lg text-orange-500" aria-label="Promoted listing">
                        🔥
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    ${listing.price.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <ListingActionsMenu listingId={Number(listing.id)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Showing {listings.length} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              title="Previous page"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
              className="px-2 text-sm disabled:opacity-40"
            >
              ←
            </button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <button
              type="button"
              aria-label="Next page"
              title="Next page"
              disabled={(page + 1) * ITEMS_PER_PAGE >= total}
              onClick={() => setPage((current) => current + 1)}
              className="px-2 text-sm disabled:opacity-40"
            >
              →
            </button>
          </div>
          <span className="text-sm text-muted-foreground">
            Items per page: {ITEMS_PER_PAGE}
          </span>
        </div>
      )}
    </div>
  );
}