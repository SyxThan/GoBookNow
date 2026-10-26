"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(() => {
    const clear = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail?.sameIdentity) {
        // Session queries are already scoped by token. Removing an active one
        // here cancels the refresh that emitted this event before it can settle.
        queryClient.removeQueries({
          predicate: (query) =>
            query.queryKey[0] !== "portal-session" || !query.isActive(),
        });
        queryClient.getMutationCache().clear();
      }
    };
    window.addEventListener("gobook:session", clear);
    return () => window.removeEventListener("gobook:session", clear);
  }, [queryClient]);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
