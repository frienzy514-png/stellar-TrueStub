import type { ClaimedRefund, RefundStore } from "./refund.service";

// ── In-memory store (tests only) ────────────────────────────────────────────────

/** Default bounds for the in-memory store (#538), mirroring the webhook dedup map. */
export const REFUND_STORE_MAX = 10_000;
export const REFUND_STORE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export class InMemoryRefundStore implements RefundStore {
  private readonly store = new Map<string, ClaimedRefund>();

  constructor(
    private readonly maxSize = REFUND_STORE_MAX,
    private readonly ttlMs = REFUND_STORE_TTL_MS,
  ) {}

  /** Drops expired records, then the oldest ones while over `maxSize`. */
  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, record] of this.store) {
      if (new Date(record.claimedAt).getTime() < cutoff) {
        this.store.delete(id);
      }
    }
    // Map preserves insertion order, so the oldest entries come first.
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  async has(refundId: string): Promise<boolean> {
    return this.store.has(refundId);
  }

  async get(refundId: string): Promise<ClaimedRefund | undefined> {
    return this.store.get(refundId);
  }

  async set(refundId: string, record: ClaimedRefund): Promise<void> {
    this.store.set(refundId, record);
  }

  async insertIfAbsent(refundId: string, record: ClaimedRefund): Promise<boolean> {
    // Single-threaded event loop: the has+set below cannot interleave with
    // another insertIfAbsent call, so this is atomic for the in-memory store.
    if (this.store.has(refundId)) {
      return false;
    }
    this.store.set(refundId, record);
    this.prune();
    return true;
  }

  async cleanupBefore(cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [id, record] of this.store) {
      if (new Date(record.claimedAt) < cutoff) {
        this.store.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** Visible for testing — returns the raw map size. */
  get size(): number {
    return this.store.size;
  }
}
