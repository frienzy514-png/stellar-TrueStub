import type { LucideIcon } from "lucide-react";

export interface AnalyticsData {
  date: string;
  pageViews: number;
  clicks: number;
  users: number;
}

export interface EscrowAnalyticsData {
  date: string;
  volume: number;
  escrowsCreated: number;
  escrowsCompleted: number;
  disputes: number;
  disputeRate: number;
  avgReleaseHours: number;
}

export interface MetricData {
  label: string;
  value: number;
  change: number;
  trend: "up" | "down" | "neutral";
  icon: LucideIcon;
  color: "primary" | "success" | "warning" | "info";
  suffix?: string;
  isCurrency?: boolean;
}

export interface ChartConfig {
  dataKey: string;
  label: string;
  color: string;
  strokeWidth?: number;
  fillOpacity?: number;
}

// Generate mock traffic analytics data
export const generateMockData = (days: number = 30): AnalyticsData[] => {
  const data: AnalyticsData[] = [];
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const wave = (Math.sin(i * 0.9) + 1) / 2;
    const noise = (Math.sin(i * 0.17 + 1.3) + 1) / 2;

    const basePageViews = 100 + i * 5 + wave * 50;
    const baseClicks = 20 + i * 2 + noise * 10;
    const baseUsers = 50 + i * 3 + wave * 20;

    data.push({
      date: date.toISOString().split("T")[0],
      pageViews: Math.floor(basePageViews),
      clicks: Math.floor(baseClicks),
      users: Math.floor(baseUsers),
    });
  }

  return data;
};

// Generate platform-wide mock escrow & dispute analytics data
export const generateMockEscrowAnalyticsData = (days: number = 30): EscrowAnalyticsData[] => {
  const data: EscrowAnalyticsData[] = [];
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const wave = (Math.sin(i * 0.6) + 1) / 2;
    const noise = (Math.cos(i * 0.4) + 1) / 2;

    const escrowsCreated = Math.floor(15 + i * 0.8 + wave * 10);
    const escrowsCompleted = Math.floor(12 + i * 0.7 + wave * 9);
    const disputes = Math.max(0, Math.floor(noise * 2.2));
    const volume = Math.floor((escrowsCreated * 240) + wave * 1200 + noise * 800);
    const disputeRate = parseFloat(((disputes / Math.max(1, escrowsCreated)) * 100).toFixed(2));
    const avgReleaseHours = parseFloat((24 + wave * 8 - noise * 4).toFixed(1));

    data.push({
      date: date.toISOString().split("T")[0],
      volume,
      escrowsCreated,
      escrowsCompleted,
      disputes,
      disputeRate,
      avgReleaseHours,
    });
  }

  return data;
};

// Calculate percentage change between two values
export const calculateChange = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

// Format large numbers with appropriate suffixes
export const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return Number.isInteger(num) ? num.toString() : num.toFixed(1);
};

// Format currency values
export const formatCurrency = (num: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

// Default chart configurations for traffic
export const chartConfigs: Record<string, ChartConfig[]> = {
  line: [
    { dataKey: "pageViews", label: "Page Views", color: "#3b82f6", strokeWidth: 3 },
    { dataKey: "clicks", label: "Clicks", color: "#22c55e", strokeWidth: 3 },
    { dataKey: "users", label: "Unique Users", color: "#f59e0b", strokeWidth: 3 },
  ],
  bar: [
    { dataKey: "pageViews", label: "Page Views", color: "#3b82f6", fillOpacity: 0.8 },
    { dataKey: "clicks", label: "Clicks", color: "#22c55e", fillOpacity: 0.8 },
    { dataKey: "users", label: "Unique Users", color: "#f59e0b", fillOpacity: 0.8 },
  ],
  area: [
    { dataKey: "pageViews", label: "Page Views", color: "#3b82f6", fillOpacity: 0.3 },
    { dataKey: "clicks", label: "Clicks", color: "#22c55e", fillOpacity: 0.3 },
    { dataKey: "users", label: "Unique Users", color: "#f59e0b", fillOpacity: 0.3 },
  ],
};

// Escrow chart configurations
export const escrowChartConfigs: Record<string, ChartConfig[]> = {
  line: [
    { dataKey: "volume", label: "Volume ($)", color: "#3b82f6", strokeWidth: 3 },
    { dataKey: "escrowsCompleted", label: "Completed", color: "#22c55e", strokeWidth: 3 },
    { dataKey: "disputes", label: "Disputes", color: "#ef4444", strokeWidth: 3 },
    { dataKey: "avgReleaseHours", label: "Avg Release (hrs)", color: "#f59e0b", strokeWidth: 3 },
  ],
  bar: [
    { dataKey: "volume", label: "Volume ($)", color: "#3b82f6", fillOpacity: 0.8 },
    { dataKey: "escrowsCompleted", label: "Completed", color: "#22c55e", fillOpacity: 0.8 },
    { dataKey: "disputes", label: "Disputes", color: "#ef4444", fillOpacity: 0.8 },
  ],
  area: [
    { dataKey: "volume", label: "Volume ($)", color: "#3b82f6", fillOpacity: 0.3 },
    { dataKey: "escrowsCompleted", label: "Completed", color: "#22c55e", fillOpacity: 0.3 },
    { dataKey: "disputes", label: "Disputes", color: "#ef4444", fillOpacity: 0.3 },
  ],
};

// Export chart data as CSV
export const exportToCSV = (
  data: Array<Record<string, unknown>>,
  filename: string = "analytics-data",
) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => JSON.stringify(row[h] ?? "")).join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Date range presets
export const dateRangePresets = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last year", days: 365 },
];
