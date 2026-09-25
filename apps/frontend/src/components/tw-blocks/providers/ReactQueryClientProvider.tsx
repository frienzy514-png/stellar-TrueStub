"use client";

import { useContext } from "react";
import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * Query Client, you can configure the default options for the query client
 *
 * - Stale Time: 5 minutes
 * - GC Time: 30 minutes
 * - Retry: 1
 * - Refetch on Window Focus: false
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * React Query Client Provider
 *
 * Reuses an existing QueryClient from an ancestor (e.g. the app-wide
 * `QueryProvider` mounted in `ClientProviders`) so escrow blocks share one
 * query cache with the rest of the app. Only creates its own client when
 * rendered outside any QueryClientProvider (standalone tw-blocks usage).
 *
 * @param children - The children
 * @returns The React Query Client Provider
 */
export function ReactQueryClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const parentClient = useContext(QueryClientContext);

  if (parentClient) {
    return <>{children}</>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV !== "production" ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
