"use client";

import { useQuery } from '@apollo/client/react';
import FavoriteButton from '@/components/ticket-listing-mobile/mobile/FavoriteButton';
import { useFavorites } from '@/hooks/useFavorites';
import {
  GET_TICKET_LISTINGS_BY_IDS,
  formatListingAddress,
  type TicketListingRow,
} from '@/graphql/queries/ticket-listing-queries';

export default function FavoritesPage() {
  const { favoriteIds, isFavorite, toggleFavorite } = useFavorites();
  const { data, loading, error } = useQuery<{ apartments: TicketListingRow[] }>(
    GET_TICKET_LISTINGS_BY_IDS,
    {
      variables: { ids: favoriteIds },
      skip: favoriteIds.length === 0,
    },
  );

  const favorites =
    favoriteIds.length === 0
      ? []
      : (data?.apartments ?? []).filter((listing) => isFavorite(listing.id));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Favorites</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ticket listings you have saved
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Loading your favorites...</p>
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-600">
          <p className="text-sm">Could not load your favorites. Please try again.</p>
        </div>
      ) : favorites.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No favorites yet</p>
          <p className="text-sm mt-1">
            Save listings by clicking the heart icon on any listing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites.map((listing) => (
            <div
              key={listing.id}
              className="border rounded-xl p-4 bg-card space-y-3"
            >
              <div className="h-32 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {listing.image_urls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.image_urls[0]}
                    alt={listing.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No image
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{listing.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatListingAddress(listing.address)}
                  </p>
                  <p className="text-sm text-primary font-semibold mt-1">
                    ${listing.price.toLocaleString()}
                  </p>
                  {!listing.is_available && (
                    <p className="text-xs text-muted-foreground">No longer available</p>
                  )}
                </div>

                <FavoriteButton
                  isLiked={isFavorite(listing.id)}
                  onLike={() => toggleFavorite(listing.id)}
                  showCount={false}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
