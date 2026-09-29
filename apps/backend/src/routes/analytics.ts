import { Router } from "express";
import { hasuraClient } from "../lib/hasura";

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

const PAGE_SIZE = 500;
const ACTIVE_STATUSES = [
  "pending", "funded", "active", "disputed",
  "PENDING", "FUNDED", "ACTIVE", "DISPUTED",
];
const COMPLETED_STATUSES = new Set(["completed", "released", "resolved"]);
const DOLLAR_DENOMINATED_CURRENCIES = new Set(["USD", "USDC"]);

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

function amountOf(row: EscrowRow): number {
  if (!DOLLAR_DENOMINATED_CURRENCIES.has(row.currency?.toUpperCase() ?? "")) return 0;
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function releaseDurationHours(row: EscrowRow): number | null {
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

    for (const row of periodRows) {
      const date = new Date(row.created_at).toISOString().slice(0, 10);
      const bucket = buckets.get(date);
      if (!bucket) continue;

      const status = row.status.toLowerCase();
      bucket.volume += amountOf(row);
      bucket.escrowsCreated += 1;
      if (COMPLETED_STATUSES.has(status)) {
        bucket.escrowsCompleted += 1;
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

    return res.json({
      escrowChartData: chartData,
      platformHealth: {
        totalVolume: chartData.reduce((sum, bucket) => sum + bucket.volume, 0),
        activeEscrows: activeRows.length,
        totalCreated,
        totalCompleted,
        totalDisputes,
        completionRate: totalCreated ? (totalCompleted / totalCreated) * 100 : 0,
        avgReleaseHours: completedDurationCount
          ? completedDurationTotal / completedDurationCount
          : 0,
        totalValueLocked: activeRows.reduce((sum, row) => sum + amountOf(row), 0),
      },
      hasData: periodRows.length > 0,
    });
  } catch {
    return res.status(502).json({ error: "Failed to load platform analytics" });
  }
});