import { auth } from "@/lib/firebase";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to sync saved searches with the server.");
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `Saved-search request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface RegisteredSavedSearch {
  id: string;
  eventName: string;
  maxPrice?: number;
  section?: string;
  createdAt?: string;
}

export const registerSavedSearch = (search: {
  eventName: string;
  maxPrice?: number;
  section?: string;
}) => send<RegisteredSavedSearch>("POST", "/api/saved-searches", search);

export const unregisterSavedSearch = (serverId: string) =>
  send<void>("DELETE", `/api/saved-searches/${encodeURIComponent(serverId)}`);

export const registerWatch = (listing: { listingId: string; eventName: string; price: number }) =>
  send("POST", "/api/watchlist", listing);
export const unregisterWatch = (listingId: string) =>
  send<void>("DELETE", `/api/watchlist/${encodeURIComponent(listingId)}`);
export const notifyListingCreated = (listing: { id: string; eventName: string; price: number; status?: string }) =>
  send("POST", "/api/listings", listing);
