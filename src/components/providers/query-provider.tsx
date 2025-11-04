"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes (increased for better caching)
            gcTime: 10 * 60 * 1000, // 10 minutes (garbage collection time)
            refetchOnWindowFocus: false,
            refetchOnReconnect: false, // Don't refetch on reconnect
            retry: (failureCount, error: unknown) => {
              // Don't retry on 4xx errors
              if ((error as { status?: number })?.status >= 400 && (error as { status?: number })?.status < 500) {
                return false;
              }
              return failureCount < 2; // Reduced from 3 to 2
            },
          },
          mutations: {
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}