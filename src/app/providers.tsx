"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState, type ReactNode } from "react";
import { RealtimeNotificationProvider } from "@/components/providers/realtime-notification-provider";
import { isSessionEnded } from "@/lib/api/client";
import { getRetryDelayMs, shouldRetryRequest } from "@/lib/api/retry-policy";
import { registerSessionQueryClient } from "@/lib/auth/session-scoped-state";

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

  // This client is owned by React and lives as long as the tab, but signing out happens in
  // the auth store, which is not a component and cannot reach it. Handing it over here is
  // what lets a sign-out actually empty the previous account's cached rooms and workspaces
  // instead of leaving them to be served to whoever signs in next.
  //
  // In an effect rather than at construction because `<Providers>` also renders on the
  // server, and a query client escaping into module scope there would be shared across
  // concurrent requests.
  useEffect(() => registerSessionQueryClient(queryClient), [queryClient]);

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
