"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/sonner";
import { useState, type ReactNode } from "react";
import { RealtimeNotificationProvider } from "@/components/providers/realtime-notification-provider";
import { isSessionEnded } from "@/lib/api/client";
import { getRetryDelayMs, shouldRetryRequest } from "@/lib/api/retry-policy";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "not-configured.apps.googleusercontent.com";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: true,
            // A dead session must not be re-asked. Neither must any other 4xx: retrying a 401,
            // 403 or 429 cannot change the answer, and doing it across every mounted query is
            // what turns one expired token into a gateway-throttling request storm.
            retry: (failureCount, error) => {
              if (isSessionEnded()) return false;
              return shouldRetryRequest(failureCount, error);
            },
            retryDelay: getRetryDelayMs,
          },
          // Mutations keep TanStack's default of no retries — replaying a non-idempotent POST
          // is a worse failure than surfacing the error.
        },
      })
  );

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem={true}
          disableTransitionOnChange
        >
          <RealtimeNotificationProvider>
            {children}
            <Toaster position="top-right" />
          </RealtimeNotificationProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}
