import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { registerSavedSearch, unregisterSavedSearch } from "@/lib/listing-alerts-api";

export interface SavedSearch {
  id: string;
  /** Backend saved-search identifier returned by POST /api/saved-searches. */
  serverId?: string;
  eventName: string;
  /** Price ceiling in USDC; undefined means any price. */
  maxPrice?: number;
  /** Section preference, matched as a case-insensitive substring. */
  section?: string;
  createdAt: string;
  /** Error message when backend deletion failed and awaits retry. */
  deleteError?: string;
}

interface SavedSearchStore {
  searches: SavedSearch[];
  /** Backend IDs whose deletion failed and should be retried on recovery. */
  pendingDeleteIds: string[];
  /** Latest user-visible synchronization error. */
  lastError: string | null;
  addSearch: (
    input: Omit<SavedSearch, "id" | "createdAt" | "serverId" | "deleteError">,
  ) => Promise<SavedSearch>;
  removeSearch: (id: string) => Promise<boolean>;
  retryPendingDeletes: () => Promise<boolean>;
  clearError: () => void;
}

const DELETE_FAILURE_MESSAGE =
  "Failed to delete saved search from server. Please retry.";

const removedWhileRegistering = new Set<string>();

function generateLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useSavedSearchStore = create<SavedSearchStore>()(
  devtools(
    persist(
      (set, get) => ({
        searches: [],
        pendingDeleteIds: [],
        lastError: null,

        clearError: () => set({ lastError: null }, false, "savedSearches/clearError"),

        addSearch: async (input) => {
          const localEntry: SavedSearch = {
            ...input,
            id: generateLocalId(),
            createdAt: new Date().toISOString(),
          };

          set(
            (state) => ({
              searches: [localEntry, ...state.searches],
              lastError: null,
            }),
            false,
            "savedSearches/add",
          );

          const registered = await registerSavedSearch(input);
          if (!registered?.id) {
            return localEntry;
          }

          if (removedWhileRegistering.has(localEntry.id)) {
            removedWhileRegistering.delete(localEntry.id);
            const cleanedUp = await unregisterSavedSearch(registered.id);
            if (!cleanedUp) {
              set(
                (state) => ({
                  pendingDeleteIds: Array.from(
                    new Set([...state.pendingDeleteIds, registered.id]),
                  ),
                  lastError: DELETE_FAILURE_MESSAGE,
                }),
                false,
                "savedSearches/queueOrphanDelete",
              );
            }
            return { ...localEntry, serverId: registered.id };
          }

          const updatedEntry: SavedSearch = { ...localEntry, serverId: registered.id };
          set(
            (state) => ({
              searches: state.searches.map((s) =>
                s.id === localEntry.id ? { ...s, serverId: registered.id } : s,
              ),
            }),
            false,
            "savedSearches/mapServerId",
          );
          return updatedEntry;
        },

        removeSearch: async (id) => {
          const state = get();
          const target = state.searches.find((s) => s.id === id || s.serverId === id);

          if (!target) {
            if (state.pendingDeleteIds.includes(id)) {
              const ok = await unregisterSavedSearch(id);
              if (ok) {
                set(
                  (current) => ({
                    pendingDeleteIds: current.pendingDeleteIds.filter((pid) => pid !== id),
                    lastError:
                      current.pendingDeleteIds.filter((pid) => pid !== id).length === 0
                        ? null
                        : current.lastError,
                  }),
                  false,
                  "savedSearches/removePending",
                );
              }
              return ok;
            }
            return false;
          }

          set(
            (current) => ({
              searches: current.searches.filter((s) => s.id !== target.id),
              lastError: null,
            }),
            false,
            "savedSearches/removeOptimistic",
          );

          if (!target.serverId) {
            removedWhileRegistering.add(target.id);
            return true;
          }

          const deleted = await unregisterSavedSearch(target.serverId);
          if (deleted) {
            set(
              (current) => ({
                pendingDeleteIds: current.pendingDeleteIds.filter(
                  (pid) => pid !== target.serverId,
                ),
              }),
              false,
              "savedSearches/removeConfirmed",
            );
            return true;
          }

          const failedEntry: SavedSearch = {
            ...target,
            deleteError: DELETE_FAILURE_MESSAGE,
          };

          set(
            (current) => ({
              searches: current.searches.some((s) => s.id === target.id)
                ? current.searches.map((s) => (s.id === target.id ? failedEntry : s))
                : [failedEntry, ...current.searches],
              pendingDeleteIds: Array.from(
                new Set([...current.pendingDeleteIds, target.serverId!]),
              ),
              lastError: DELETE_FAILURE_MESSAGE,
            }),
            false,
            "savedSearches/removeFailed",
          );
          return false;
        },

        retryPendingDeletes: async () => {
          const state = get();
          const serverIds = Array.from(
            new Set([
              ...state.pendingDeleteIds,
              ...state.searches
                .filter((s) => Boolean(s.deleteError && s.serverId))
                .map((s) => s.serverId as string),
            ]),
          );

          if (serverIds.length === 0) {
            set({ lastError: null }, false, "savedSearches/retryNoop");
            return true;
          }

          const results = await Promise.all(
            serverIds.map(async (serverId) => ({
              serverId,
              ok: await unregisterSavedSearch(serverId),
            })),
          );

          const succeeded = new Set(
            results.filter((r) => r.ok).map((r) => r.serverId),
          );
          const failed = results.filter((r) => !r.ok).map((r) => r.serverId);

          set(
            (current) => ({
              searches: current.searches.filter(
                (s) => !(s.serverId && succeeded.has(s.serverId)),
              ),
              pendingDeleteIds: failed,
              lastError: failed.length === 0 ? null : DELETE_FAILURE_MESSAGE,
            }),
            false,
            "savedSearches/retryComplete",
          );

          return failed.length === 0;
        },
      }),
      { name: "truestub-saved-searches" },
    ),
    { name: "SavedSearchStore" },
  ),
);
