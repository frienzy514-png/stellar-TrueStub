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

// TODO: replace with the authenticated user's id once the session is wired in.
export const ALERT_USER_ID = "current-user";

export const registerSavedSearch = (search: {
  eventName: string;
  maxPrice?: number;
  section?: string;
}) => send("POST", "/api/saved-searches", { userId: ALERT_USER_ID, ...search });

export const registerWatch = (listing: { listingId: string; eventName: string; price: number }) =>
  send("POST", "/api/watchlist", { userId: ALERT_USER_ID, ...listing });

export const unregisterWatch = (listingId: string) =>
  send("DELETE", `/api/watchlist/${encodeURIComponent(listingId)}?userId=${ALERT_USER_ID}`);

export const notifyListingCreated = (listing: {
  id: string;
  eventName: string;
  price: number;
  status?: string;
}) => send("POST", "/api/listings", listing);
