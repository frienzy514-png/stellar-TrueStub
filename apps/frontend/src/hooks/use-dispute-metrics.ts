import { useCallback, useEffect, useRef, useState } from "react";
import { DisputeMetrics, fetchDisputeMetrics } from "@/lib/dispute-metrics-api";

interface UseDisputeMetricsOptions {
  dateRange: { start: Date; end: Date } | null;
  refreshInterval?: number;
}

interface UseDisputeMetricsReturn {
  metrics: DisputeMetrics | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Dispute-resolution metrics for the operator analytics dashboard (#273),
 * sourced from the backend DisputeService via GET /api/disputes/metrics.
 */
export const useDisputeMetrics = ({
  dateRange,
  refreshInterval = 60000,
}: UseDisputeMetricsOptions): UseDisputeMetricsReturn => {
  const [metrics, setMetrics] = useState<DisputeMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      setMetrics(await fetchDisputeMetrics(dateRange, controller.signal));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError("Dispute metrics are unavailable right now.");
      console.error("Dispute metrics fetch error:", err);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
    return () => controllerRef.current?.abort();
  }, [fetchData]);

  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return { metrics, isLoading, error, refetch: fetchData };
};
