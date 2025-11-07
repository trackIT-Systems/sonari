"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Configure QueryClient with sensible defaults to prevent unnecessary re-renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 30 seconds before considering it stale
      staleTime: 30_000,
      // Cache data for 5 minutes before garbage collection
      gcTime: 5 * 60 * 1000,
      // Don't refetch on window focus by default (can be overridden per query)
      refetchOnWindowFocus: false,
      // Refetch on reconnect
      refetchOnReconnect: true,
      // Refetch on mount only if data is stale
      refetchOnMount: true,
      // Retry failed requests
      retry: 1,
    },
  },
});

export function ClientProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
