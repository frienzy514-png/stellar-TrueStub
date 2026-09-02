'use client';

import type { EventListing } from '@/types/event';
import ListingCard from './ListingCard';

interface TicketListingGridProps {
  listings: EventListing[];
  onApartmentClick: (listing: EventListing) => void;
}

export default function TicketListingGrid({
  listings,
  onApartmentClick,
}: TicketListingGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          onClick={() => onApartmentClick(listing)}
        />
      ))}
    </div>
  );
}
