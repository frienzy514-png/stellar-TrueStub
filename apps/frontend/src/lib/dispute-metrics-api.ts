import { auth } from "@/lib/firebase";

/**
 * Client for the backend dispute-metrics endpoint (#273).
 * Mirrors `DisputeMetrics` in apps/backend/src/services/dispute.service.ts.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export type DisputeState = "OPEN" | "ESCALATED" | "RESOLVED" | "WITHDRAWN";

export interface DisputeMetrics {
  total: number;
  byState: Record<DisputeState, number>;
  active: number;
  closed: number;
  escalatedCount: number;
  escalationRate: number;
  resolutionRate: number;
  avgResolutionHours: number | null;
  overdueEscalated: number;
}

export async function fetchDisputeMetrics(
  range: { start: Date; end: Date } | null,
  signal?: AbortSignal,
): Promise<DisputeMetrics> {
  const query = new URLSearchParams();
  if (range) {
    query.set("from", range.start.toISOString());
    query.set("to", range.end.toISOString());
  }

  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BACKEND_URL}/api/disputes/metrics?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  if (!res.ok) {
    throw new Error(`Dispute metrics request failed (${res.status})`);
  }
  const body = (await res.json()) as { metrics: DisputeMetrics };
  return body.metrics;
}
