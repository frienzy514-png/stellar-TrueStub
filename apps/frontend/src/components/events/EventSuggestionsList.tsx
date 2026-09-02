'use client';

import type { EventListing } from '@/types/event';
import { useEffect, useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import EventSuggestionCard from './EventSuggestionCard';

interface EventSuggestionsListProps {
  listings: EventListing[];
  onSelect?: (id: string) => void;
}

export default function EventSuggestionsList({
  listings,
  onSelect,
}: EventSuggestionsListProps) {
  const [likedById, setLikedById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLikedById((currentLikes) =>
      Object.fromEntries(
        listings.map((listing) => [
          listing.id,
          currentLikes[listing.id] ?? listing.favorite ?? false,
        ])
      )
    );
  }, [listings]);

  const handleLike = (id: string) => {
    setLikedById((currentLikes) => ({
      ...currentLikes,
      [id]: !currentLikes[id],
    }));
  };

  return (
    <aside className="w-full border-b border-[#e8e1da] px-6 py-8 lg:w-[320px] lg:border-b-0 lg:border-r">
      <div className="mb-6">
        <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-[#181818]">
          Suggestions
        </h2>
        <p className="mt-4 text-sm text-[#202020]">
          More than 200 units available
        </p>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          icon={CalendarSearch}
          title="No suggestions available"
          description="Check back later for events that match your interests."
        />
      ) : (
        <div className="space-y-4">
          {listings.slice(0, 5).map((listing) => (
            <EventSuggestionCard
              key={listing.id}
              id={listing.id}
              name={listing.name}
              address={listing.address}
              price={listing.price}
              seatCount={listing.seatCount}
              rowCount={listing.rowCount}
              mobileTransfer={listing.mobileTransfer}
              image={listing.images[0]}
              isLiked={likedById[listing.id] ?? listing.favorite ?? false}
              onLike={handleLike}
              onClick={onSelect}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
