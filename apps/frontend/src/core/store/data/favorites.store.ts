import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { STUB_EVENTS } from "@/lib/mockData/events";
import { registerWatch, unregisterWatch } from "@/lib/listing-alerts-api";
import { fetchSavedListings } from "@/graphql/queries/savedListings";

interface FavoritesGlobalStore {
  /** IDs of ticket listings the user has saved to watch. */
  savedListingIds: string[];
  /** Price (USDC) each saved listing had when it was saved, to detect changes. */
  savedPrices: Record<string, number>;
  /** Whether the store has hydrated from the backend at least once. */
  hydrated: boolean;
  isSaved: (listingId: string) => boolean;
  toggleSaved: (listingId: string) => void;
  removeSaved: (listingId: string) => void;
  /** Load the user's saved listings from Hasura and merge into local state. */
  hydrateFromBackend: () => Promise<void>;
}

const FAVORITES_ACTIONS = {
  TOGGLE: "favorites/toggle",
  REMOVE: "favorites/remove",
  HYDRATE: "favorites/hydrate",
} as const;

/** Current price/name for a listing — swap for a Hasura lookup with the stub. */
const lookupListing = (id: string) => STUB_EVENTS.find((event) => event.id === id);

export const useFavoritesStore = create<FavoritesGlobalStore>()(
  devtools(
    persist(
      (set, get) => ({
        savedListingIds: [],
        savedPrices: {},
        hydrated: false,

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

        hydrateFromBackend: async () => {
          const saved = await fetchSavedListings();
          if (!saved) return;
          set(
            () => ({
              savedListingIds: saved.map((listing) => listing.id),
              savedPrices: Object.fromEntries(
                saved.map((listing) => [listing.id, listing.price]),
              ),
              hydrated: true,
            }),
            false,
            FAVORITES_ACTIONS.HYDRATE,
          );
        },
      }),
      { name: "truestub-saved-listings" },
    ),
    { name: "FavoritesStore" },
  ),
);
