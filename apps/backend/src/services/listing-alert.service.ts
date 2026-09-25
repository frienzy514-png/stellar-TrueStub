/**
 * ListingAlertService — issues #187 (saved searches) and #189 (watchlist)
 *
 * - Saved search: a buyer stores (event, price ceiling, section preference).
 *   When a new listing is created, every matching saved search is notified.
 * - Watchlist: a buyer bookmarks a listing. When its price changes, or it is
 *   about to sell (reserved / pending / sold), every watcher is notified.
 *
 * Both reuse NotificationService (email + push) and persist an in-app row via
 * HasuraService.insertNotification. Storage is in-process, like RefundService;
 * the store maps are the seam to swap for a shared DB in multi-node setups.
 */

import { randomUUID } from "crypto";
import { NotificationService } from "./notification.service";
import { HasuraService } from "./hasura.service";

export interface SavedSearchInput {
  userId: string;
  eventName: string;
  maxPrice?: number;
  section?: string;
  email?: string;
  pushToken?: string;
}

export interface SavedSearch extends SavedSearchInput {
  id: string;
  createdAt: string;
}

export interface ListingSnapshot {
  id: string;
  eventName: string;
  price: number;
  section?: string;
  status?: string;
}

export interface WatchInput {
  userId: string;
  listingId: string;
  eventName?: string;
  price?: number;
  email?: string;
  pushToken?: string;
}

export interface WatchEntry extends WatchInput {
  createdAt: string;
}

const ABOUT_TO_SELL_STATUSES = ["reserved", "pending", "sold"];

const normalize = (value?: string) => (value ?? "").trim().toLowerCase();

export function searchMatchesListing(search: SavedSearch, listing: ListingSnapshot): boolean {
  const wanted = normalize(search.eventName);
  if (wanted && !normalize(listing.eventName).includes(wanted)) return false;
  if (search.maxPrice !== undefined && listing.price > search.maxPrice) return false;
  const section = normalize(search.section);
  if (section && !normalize(listing.section).includes(section)) return false;
  return true;
}

export class ListingAlertService {
  private readonly searches = new Map<string, SavedSearch>();
  private readonly watches = new Map<string, WatchEntry>();

  private static baseUrl() {
    return process.env.FRONTEND_URL || "https://truestub.com";
  }

  // ── Saved searches ──────────────────────────────────────────────────────

  createSearch(input: SavedSearchInput): SavedSearch {
    const search: SavedSearch = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.searches.set(search.id, search);
    return search;
  }

  listSearches(userId: string): SavedSearch[] {
    return [...this.searches.values()].filter((s) => s.userId === userId);
  }

  deleteSearch(id: string, userId: string): boolean {
    const existing = this.searches.get(id);
    if (!existing || existing.userId !== userId) return false;
    return this.searches.delete(id);
  }

  /** Notify every saved search matching a newly created listing. Returns notified search ids. */
  async notifyNewListing(listing: ListingSnapshot): Promise<string[]> {
    const matches = [...this.searches.values()].filter(
      (s) => searchMatchesListing(s, listing)
    );
    await Promise.all(
      matches.map((s) =>
        this.deliver(
          s,
          "listing_match",
          `🎟️ New listing: ${listing.eventName}`,
          `A ticket for ${listing.eventName}${listing.section ? ` (${listing.section})` : ""} was listed for ${listing.price} USDC, matching your saved search.`,
          `${ListingAlertService.baseUrl()}/rent/${listing.id}`
        )
      )
    );
    return matches.map((s) => s.id);
  }

  // ── Watchlist ───────────────────────────────────────────────────────────

  watch(input: WatchInput): WatchEntry {
    const entry: WatchEntry = { ...input, createdAt: new Date().toISOString() };
    this.watches.set(`${input.userId}:${input.listingId}`, entry);
    return entry;
  }

  unwatch(userId: string, listingId: string): boolean {
    return this.watches.delete(`${userId}:${listingId}`);
  }

  listWatched(userId: string): WatchEntry[] {
    return [...this.watches.values()].filter((w) => w.userId === userId);
  }

  /**
   * Notify watchers of a listing after an update. `previousPrice` is the price
   * before the update; a notification is sent on any price change, and when
   * the status moves to reserved / pending / sold ("about to sell").
   */
  async notifyListingUpdate(
    listing: ListingSnapshot,
    previousPrice?: number
  ): Promise<{ priceChange: string[]; aboutToSell: string[] }> {
    const watchers = [...this.watches.values()].filter((w) => w.listingId === listing.id);
    const result = { priceChange: [] as string[], aboutToSell: [] as string[] };
    const url = `${ListingAlertService.baseUrl()}/rent/${listing.id}`;
    const priceChanged = previousPrice !== undefined && previousPrice !== listing.price;
    const aboutToSell = ABOUT_TO_SELL_STATUSES.includes(normalize(listing.status));

    for (const w of watchers) {
      if (priceChanged) {
        const direction = listing.price < previousPrice! ? "dropped" : "increased";
        await this.deliver(
          w,
          "watchlist_price_change",
          `💸 Price ${direction}: ${listing.eventName}`,
          `The price of a listing you're watching ${direction} from ${previousPrice} to ${listing.price} USDC.`,
          url
        );
        result.priceChange.push(w.userId);
      }
      if (aboutToSell) {
        await this.deliver(
          w,
          "watchlist_about_to_sell",
          `⏳ About to sell: ${listing.eventName}`,
          `A listing you're watching is now ${normalize(listing.status)} — act fast if you still want it.`,
          url
        );
        result.aboutToSell.push(w.userId);
      }
    }
    return result;
  }

  private async deliver(
    target: { userId: string; email?: string; pushToken?: string },
    type: string,
    title: string,
    message: string,
    actionUrl: string
  ): Promise<void> {
    await Promise.all([
      NotificationService.notifyListingAlert({
        subject: title,
        messageText: message,
        actionUrl,
        recipientEmail: target.email,
        recipientPushToken: target.pushToken,
      }),
      HasuraService.insertNotification({ userId: target.userId, type, title, message }),
    ]);
  }
}

export const listingAlertService = new ListingAlertService();
