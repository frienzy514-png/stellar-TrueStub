import { useCallback, useEffect, useState } from "react";
import {
  DollarSign,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Eye,
  MousePointerClick,
  Users,
  BarChart3,
} from "lucide-react";
import {
  AnalyticsData,
  EscrowAnalyticsData,
  MetricData,
  calculateChange,
  generateMockData,
  generateMockEscrowAnalyticsData,
} from "@/lib/chart-utils";

interface UseAnalyticsDataOptions {
  dateRange: { start: Date; end: Date } | null;
  refreshInterval?: number;
}

export interface PlatformHealthSummary {
  totalVolume: number;
  activeEscrows: number;
  totalCompleted: number;
  totalDisputes: number;
  disputeResolutionRate: number;
  avgReleaseHours: number;
  totalValueLocked: number;
}

interface UseAnalyticsDataReturn {
  data: AnalyticsData[];
  metrics: MetricData[];
  escrowChartData: EscrowAnalyticsData[];
  escrowMetrics: MetricData[];
  platformHealth: PlatformHealthSummary;
  mode: "escrow" | "traffic";
  setMode: (mode: "escrow" | "traffic") => void;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Provides aggregate platform-wide analytics data for operators & administrators,
 * covering Escrow Volume, Dispute Rates, and Completion/Release Time trends.
 */
export const useAnalyticsData = ({
  dateRange,
  refreshInterval = 60000,
}: UseAnalyticsDataOptions): UseAnalyticsDataReturn => {
  const [mode, setMode] = useState<"escrow" | "traffic">("escrow");
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [escrowChartData, setEscrowChartData] = useState<EscrowAnalyticsData[]>([]);
  const [escrowMetrics, setEscrowMetrics] = useState<MetricData[]>([]);
  const [platformHealth, setPlatformHealth] = useState<PlatformHealthSummary>({
    totalVolume: 0,
    activeEscrows: 0,
    totalCompleted: 0,
    totalDisputes: 0,
    disputeResolutionRate: 98.5,
    avgReleaseHours: 24.5,
    totalValueLocked: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateDaysBetween = useCallback((start: Date, end: Date): number => {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  }, []);

  const generateTrafficMetrics = useCallback(
    (analyticsData: AnalyticsData[]): MetricData[] => {
      if (analyticsData.length < 1) return [];

      const latest = analyticsData[analyticsData.length - 1];
      const previous =
        analyticsData.length > 1
          ? analyticsData[analyticsData.length - 2]
          : { pageViews: 0, clicks: 0, users: 0 };

      const totalPageViews = analyticsData.reduce((sum, item) => sum + item.pageViews, 0);
      const totalClicks = analyticsData.reduce((sum, item) => sum + item.clicks, 0);
      const totalUsers = analyticsData.reduce((sum, item) => sum + item.users, 0);
      const maxDailyUsers = Math.max(...analyticsData.map((item) => item.users));

      return [
        {
          label: "Total Page Views",
          value: totalPageViews,
          change: calculateChange(latest.pageViews, previous.pageViews),
          trend: latest.pageViews >= previous.pageViews ? "up" : "down",
          icon: Eye,
          color: "primary",
        },
        {
          label: "Total Interactions",
          value: totalClicks,
          change: calculateChange(latest.clicks, previous.clicks),
          trend: latest.clicks >= previous.clicks ? "up" : "down",
          icon: MousePointerClick,
          color: "success",
        },
        {
          label: "Active Users (Peak)",
          value: maxDailyUsers,
          change: calculateChange(latest.users, previous.users),
          trend: latest.users >= previous.users ? "up" : "down",
          icon: Users,
          color: "info",
        },
        {
          label: "Avg Actions/User",
          value: totalUsers > 0 ? (totalPageViews + totalClicks) / totalUsers : 0,
          change: 0,
          trend: "neutral",
          icon: BarChart3,
          color: "warning",
        },
      ];
    },
    [],
  );

  const generateEscrowMetrics = useCallback(
    (escrowList: EscrowAnalyticsData[]): { metrics: MetricData[]; health: PlatformHealthSummary } => {
      if (escrowList.length < 1) {
        return {
          metrics: [],
          health: {
            totalVolume: 0,
            activeEscrows: 0,
            totalCompleted: 0,
            totalDisputes: 0,
            disputeResolutionRate: 98.5,
            avgReleaseHours: 24.5,
            totalValueLocked: 0,
          },
        };
      }

      const latest = escrowList[escrowList.length - 1];
      const previous =
        escrowList.length > 1
          ? escrowList[escrowList.length - 2]
          : { volume: 0, escrowsCreated: 0, escrowsCompleted: 0, disputes: 0, avgReleaseHours: 24 };

      const totalVolume = escrowList.reduce((sum, item) => sum + item.volume, 0);
      const totalCreated = escrowList.reduce((sum, item) => sum + item.escrowsCreated, 0);
      const totalCompleted = escrowList.reduce((sum, item) => sum + item.escrowsCompleted, 0);
      const totalDisputes = escrowList.reduce((sum, item) => sum + item.disputes, 0);
      const avgReleaseHours =
        escrowList.reduce((sum, item) => sum + item.avgReleaseHours, 0) / escrowList.length;
      const overallDisputeRate = (totalDisputes / Math.max(1, totalCreated)) * 100;
      const activeEscrows = Math.max(0, totalCreated - totalCompleted);
      const totalValueLocked = Math.floor(totalVolume * 0.18);

      const metricsList: MetricData[] = [
        {
          label: "Total Escrow Volume",
          value: totalVolume,
          change: calculateChange(latest.volume, previous.volume),
          trend: latest.volume >= previous.volume ? "up" : "down",
          icon: DollarSign,
          color: "primary",
          isCurrency: true,
        },
        {
          label: "Dispute Rate",
          value: parseFloat(overallDisputeRate.toFixed(2)),
          change: calculateChange(latest.disputeRate, previous.disputeRate || 1),
          trend: latest.disputeRate <= (previous.disputeRate || 1) ? "up" : "down",
          icon: AlertTriangle,
          color: overallDisputeRate < 3 ? "success" : "warning",
          suffix: "%",
        },
        {
          label: "Avg Time to Release",
          value: parseFloat(avgReleaseHours.toFixed(1)),
          change: calculateChange(previous.avgReleaseHours, latest.avgReleaseHours),
          trend: latest.avgReleaseHours <= previous.avgReleaseHours ? "up" : "down",
          icon: Clock,
          color: "info",
          suffix: " hrs",
        },
        {
          label: "Platform Health",
          value: parseFloat(((totalCompleted / Math.max(1, totalCreated)) * 100).toFixed(1)),
          change: 1.2,
          trend: "up",
          icon: ShieldCheck,
          color: "success",
          suffix: "%",
        },
      ];

      return {
        metrics: metricsList,
        health: {
          totalVolume,
          activeEscrows,
          totalCompleted,
          totalDisputes,
          disputeResolutionRate: 98.2,
          avgReleaseHours: parseFloat(avgReleaseHours.toFixed(1)),
          totalValueLocked,
        },
      };
    },
    [],
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const days = dateRange
        ? calculateDaysBetween(dateRange.start, dateRange.end)
        : 30;

      let trafficData = generateMockData(days);
      let escrowData = generateMockEscrowAnalyticsData(days);

      if (dateRange) {
        trafficData = trafficData.filter((item) => {
          const itemDate = new Date(`${item.date}T00:00:00`);
          return itemDate >= dateRange.start && itemDate <= dateRange.end;
        });
        escrowData = escrowData.filter((item) => {
          const itemDate = new Date(`${item.date}T00:00:00`);
          return itemDate >= dateRange.start && itemDate <= dateRange.end;
        });
      }

      setData(trafficData);
      setMetrics(generateTrafficMetrics(trafficData));

      setEscrowChartData(escrowData);
      const { metrics: eMetrics, health } = generateEscrowMetrics(escrowData);
      setEscrowMetrics(eMetrics);
      setPlatformHealth(health);
    } catch (err) {
      setError("Failed to fetch analytics data");
      console.error("Analytics data fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, calculateDaysBetween, generateTrafficMetrics, generateEscrowMetrics]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return {
    data,
    metrics,
    escrowChartData,
    escrowMetrics,
    platformHealth,
    mode,
    setMode,
    isLoading,
    error,
    refetch,
  };
};
