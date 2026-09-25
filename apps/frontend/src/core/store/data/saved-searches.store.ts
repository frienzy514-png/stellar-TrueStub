import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { registerSavedSearch } from "@/lib/listing-alerts-api";

export interface SavedSearch {
  id: string;
  eventName: string;
  /** Price ceiling in USDC; undefined means any price. */
  maxPrice?: number;
  /** Section preference, matched as a case-insensitive substring. */
  section?: string;
  createdAt: string;
}

interface SavedSearchStore {
  searches: SavedSearch[];
  addSearch: (input: Omit<SavedSearch, "id" | "createdAt">) => void;
  removeSearch: (id: string) => void;
}

export const useSavedSearchStore = create<SavedSearchStore>()(
  devtools(
    persist(
      (set) => ({
        searches: [],
        addSearch: (input) => {
          set(
            (state) => ({
              searches: [
                { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
                ...state.searches,
              ],
            }),
            false,
            "savedSearches/add",
          );
          void registerSavedSearch(input);
        },
        removeSearch: (id) =>
          set(
            (state) => ({ searches: state.searches.filter((s) => s.id !== id) }),
            false,
            "savedSearches/remove",
          ),
      }),
      { name: "truestub-saved-searches" },
    ),
    { name: "SavedSearchStore" },
  ),
);
