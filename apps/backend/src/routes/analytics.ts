import { Router } from "express";
import { hasuraClient } from "../lib/hasura";

// ── Cache (issue #624) ────────────────────────────────────────────────────

/**
 * Short-TTL in-process cache for analytics query results.
 *
 * Analytics data is read-only, recomputable, and non-authoritative — a brief
 * staleness window is acceptable for a platform-operator dashboard.  A 2-minute
 * TTL dramatically reduces Hasura load from repeated dashboard refreshes
 * without meaningfully harming the freshness operators need.
 *
 * The cache is keyed on the ISO-string pair "startIso|endIso" so different
 * date ranges are cached independently.  Entries are evicted lazily on the
 * next read once the TTL has elapsed; there is no background sweeper.
 *
 * Unlike the money-movement in-memory stores (refund claims, changelog), this
 * cache is safe to run in-process: it is read-only, deterministically
 * recomputable from Hasura, and losing it on restart is harmless.
 */
export const ANALYTICS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class AnalyticsCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Visible for testing. */
  get size(): number {
    return this.store.size;
  }

  /** Clears all entries — for testing. */
  clear(): void {
    this.store.clear();
  }
}

// Module-level singleton so the cache survives across requests in the same
// process lifetime.  Exported for tests to clear between cases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const analyticsCache = new AnalyticsCache<unknown>();

interface EscrowRow {
  amount: number | string;
  currency: string | null;
  status: string;
  created_at: string;
  released_at: string | null;
}

interface EscrowQueryResult {
  escrow_transactions: EscrowRow[];
}

interface EscrowAnalyticsDay {
  date: string;
  volume: number;
  escrowsCreated: number;
  escrowsCompleted: number;
  disputes: number;
  disputeRate: number;
  avgReleaseHours: number;
}

interface AssetBreakdownEntry {
  currency: string;
  volume: number;
  completedVolume: number;
  escrowsCreated: number;
  escrowsCompleted: number;
}

const PAGE_SIZE = 500;
const BASE_ACTIVE_STATUSES = [
  "pending", "funded", "active", "disputed", "created", "in_progress", "in_review", "held", "reserved"
];
const ACTIVE_STATUSES = [
  ...BASE_ACTIVE_STATUSES,
  ...BASE_ACTIVE_STATUSES.map((s) => s.toUpperCase()),
];
const COMPLETED_STATUSES = new Set(["completed", "released", "resolved"]);
const DOLLAR_DENOMINATED_CURRENCIES = new Set(["USD", "USDC"]);
const UNKNOWN_CURRENCY = "UNKNOWN";

/**
 * Fetches escrows across the WHOLE platform. There is deliberately no
 * `user_id`/owner/tenant filter here (issue #630): `/api/analytics` is a
 * platform-operator view and is mounted behind `requireAdmin` in `index.ts`.
 * Do not expose this router without admin gating, and do not reuse this helper
 * for anything user-facing. If per-operator scoping is ever needed, add a new
 * scoped endpoint rather than loosening this one — see
 * docs/ANALYTICS_ACCESS_MODEL.md.
 */
async function fetchEscrows(where: Record<string, unknown>): Promise<EscrowRow[]> {
  const query = `
    query AnalyticsEscrows(
      $where: escrow_transactions_bool_exp!
      $limit: Int!
      $offset: Int!
    ) {
      escrow_transactions(
        where: $where
        order_by: { created_at: asc, id: asc }
        limit: $limit
        offset: $offset
      ) {
        amount
        currency
        status
        created_at
        released_at
      }
    }
  `;
  const rows: EscrowRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await hasuraClient.request<EscrowQueryResult>(query, {
      where,
      limit: PAGE_SIZE,
      offset,
    });
    rows.push(...(result.escrow_transactions ?? []));
    if (result.escrow_transactions.length < PAGE_SIZE) break;
  }

  return rows;
}

export function currencyOf(row: EscrowRow): string {
  const currency = row.currency?.trim().toUpperCase();
  return currency ? currency : UNKNOWN_CURRENCY;
}

/**
 * Two amount accessors exist on purpose — they are NOT interchangeable, and the
 * different response sections rely on each one for a specific reason (#628).
 *
 * `amountOf` returns the amount only for dollar-denominated currencies
 * (USD/USDC, see DOLLAR_DENOMINATED_CURRENCIES) and `0` for anything else. It
 * backs the headline platform rollups — the daily chart's `volume` and the
 * `platformHealth` volume / TVL figures — which are deliberately scoped to
 * USD/USDC (#627). This platform supports non-dollar escrows (XLM, EURC, …),
 * but no price-conversion source is available to normalize them into a common
 * unit, so summing them straight into a single "total" would mix incompatible
 * currencies and produce a meaningless number. Non-dollar escrows are
 * therefore excluded from the dollar-denominated rollups rather than summed
 * incorrectly; the per-asset breakdown carries their real amounts instead.
 *
 * `rawAmountOf` returns the raw numeric amount regardless of currency. It
 * backs the per-asset breakdown, where every row is grouped under its own
 * currency so cross-currency mixing never happens and each asset's true
 * volume is preserved.
 *
 * Rule of thumb: reach for `rawAmountOf` whenever the result is partitioned by
 * currency; reach for `amountOf` only for the USD/USDC-denominated headline
 * totals. If a true cross-currency total is ever needed, add a conversion step
 * first — do not collapse these two functions into one that sums raw amounts
 * across currencies.
 */
export function amountOf(row: EscrowRow): number {
  if (!DOLLAR_DENOMINATED_CURRENCIES.has(row.currency?.toUpperCase() ?? "")) return 0;
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

export function rawAmountOf(row: EscrowRow): number {
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

export function releaseDurationHours(row: EscrowRow): number | null {
  if (!COMPLETED_STATUSES.has(row.status.toLowerCase()) || !row.released_at) return null;
  const createdAt = new Date(row.created_at).getTime();
  const releasedAt = new Date(row.released_at).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(releasedAt) || releasedAt < createdAt) {
    return null;
  }
  return (releasedAt - createdAt) / (60 * 60 * 1000);
}

export const analyticsRouter = Router();

analyticsRouter.get("/", async (req, res) => {
  const end = typeof req.query.end === "string" ? new Date(req.query.end) : new Date();
  const start = typeof req.query.start === "string"
    ? new Date(req.query.start)
    : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);

  if (
    !start ||
    !end ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start > end ||
    end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000
  ) {
    return res.status(400).json({ error: "A valid date range of at most 366 days is required" });
  }

  // #624 — short-TTL cache: a dashboard refresh for the same date range within
  // ANALYTICS_CACHE_TTL_MS is served from the cache instead of re-running the
  // full (unbounded) Hasura pagination query.
  const cacheKey = `${start.toISOString()}|${end.toISOString()}`;
  const cached = analyticsCache.get(cacheKey);
  if (cached !== undefined) {
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const [periodRows, activeRows] = await Promise.all([
      fetchEscrows({ created_at: { _gte: start.toISOString(), _lte: end.toISOString() } }),
      fetchEscrows({ status: { _in: ACTIVE_STATUSES } }),
    ]);

    const buckets = new Map<string, EscrowAnalyticsDay>();
    const firstDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const lastDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

    for (let day = firstDay; day <= lastDay; day += 24 * 60 * 60 * 1000) {
      const date = new Date(day).toISOString().slice(0, 10);
      buckets.set(date, {
        date,
        volume: 0,
        escrowsCreated: 0,
        escrowsCompleted: 0,
        disputes: 0,
        disputeRate: 0,
        avgReleaseHours: 0,
      });
    }

    let completedDurationTotal = 0;
    let completedDurationCount = 0;
    const completedDurationsByDay = new Map<string, { total: number; count: number }>();
    const assetBreakdown = new Map<string, AssetBreakdownEntry>();

    const assetEntry = (currency: string): AssetBreakdownEntry => {
      let entry = assetBreakdown.get(currency);
      if (!entry) {
        entry = { currency, volume: 0, completedVolume: 0, escrowsCreated: 0, escrowsCompleted: 0 };
        assetBreakdown.set(currency, entry);
      }
      return entry;
    };

    for (const row of periodRows) {
      const date = new Date(row.created_at).toISOString().slice(0, 10);
      const bucket = buckets.get(date);
      if (!bucket) continue;

      const status = row.status.toLowerCase();
      const currency = currencyOf(row);
      const entry = assetEntry(currency);
      const rawAmount = rawAmountOf(row);

      bucket.volume += amountOf(row);
      bucket.escrowsCreated += 1;
      entry.volume += rawAmount;
      entry.escrowsCreated += 1;
      if (COMPLETED_STATUSES.has(status)) {
        bucket.escrowsCompleted += 1;
        entry.escrowsCompleted += 1;
        entry.completedVolume += rawAmount;
        const duration = releaseDurationHours(row);
        if (duration !== null) {
          bucket.avgReleaseHours += duration;
          completedDurationTotal += duration;
          completedDurationCount += 1;
          const dailyDuration = completedDurationsByDay.get(date) ?? { total: 0, count: 0 };
          dailyDuration.total += duration;
          dailyDuration.count += 1;
          completedDurationsByDay.set(date, dailyDuration);
        }
      }
      if (status === "disputed") bucket.disputes += 1;
    }

    for (const bucket of buckets.values()) {
      bucket.disputeRate = bucket.escrowsCreated
        ? (bucket.disputes / bucket.escrowsCreated) * 100
        : 0;
      const dailyDuration = completedDurationsByDay.get(bucket.date);
      bucket.avgReleaseHours = dailyDuration ? dailyDuration.total / dailyDuration.count : 0;
    }

    const chartData = Array.from(buckets.values());
    const totalCreated = periodRows.length;
    const totalCompleted = chartData.reduce((sum, bucket) => sum + bucket.escrowsCompleted, 0);
    const totalDisputes = chartData.reduce((sum, bucket) => sum + bucket.disputes, 0);

    const payload = {
      escrowChartData: chartData,
      assetBreakdown: Array.from(assetBreakdown.values()).sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
      platformHealth: {
        // These headline totals are USD/USDC-denominated only: `bucket.volume`
        // and `amountOf(row)` both zero out non-dollar currencies (see #627,
        // and the amountOf/rawAmountOf distinction documented above). No
        // price-conversion source exists to normalize XLM/EURC/etc. into a
        // common unit, so they are intentionally excluded from the rollup
        // rather than summed incorrectly. The full, per-currency picture
        // lives in `assetBreakdown` (which uses `rawAmountOf`).
        totalVolumeUsd: chartData.reduce((sum, bucket) => sum + bucket.volume, 0),
        activeEscrows: activeRows.length,
        totalCreated,
        totalCompleted,
        totalDisputes,
        completionRate: totalCreated ? (totalCompleted / totalCreated) * 100 : 0,
        avgReleaseHours: completedDurationCount
          ? completedDurationTotal / completedDurationCount
          : 0,
        totalValueLockedUsd: activeRows.reduce((sum, row) => sum + amountOf(row), 0),
      },
      hasData: periodRows.length > 0,
    };

    // #624 — only successful computations are cached; a 502 (Hasura failure)
    // must never be served stale-free-but-wrong from the cache on a retry.
    analyticsCache.set(cacheKey, payload, ANALYTICS_CACHE_TTL_MS);

    res.set("X-Cache", "MISS");
    return res.json(payload);
  } catch {
    return res.status(502).json({ error: "Failed to load platform analytics" });
  }
});