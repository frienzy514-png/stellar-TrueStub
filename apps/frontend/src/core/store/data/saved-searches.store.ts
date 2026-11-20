import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { registerSavedSearch, unregisterSavedSearch } from "@/lib/listing-alerts-api";

export interface SavedSearch {
  id: string;
  serverId?: string;
  eventName: string;
  maxPrice?: number;
  section?: string;
  createdAt: string;
  syncError?: string;
}
interface SavedSearchStore {
  searches: SavedSearch[];
  addSearch: (input: Omit<SavedSearch, "id" | "serverId" | "createdAt" | "syncError">) => Promise<void>;
  removeSearch: (id: string) => Promise<void>;
}

const retry = async <T,>(operation: () => Promise<T>, attempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Saved-search sync failed");
};

export const useSavedSearchStore = create<SavedSearchStore>()(
  devtools(
    persist(
      (set, get) => ({
        searches: [],
        addSearch: async (input) => {
          const local: SavedSearch = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
          set((state) => ({ searches: [local, ...state.searches] }), false, "savedSearches/add");
          try {
            const remote = await retry(() => registerSavedSearch(input));
            set((state) => ({ searches: state.searches.map((search) => search.id === local.id ? { ...search, serverId: remote.id, syncError: undefined } : search) }), false, "savedSearches/synced");
          } catch (error) {
            set((state) => ({ searches: state.searches.map((search) => search.id === local.id ? { ...search, syncError: error instanceof Error ? error.message : "Unable to sync saved search" } : search) }), false, "savedSearches/syncFailed");
            throw error;
          }
        },
        removeSearch: async (id) => {
          const search = get().searches.find((item) => item.id === id);
          if (!search) return;
          if (search.serverId) await retry(() => unregisterSavedSearch(search.serverId));
          set((state) => ({ searches: state.searches.filter((item) => item.id !== id) }), false, "savedSearches/remove");
        },
      }),
      { name: "truestub-saved-searches" },
    ),
    { name: "SavedSearchStore" },
  ),
);
