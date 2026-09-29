import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  DollarSign,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  EscrowAnalyticsData,
  MetricData,
  calculateChange,
} from "@/lib/chart-utils";
import { auth } from "@/lib/firebase";

interface UseAnalyticsDataOptions {
  dateRange: { start: Date; end: Date } | null;
  refreshInterval?: number;
}

export interface PlatformHealthSummary {
  totalVolume: number;
  activeEscrows: number;
  totalCreated: number;
  totalCompleted: number;
  totalDisputes: number;
  completionRate: number;
  avgReleaseHours: number;
  totalValueLocked: number;
}

interface AnalyticsResponse {
  escrowChartData: EscrowAnalyticsData[];
  platformHealth: PlatformHealthSummary;
  hasData: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

interface UseAnalyticsDataReturn {
  escrowChartData: EscrowAnalyticsData[];
  escrowMetrics: MetricData[];
  platformHealth: PlatformHealthSummary;
  hasData: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<boolean>;
}

/**
 * Provides aggregate platform-wide analytics data for operators & administrators,
 * covering Escrow Volume, Dispute Rates, and Completion/Release Time trends.
 */
export const useAnalyticsData = ({
  dateRange,
  refreshInterval = 60000,
}: UseAnalyticsDataOptions): UseAnalyticsDataReturn => {
  const [escrowChartData, setEscrowChartData] = useState<EscrowAnalyticsData[]>([]);
  const [escrowMetrics, setEscrowMetrics] = useState<MetricData[]>([]);
  const [hasData, setHasData] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [platformHealth, setPlatformHealth] = useState<PlatformHealthSummary>({
    totalVolume: 0,
    activeEscrows: 0,
    totalCreated: 0,
    totalCompleted: 0,
    totalDisputes: 0,
    completionRate: 0,
    avgReleaseHours: 0,
    totalValueLocked: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateEscrowMetrics = useCallback(
    (escrowList: EscrowAnalyticsData[], health: PlatformHealthSummary): MetricData[] => {
      const emptyDay = {
        volume: 0,
        escrowsCreated: 0,
        escrowsCompleted: 0,
        disputes: 0,
        disputeRate: 0,
        avgReleaseHours: 0,
      };
      const latest = escrowList.at(-1) ?? emptyDay;
      const previous = escrowList.at(-2) ?? emptyDay;
      const latestCompletionRate = latest.escrowsCreated
        ? (latest.escrowsCompleted / latest.escrowsCreated) * 100
        : 0;
      const previousCompletionRate = previous.escrowsCreated
        ? (previous.escrowsCompleted / previous.escrowsCreated) * 100
        : 0;
      const disputeRate = health.totalCreated
        ? (health.totalDisputes / health.totalCreated) * 100
        : 0;

      return [
        {
          label: "USD / USDC Escrow Volume",
          value: health.totalVolume,
          change: calculateChange(latest.volume, previous.volume),
          trend: latest.volume >= previous.volume ? "up" : "down",
          icon: DollarSign,
          color: "primary",
          isCurrency: true,
        },
        {
          label: "Dispute Rate",
          value: Number(disputeRate.toFixed(2)),
          change: latest.disputeRate - previous.disputeRate,
          trend: latest.disputeRate <= previous.disputeRate ? "up" : "down",
          icon: AlertTriangle,
          color: health.totalDisputes === 0 ? "success" : "warning",
          suffix: "%",
        },
        {
          label: "Avg Time to Release",
          value: Number(health.avgReleaseHours.toFixed(1)),
          change: previous.avgReleaseHours - latest.avgReleaseHours,
          trend: latest.avgReleaseHours <= previous.avgReleaseHours ? "up" : "down",
          icon: Clock,
          color: "info",
          suffix: " hrs",
        },
        {
          label: "Completion Rate",
          value: Number(health.completionRate.toFixed(1)),
          change: latestCompletionRate - previousCompletionRate,
          trend: latestCompletionRate >= previousCompletionRate ? "up" : "down",
          icon: ShieldCheck,
          color: "success",
          suffix: "%",
        },
      ];
    },
    [],
  );

  const fetchData = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        setError("Sign in with an administrator account to view platform analytics.");
        return false;
      }

      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (dateRange) {
        params.set("start", dateRange.start.toISOString());
        const endOfSelectedDay = new Date(dateRange.end);
        endOfSelectedDay.setHours(23, 59, 59, 999);
        params.set("end", endOfSelectedDay.toISOString());
      }

      const response = await fetch(`${BACKEND_URL}/api/analytics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 || response.status === 403) {
        setError("Administrator access is required to view platform analytics.");
        return false;
      }
      if (!response.ok) throw new Error("Analytics service is unavailable");

      const result = (await response.json()) as AnalyticsResponse;
      setEscrowChartData(result.escrowChartData);
      setPlatformHealth(result.platformHealth);
      setHasData(result.hasData);
      setEscrowMetrics(generateEscrowMetrics(result.escrowChartData, result.platformHealth));
      return true;
    } catch {
      setError("Failed to load live platform analytics. Please try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, generateEscrowMetrics]);

  const refetch = fetchData;

  useEffect(() => {
    return onAuthStateChanged(auth, () => {
      setAuthReady(true);
      void fetchData();
    });
  }, [fetchData]);

  useEffect(() => {
    if (authReady && refreshInterval > 0) {
      const interval = setInterval(() => void fetchData(), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [authReady, fetchData, refreshInterval]);

  return {
    escrowChartData,
    escrowMetrics,
    platformHealth,
    hasData,
    isLoading,
    error,
    refetch,
  };
};
