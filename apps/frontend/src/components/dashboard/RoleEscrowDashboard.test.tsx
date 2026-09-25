import { render, screen } from '@testing-library/react';
import { RoleEscrowDashboard } from './RoleEscrowDashboard';

// Mock the recording primitives directly rather than relying on jsdom's
// (inconsistent) support for the real User Timing API — this test asserts
// the wiring (usePerformanceTracking is actually called), not browser
// Performance API behavior, which performance-monitor.ts's own
// feature-detection already guards.
const mockStartMeasure = jest.fn();
const mockEndMeasure = jest.fn();
jest.mock('@/utils/performance-monitor', () => ({
  performanceMonitor: {
    startMeasure: (label: string) => mockStartMeasure(label),
    endMeasure: (label: string) => mockEndMeasure(label),
    getAllMetrics: () => ({}),
  },
}));

jest.mock('./DashboardHeader', () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

jest.mock('./EscrowsByStatus', () => ({
  EscrowsByStatus: () => <div data-testid="escrows-by-status" />,
}));

jest.mock('./RecentActivity', () => ({
  RecentActivity: () => <div data-testid="recent-activity" />,
}));

jest.mock('./QuickActions', () => ({
  QuickActions: () => <div data-testid="quick-actions" />,
}));

jest.mock('./EscrowTable', () => ({
  EscrowTable: () => <div data-testid="escrow-table" />,
}));

describe('RoleEscrowDashboard', () => {
  it('renders a link to the full escrow page from recent transactions', () => {
    render(<RoleEscrowDashboard userRole="guest" escrows={[]} />);

    const link = screen.getByRole('link', { name: /view all/i });

    expect(link).toHaveAttribute('href', '/dashboard/escrow');
  });

  it('reports its load time to the performance monitor (see #136)', () => {
    // Regression test: usePerformanceTracking must actually be wired in, not
    // just defined, or the dev-only Query Performance panel stays empty
    // forever. Loading -> loaded should start then end one measurement keyed
    // by role, matching the label used in RoleEscrowDashboard.
    mockStartMeasure.mockClear();
    mockEndMeasure.mockClear();

    const { rerender } = render(
      <RoleEscrowDashboard userRole="guest" escrows={[]} isLoading={true} />,
    );
    expect(mockStartMeasure).toHaveBeenCalledWith('RoleEscrowDashboard:guest');
    expect(mockEndMeasure).not.toHaveBeenCalled();

    rerender(
      <RoleEscrowDashboard userRole="guest" escrows={[]} isLoading={false} />,
    );
    expect(mockEndMeasure).toHaveBeenCalledWith('RoleEscrowDashboard:guest');
  });
});
