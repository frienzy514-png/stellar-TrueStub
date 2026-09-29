import { db } from '../config/firebase';
import { ListingAlert, CreateListingAlertInput } from '../types/listing-alert';

const COLLECTION = 'listingAlerts';

/**
 * Create a listing alert for the given (already authenticated) user.
 * The userId must be derived from a verified Firebase ID token by the caller.
 */
export async function createListingAlert(
  userId: string,
  input: CreateListingAlertInput
): Promise<ListingAlert> {
  const now = new Date().toISOString();
  const ref = db.collection(COLLECTION).doc();

  const alert: ListingAlert = {
    id: ref.id,
    userId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(alert);
  return alert;
}

/**
 * List alerts belonging to the authenticated user only.
 */
export async function getListingAlerts(userId: string): Promise<ListingAlert[]> {
  const snapshot = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as ListingAlert);
}

/**
 * Delete an alert, but only if it belongs to the authenticated user.
 * Returns true when a matching alert was deleted, false otherwise.
 */
export async function deleteListingAlert(
  userId: string,
  alertId: string
): Promise<boolean> {
  const ref = db.collection(COLLECTION).doc(alertId);
  const doc = await ref.get();

  if (!doc.exists) {
    return false;
  }

  const alert = doc.data() as ListingAlert;
  if (alert.userId !== userId) {
    return false;
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

  /**
   * Backend job: compare each watched listing's current price against the
   * price recorded at watch-time and notify the watcher on any change.
   *
   * `fetchListing` resolves the current snapshot for a listing id (e.g. from
   * the listings table). Watches without a recorded price are skipped, since
   * there is no baseline to compare against. Returns the notified user ids.
   */
  async detectWatchlistPriceChanges(
    fetchListing: (listingId: string) => Promise<ListingSnapshot | undefined>
  ): Promise<string[]> {
    const notified: string[] = [];
    const seen = new Set<string>();

    for (const w of this.watches.values()) {
      if (w.price === undefined) continue;
      const key = `${w.userId}:${w.listingId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const listing = await fetchListing(w.listingId);
      if (!listing || listing.price === w.price) continue;

      const direction = listing.price < w.price ? "dropped" : "increased";
      await this.deliver(
        w,
        "watchlist_price_change",
        `💸 Price ${direction}: ${listing.eventName}`,
        `The price of a listing you're watching ${direction} from ${w.price} to ${listing.price} USDC.`,
        `${ListingAlertService.baseUrl()}/rent/${listing.id}`
      );
      notified.push(w.userId);
    }

    return notified;
  }

  /**
   * Simple scheduler callback for a listing price-check job.
   * Notifies all watchers whose stored baseline differs from the current price.
   */
  async checkPriceChange(listingId: string, currentPrice: number): Promise<string[]> {
    const notified: string[] = [];

    for (const watcher of this.watches.values()) {
      if (watcher.listingId !== listingId || watcher.price === undefined) continue;
      if (watcher.price === currentPrice) continue;

      const direction = currentPrice < watcher.price ? "dropped" : "increased";
      await this.deliver(
        watcher,
        "watchlist_price_change",
        `💸 Price ${direction}: ${watcher.listingId}`,
        `The price of a listing you're watching ${direction} from ${watcher.price} to ${currentPrice} USDC.`,
        `${ListingAlertService.baseUrl()}/rent/${watcher.listingId}`
      );
      notified.push(watcher.userId);
    }

    return notified;
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
