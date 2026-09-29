"use client";

import React from "react";
import { AlertTriangle, Clock, Gavel, Scale, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DisputeMetrics, DisputeState } from "@/lib/dispute-metrics-api";
import { formatNumber } from "@/lib/chart-utils";

interface DisputeMetricsSectionProps {
  metrics: DisputeMetrics | null;
  /** Escrows created in the same date range — denominator for the dispute rate. */
  totalEscrows: number;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

const OUTCOMES: { state: DisputeState; label: string; color: string }[] = [
  { state: "RESOLVED", label: "Resolved", color: "#22c55e" },
  { state: "WITHDRAWN", label: "Withdrawn", color: "#94a3b8" },
  { state: "ESCALATED", label: "Escalated", color: "#f59e0b" },
  { state: "OPEN", label: "Open", color: "#3b82f6" },
];

function formatDuration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Dispute-resolution metrics (#273): volume, dispute rate against total
 * escrows, average time to resolution, and outcome breakdown.
 */
export const DisputeMetricsSection: React.FC<DisputeMetricsSectionProps> = ({
  metrics,
  totalEscrows,
  isLoading,
  error,
  onRetry,
}) => {
  if (error) {
    return (
      <Card className="p-6 border-slate-700 bg-slate-800/30 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Dispute Resolution</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={onRetry} variant="outline" size="sm" className="border-slate-700">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (isLoading && !metrics) {
    return (
      <Card className="p-6 border-slate-700 bg-slate-800/30">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
          <div className="h-3 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  if (!metrics) return null;

  const disputeRate = totalEscrows > 0 ? metrics.total / totalEscrows : null;
  const stats = [
    {
      label: "Dispute Volume",
      value: formatNumber(metrics.total),
      detail: `${metrics.active} active · ${metrics.closed} closed`,
      icon: Gavel,
      tint: "bg-red-500/10 text-red-400",
    },
    {
      label: "Dispute Rate",
      value: disputeRate === null ? "—" : percent(disputeRate),
      detail: `of ${formatNumber(totalEscrows)} escrows`,
      icon: AlertTriangle,
      tint: "bg-amber-500/10 text-amber-400",
    },
    {
      label: "Avg Resolution Time",
      value: formatDuration(metrics.avgResolutionHours),
      detail: "open → resolved / withdrawn",
      icon: Clock,
      tint: "bg-cyan-500/10 text-cyan-400",
    },
    {
      label: "Escalation Rate",
      value: percent(metrics.escalationRate),
      detail:
        metrics.overdueEscalated > 0
          ? `${metrics.overdueEscalated} past SLA`
          : "none past SLA",
      icon: Scale,
      tint: "bg-blue-500/10 text-blue-400",
    },
  ];

  return (
    <Card className="p-6 border-slate-700 bg-slate-800/30 text-white space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Dispute Resolution</h3>
        <p className="text-sm text-muted-foreground">
          Disputes opened in the selected range, how long they took to close, and how they ended
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${stat.tint}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground truncate">{stat.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Outcome Breakdown</p>
        {metrics.total === 0 ? (
          <p className="text-sm text-muted-foreground">No disputes in this range.</p>
        ) : (
          <>
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-slate-700 gap-0.5"
              role="img"
              aria-label={OUTCOMES.map(
                (o) => `${o.label}: ${metrics.byState[o.state]}`,
              ).join(", ")}
            >
              {OUTCOMES.filter((o) => metrics.byState[o.state] > 0).map((o) => (
                <div
                  key={o.state}
                  style={{
                    width: `${(metrics.byState[o.state] / metrics.total) * 100}%`,
                    backgroundColor: o.color,
                  }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {OUTCOMES.map((o) => (
                <li key={o.state} className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: o.color }}
                  />
                  <span className="text-muted-foreground">{o.label}</span>
                  <span className="font-semibold tabular-nums">
                    {metrics.byState[o.state]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({percent(metrics.byState[o.state] / metrics.total)})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
};
