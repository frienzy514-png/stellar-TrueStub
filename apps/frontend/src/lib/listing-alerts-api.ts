import { auth } from "@/lib/firebase";

/**
 * Client for the backend saved-search (#187, #503) and watchlist (#189)
 * endpoints. Local zustand stores stay the source of truth for the UI; these
 * calls synchronize alerts with the backend so notifications can be delivered
 * and cancelled when removed.
 *
 * Identity comes from the signed-in Firebase user's ID token, sent as a Bearer
 * token; the backend derives the user from that token, never from the body (#382).
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export interface RegisteredSavedSearch {
  id: string;
  eventName: string;
  maxPrice?: number;
  section?: string;
  createdAt?: string;
}

async function send(method: string, path: string, body?: unknown): Promise<Response | null> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null; // Signed out — nothing to register against.
    return await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Backend unreachable — caller decides how to handle offline/retry state.
    return null;
  }
}

export async function registerSavedSearch(search: {
  eventName: string;
  maxPrice?: number;
  section?: string;
}): Promise<RegisteredSavedSearch | null> {
  const response = await send("POST", "/api/saved-searches", search);
  if (!response || !response.ok) {
    return null;
  }
  try {
    const data = (await response.json()) as Partial<RegisteredSavedSearch> | null;
    if (data && typeof data.id === "string" && data.id.trim().length > 0) {
      return {
        id: data.id,
        eventName: data.eventName ?? search.eventName,
        maxPrice: data.maxPrice ?? search.maxPrice,
        section: data.section ?? search.section,
        createdAt: data.createdAt,
      };
    }
  } catch {
    // Ignore malformed JSON responses.
  }
  return null;
}

export async function unregisterSavedSearch(id: string): Promise<boolean> {
  const trimmed = id.trim();
  if (!trimmed) return false;
  const response = await send("DELETE", `/api/saved-searches/${encodeURIComponent(trimmed)}`);
  return Boolean(response && response.ok);
}

export const deleteSavedSearch = unregisterSavedSearch;

export const registerWatch = async (listing: {
  listingId: string;
  eventName: string;
  price: number;
}): Promise<void> => {
  await send("POST", "/api/watchlist", listing);
};

export const unregisterWatch = async (listingId: string): Promise<void> => {
  await send("DELETE", `/api/watchlist/${encodeURIComponent(listingId)}`);
};

export const notifyListingCreated = async (listing: {
  id: string;
  eventName: string;
  price: number;
  status?: string;
}): Promise<void> => {
  await send("POST", "/api/listings", listing);
};
