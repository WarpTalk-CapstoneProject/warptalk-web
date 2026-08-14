"use client";

import { useEffect, useState } from "react";

import { getUsableAccessToken } from "@/lib/api/client";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Rebuild the client auth store from the browser-held session.
 *
 * The proxy can see auth cookies before React can see Zustand. If localStorage was cleared
 * while a live access/refresh cookie remains, the server correctly treats the browser as
 * signed in, but the client shell would only see `isAuthenticated: false` and bounce between
 * `/login` and `/workspace`. This hook gives the client one chance to redeem that session
 * before route guards decide it is a guest.
 */
export function useSessionBootstrap(enabled: boolean) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const [completedAttempts, setCompletedAttempts] = useState(0);
  const shouldBootstrap = enabled && !(isAuthenticated && user);

  useEffect(() => {
    if (!shouldBootstrap) return;

    let cancelled = false;

    void (async () => {
      try {
        const accessToken = await getUsableAccessToken();
        if (!accessToken) return;

        const { data: profile } = await authService.getProfile();
        if (cancelled) return;

        login(profile, accessToken);
      } catch {
        // The api client owns dead-session teardown and redirect decisions. This hook only
        // prevents a valid cookie-backed session from being mistaken for a guest.
      } finally {
        if (!cancelled) setCompletedAttempts((count) => count + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [login, shouldBootstrap]);

  return shouldBootstrap && completedAttempts === 0;
}
