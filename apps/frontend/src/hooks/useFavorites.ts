"use client";

import { useCallback, useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Favorited ticket-listing IDs for the current user.
 *
 * There is no favorites table in Hasura yet (the data model is still being
 * decided), so favorites persist in localStorage, namespaced per signed-in
 * Firebase user. Every component using this hook shares one store, so a
 * heart toggled on one page shows up on the others immediately. Swapping the
 * storage for a Hasura query/mutation later only touches this file.
 */

const EMPTY: readonly string[] = [];
const listeners = new Set<() => void>();
let cachedKey: string | null = null;
let cachedIds: readonly string[] = EMPTY;

function storageKey(): string {
  return `truestub:favorites:${auth.currentUser?.uid ?? "guest"}`;
}

function readIds(): readonly string[] {
  const key = storageKey();
  if (key === cachedKey) return cachedIds;

  let ids: readonly string[] = EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (Array.isArray(parsed)) ids = parsed.filter((id) => typeof id === "string");
  } catch {
    // Unreadable or blocked storage — treat as no favorites.
  }
  cachedKey = key;
  cachedIds = ids;
  return ids;
}

function writeIds(ids: readonly string[]) {
  const key = storageKey();
  cachedKey = key;
  cachedIds = ids;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage unavailable — keep the in-memory value for this session.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey()) {
      cachedKey = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  const unsubscribeAuth = onAuthStateChanged(auth, () => onChange());

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
    unsubscribeAuth();
  };
}

export function useFavorites() {
  const favoriteIds = useSyncExternalStore(subscribe, readIds, () => EMPTY);

  const isFavorite = useCallback(
    (id: string) => favoriteIds.includes(id),
    [favoriteIds]
  );

  const toggleFavorite = useCallback((id: string) => {
    const current = readIds();
    writeIds(
      current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id]
    );
  }, []);

  return { favoriteIds, isFavorite, toggleFavorite };
}
