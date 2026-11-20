import { render, screen } from "@testing-library/react";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { useAnalyticsData } from "@/hooks/use-analytics-data";

jest.mock("@/hooks/use-analytics-data", () => ({
  useAnalyticsData: jest.fn(),
}));
jest.mock("@/hooks/use-dispute-metrics", () => ({
  useDisputeMetrics: () => ({
    metrics: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));
jest.mock("motion/react", () => {
  const React = require("react");
  const strip = ({
    initial: _i,
    animate: _a,
    transition: _t,
    ...rest
  }: Record<string, unknown>) => rest;
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) =>
          function Motion(props: Record<string, unknown>) {
            return React.createElement(tag, strip(props));
          },
      },
    ),
  };
});
jest.mock("./ChartContainer", () => ({
  ChartContainer: ({ title }: { title: string }) => (
    <div data-testid="chart-container">{title}</div>
  ),
}));
jest.mock("./DateRangePicker", () => ({ DateRangePicker: () => <div /> }));
jest.mock("./DisputeMetricsSection", () => ({
  DisputeMetricsSection: () => <div />,
}));
jest.mock("./MetricCard", () => ({
  MetricCard: ({ metric }: { metric: { label: string } }) => (
    <div data-testid="metric-card">{metric.label}</div>
  ),
}));

const mockedUseAnalyticsData = useAnalyticsData as jest.MockedFunction<
  typeof useAnalyticsData
>;

const health = {
  totalVolume: 0,
  activeEscrows: 0,
  totalCreated: 0,
  totalCompleted: 0,
  totalDisputes: 0,
  completionRate: 0,
  avgReleaseHours: 0,
  totalValueLocked: 0,
};

const baseReturn = {
  escrowChartData: [],
  escrowMetrics: [],
  platformHealth: health,
  hasData: false,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
};

describe("AnalyticsDashboard empty state", () => {
  it("shows a no-data message instead of zeroed charts when hasData is false", () => {
    mockedUseAnalyticsData.mockReturnValue({
      ...baseReturn,
      escrowMetrics: [
        {
          label: "Completion Rate",
          value: 0,
          change: 0,
          trend: "up",
        } as never,
      ],
    });

    render(<AnalyticsDashboard />);

    expect(screen.getByText("No Data Available")).toBeInTheDocument();
    expect(screen.getByText(/different date range/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chart-container")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metric-card")).not.toBeInTheDocument();
  });

  it("renders charts and no empty state when data exists", () => {
    mockedUseAnalyticsData.mockReturnValue({
      ...baseReturn,
      hasData: true,
      escrowChartData: [
        {
          date: "2026-01-01",
          volume: 100,
          escrowsCreated: 1,
          escrowsCompleted: 1,
          disputes: 0,
          disputeRate: 0,
          avgReleaseHours: 2,
        } as never,
      ],
    });

    render(<AnalyticsDashboard />);

    expect(screen.queryByText("No Data Available")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("chart-container").length).toBeGreaterThan(0);
  });

  it("does not show the empty state while loading", () => {
    mockedUseAnalyticsData.mockReturnValue({ ...baseReturn, isLoading: true });

    render(<AnalyticsDashboard />);

    expect(screen.queryByText("No Data Available")).not.toBeInTheDocument();
  });
});
