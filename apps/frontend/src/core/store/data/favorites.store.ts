import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { STUB_EVENTS } from "@/lib/mockData/events";
import { registerWatch, unregisterWatch } from "@/lib/listing-alerts-api";

interface FavoritesGlobalStore {
  /** IDs of ticket listings the user has saved to watch. */
  savedListingIds: string[];
  /** Price (USDC) each saved listing had when it was saved, to detect changes. */
  savedPrices: Record<string, number>;
  isSaved: (listingId: string) => boolean;
  toggleSaved: (listingId: string) => void;
  removeSaved: (listingId: string) => void;
}

const FAVORITES_ACTIONS = {
  TOGGLE: "favorites/toggle",
  REMOVE: "favorites/remove",
} as const;

// TODO: replace the stub seed with the user's saved listings from Hasura
const INITIAL_SAVED = STUB_EVENTS.filter((event) => event.favorite);
const INITIAL_SAVED_IDS = INITIAL_SAVED.map((event) => event.id);
const INITIAL_SAVED_PRICES = Object.fromEntries(
  INITIAL_SAVED.map((event) => [event.id, event.price]),
);

/** Current price/name for a listing — swap for a Hasura lookup with the stub. */
const lookupListing = (id: string) => STUB_EVENTS.find((event) => event.id === id);

export const useFavoritesStore = create<FavoritesGlobalStore>()(
  devtools(
    persist(
      (set, get) => ({
        savedListingIds: INITIAL_SAVED_IDS,
        savedPrices: INITIAL_SAVED_PRICES,

        isSaved: (listingId) => get().savedListingIds.includes(listingId),

        toggleSaved: (listingId) => {
          const wasSaved = get().savedListingIds.includes(listingId);
          const listing = lookupListing(listingId);
          set(
            (state) => ({
              savedListingIds: wasSaved
                ? state.savedListingIds.filter((id) => id !== listingId)
                : [...state.savedListingIds, listingId],
              savedPrices:
                wasSaved || !listing
                  ? state.savedPrices
                  : { ...state.savedPrices, [listingId]: listing.price },
            }),
            false,
            FAVORITES_ACTIONS.TOGGLE,
          );
          if (wasSaved) void unregisterWatch(listingId);
          else if (listing)
            void registerWatch({ listingId, eventName: listing.name, price: listing.price });
        },

        removeSaved: (listingId) => {
          set(
            (state) => ({
              savedListingIds: state.savedListingIds.filter(
                (id) => id !== listingId,
              ),
            }),
            false,
            FAVORITES_ACTIONS.REMOVE,
          );
          void unregisterWatch(listingId);
        },
      }),
      { name: "truestub-saved-listings" },
    ),
    { name: "FavoritesStore" },
  ),
);
