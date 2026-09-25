"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import {
  RefreshCw,
  TrendingUp,
  Shield,
  Layers,
  Activity,
  AlertCircle,
  Clock,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "./MetricCard";
import { ChartContainer, MetricButtonItem } from "./ChartContainer";
import { DateRangePicker } from "./DateRangePicker";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { escrowChartConfigs, formatCurrency, formatNumber } from "@/lib/chart-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface DateRange {
  start: Date;
  end: Date;
}

export const AnalyticsDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange | null>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start, end };
  });

  const {
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
  } = useAnalyticsData({
    dateRange,
    refreshInterval: 60000,
  });

  const handleRefresh = () => {
    refetch();
    toast.success("Data Refreshed", {
      description: "Platform analytics have been updated successfully.",
    });
  };

  const handleDateRangeChange = (newRange: DateRange | null) => {
    setDateRange(newRange);
  };

  const escrowMetricButtons: MetricButtonItem[] = [
    { key: "volume", label: "Volume ($)", color: "#3b82f6" },
    { key: "escrowsCompleted", label: "Completed", color: "#22c55e" },
    { key: "disputes", label: "Disputes", color: "#ef4444" },
    { key: "avgReleaseHours", label: "Avg Release (hrs)", color: "#f59e0b" },
  ];

  const disputeMetricButtons: MetricButtonItem[] = [
    { key: "disputes", label: "Disputes", color: "#ef4444" },
    { key: "disputeRate", label: "Dispute Rate (%)", color: "#f59e0b" },
  ];

  const timeMetricButtons: MetricButtonItem[] = [
    { key: "avgReleaseHours", label: "Avg Release Time (hrs)", color: "#06b6d4" },
    { key: "escrowsCompleted", label: "Completed Escrows", color: "#22c55e" },
  ];

  if (error) {
    return (
      <Card className="p-8 border-destructive/20 bg-destructive/5">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-destructive mb-2">
            Error Loading Analytics
          </h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-blue-500/5 rounded-full blur-2xl" />
        <div className="absolute top-3/4 right-1/3 w-32 h-32 bg-blue-500/8 rounded-full blur-xl" />
      </div>

      <div className="relative z-10 space-y-6 sm:space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col min-[671px]:flex-row min-[671px]:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                {t("analytics.title")}
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">
                Operator View
              </span>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t("analytics.subtitle")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {/* Mode Switcher */}
            <div className="flex items-center p-1 bg-slate-800 rounded-lg border border-slate-700">
              <Button
                size="sm"
                variant={mode === "escrow" ? "default" : "ghost"}
                onClick={() => setMode("escrow")}
                className={cn(
                  "h-8 text-xs font-medium text-white",
                  mode === "escrow" && "bg-primary text-primary-foreground"
                )}
              >
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Escrow & Disputes
              </Button>
              <Button
                size="sm"
                variant={mode === "traffic" ? "default" : "ghost"}
                onClick={() => setMode("traffic")}
                className={cn(
                  "h-8 text-xs font-medium text-white",
                  mode === "traffic" && "bg-primary text-primary-foreground"
                )}
              >
                <Activity className="w-3.5 h-3.5 mr-1.5" />
                Traffic
              </Button>
            </div>

            {/* Live Data indicator */}
            <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 backdrop-blur-sm">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2 h-2 bg-green-400 rounded-full"
              />
              <span className="text-xs text-muted-foreground">Live Data</span>
            </div>

            <DateRangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              className="w-full sm:w-auto"
            />
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={isLoading}
              className={cn(
                "border-slate-700 hover:border-blue-500/30 w-full sm:w-auto",
                isLoading && "opacity-50",
              )}
            >
              <RefreshCw
                className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </motion.div>

        {/* Platform Health Overview Banner (when in escrow mode) */}
        {mode === "escrow" && !isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-800/60 border border-slate-700/80 rounded-xl p-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Total Value Locked</span>
              <p className="text-lg sm:text-xl font-bold text-white">
                {formatCurrency(platformHealth.totalValueLocked)}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Active Contracts</span>
              <p className="text-lg sm:text-xl font-bold text-cyan-400">
                {platformHealth.activeEscrows}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Dispute Resolution</span>
              <p className="text-lg sm:text-xl font-bold text-green-400">
                {platformHealth.disputeResolutionRate}%
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Completed Volume</span>
              <p className="text-lg sm:text-xl font-bold text-blue-400">
                {formatCurrency(platformHealth.totalVolume)}
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-6 border-slate-700 bg-slate-800/30">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-24 mb-2"></div>
                  <div className="h-8 bg-muted rounded w-16 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-20"></div>
                </div>
              </Card>
            ))}
          </motion.div>
        )}

        {/* Metrics Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(mode === "escrow" ? escrowMetrics : metrics).map((metric, index) => (
              <MetricCard
                key={metric.label}
                metric={metric}
                index={index}
                isCurrency={metric.isCurrency}
              />
            ))}
          </div>
        )}

        {/* Escrow Mode Charts Section */}
        {mode === "escrow" && !isLoading && escrowChartData.length > 0 && (
          <div className="space-y-8 text-white">
            {/* Main Escrow Volume Chart */}
            <ChartContainer
              data={escrowChartData}
              title="Escrow Volume & Completion Trends"
              description="Aggregate platform volume, completed payouts, and active escrow contracts over time"
              defaultType="area"
              height={420}
              showExport={true}
              customConfigs={escrowChartConfigs}
              metricButtons={escrowMetricButtons}
              initialSelectedMetrics={["volume", "escrowsCompleted"]}
              isCurrency={true}
            />

            {/* Secondary Charts: Dispute Rate & Time to Release */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartContainer
                data={escrowChartData}
                title="Dispute Rate Trends"
                description="Daily dispute frequency and platform dispute rate percentage"
                defaultType="line"
                height={350}
                showExport={false}
                customConfigs={escrowChartConfigs}
                metricButtons={disputeMetricButtons}
                initialSelectedMetrics={["disputeRate", "disputes"]}
              />

              <ChartContainer
                data={escrowChartData}
                title="Time-to-Release Trends"
                description="Average duration in hours from funding to milestone release"
                defaultType="bar"
                height={350}
                showExport={false}
                customConfigs={escrowChartConfigs}
                metricButtons={timeMetricButtons}
                initialSelectedMetrics={["avgReleaseHours"]}
              />
            </div>
          </div>
        )}

        {/* Traffic Mode Charts Section */}
        {mode === "traffic" && !isLoading && data.length > 0 && (
          <div className="space-y-8 text-white">
            <ChartContainer
              data={data}
              title="Traffic Overview"
              description="Interactive visualization of page views and interactions over time"
              defaultType="line"
              height={420}
              showExport={true}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartContainer
                data={data}
                title="Engagement"
                description="User interaction trends"
                defaultType="area"
                height={350}
                showExport={false}
              />

              <ChartContainer
                data={data}
                title="User Growth"
                description="Active user metrics"
                defaultType="bar"
                height={350}
                showExport={false}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && ((mode === "escrow" ? escrowChartData.length : data.length) === 0) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <Card className="p-12 border-slate-700 bg-slate-800/30 max-w-md mx-auto">
              <TrendingUp className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                No Data Available
              </h3>
              <p className="text-muted-foreground mb-6">
                No platform transactions found for the selected date range.
              </p>
              <Button onClick={handleRefresh} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Data
              </Button>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};
