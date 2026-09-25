export type EarningsPeriod = "day" | "week" | "month";

export interface PayoutEscrow {
  id: string;
  listingName: string;
  amount: number;
  currency: string;
  status: string;
  /** ISO timestamp of the release, when funds reached the seller. */
  releasedAt?: string;
}

export interface EarningsBucket {
  /** Sortable bucket start, YYYY-MM-DD (UTC). */
  key: string;
  total: number;
  count: number;
}

export interface EarningsSummary {
  total: number;
  count: number;
  buckets: EarningsBucket[];
}

const RELEASED_STATUSES = ["released", "completed"];

export const isPayout = (e: PayoutEscrow) =>
  RELEASED_STATUSES.includes(e.status.toLowerCase()) && !!e.releasedAt;

function bucketKey(iso: string, period: EarningsPeriod): string {
  const d = new Date(iso);
  if (period === "month") d.setUTCDate(1);
  if (period === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  return d.toISOString().slice(0, 10);
}

/** Aggregate released escrows into per-period buckets, oldest first. */
export function summarizeEarnings(escrows: PayoutEscrow[], period: EarningsPeriod): EarningsSummary {
  const map = new Map<string, EarningsBucket>();
  let total = 0;
  let count = 0;

  for (const e of escrows) {
    if (!isPayout(e)) continue;
    const key = bucketKey(e.releasedAt!, period);
    const bucket = map.get(key) ?? { key, total: 0, count: 0 };
    bucket.total += e.amount;
    bucket.count += 1;
    map.set(key, bucket);
    total += e.amount;
    count += 1;
  }

  return { total, count, buckets: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)) };
}
