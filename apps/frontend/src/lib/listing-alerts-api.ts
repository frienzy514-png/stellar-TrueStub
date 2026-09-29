import { auth } from "@/lib/firebase";

/**
 * Best-effort client for the backend saved-search (#187) and watchlist (#189)
 * endpoints. Local zustand stores stay the source of truth for the UI; these
 * calls register the alert with the backend so notifications can be delivered.
 * Failures are swallowed so the UI keeps working offline.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

async function send(method: string, path: string, body?: unknown): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Backend unreachable — the alert stays local until the next sync.
  }
}

function getAlertUserId(): string | null {
  return auth.currentUser?.uid ?? null;
}

export const registerSavedSearch = (search: {
  eventName: string;
  maxPrice?: number;
  section?: string;
}) => {
  const userId = getAlertUserId();
  return userId
    ? send("POST", "/api/saved-searches", { userId, ...search })
    : Promise.resolve();
};

export const registerWatch = (listing: { listingId: string; eventName: string; price: number }) => {
  const userId = getAlertUserId();
  return userId
    ? send("POST", "/api/watchlist", { userId, ...listing })
    : Promise.resolve();
};

export const unregisterWatch = (listingId: string) => {
  const userId = getAlertUserId();
  if (!userId) return Promise.resolve();
  const query = new URLSearchParams({ userId });
  return send("DELETE", `/api/watchlist/${encodeURIComponent(listingId)}?${query}`);
};

export const notifyListingCreated = (listing: {
  id: string;
  eventName: string;
  price: number;
  status?: string;
}) => send("POST", "/api/listings", listing);
