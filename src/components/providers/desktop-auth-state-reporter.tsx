"use client";

/**
 * W4a: tells the desktop shell whether the main window is signed in (`reportSignedIn`, IPC
 * `auth:signed-in-state`, desktop PR #43) — once the persisted session has been read, and again on
 * every change after that: sign-in, sign-out, a sign-out replayed from another window, a session
 * the refresh path gave up on.
 *
 * Mounted in the root providers rather than the (app) shell: a window that starts signed out sits
 * on /login, which the (app) shell never renders, and the desktop needs that "false" as much as the
 * "true". Not from the popup over Meet (`/desktop-transcript`): it shares this window's storage and
 * so its answer, and the desktop asks the main window.
 *
 * No-op in a browser and on a desktop build without the method (`reportDesktopSignedIn`).
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { reportDesktopSignedIn } from "@/lib/desktop/bridge";
import { shouldReportDesktopSignedIn } from "@/lib/desktop/signed-in-report";
import { useAuthStore } from "@/stores/auth-store";

export function DesktopAuthStateReporter() {
  const pathname = usePathname();
  const enabled = shouldReportDesktopSignedIn(pathname);

  useEffect(() => {
    if (!enabled) return;
    let last: boolean | null = null;
    const report = (signedIn: boolean) => {
      if (signedIn === last) return;
      last = signedIn;
      reportDesktopSignedIn(signedIn);
    };

    const reportCurrent = () => report(useAuthStore.getState().isAuthenticated);
    // Before hydration the store holds its defaults (signed out), which would be a false "false"
    // for every signed-in launch. `persist` may already be done by the time this runs.
    const persistApi = useAuthStore.persist;
    let stopHydration: (() => void) | undefined;
    if (!persistApi || persistApi.hasHydrated()) reportCurrent();
    else stopHydration = persistApi.onFinishHydration(reportCurrent);

    const stopChanges = useAuthStore.subscribe((state, previous) => {
      if (state.isAuthenticated === previous.isAuthenticated) return;
      if (persistApi && !persistApi.hasHydrated()) return;
      report(state.isAuthenticated);
    });

    return () => {
      stopHydration?.();
      stopChanges();
    };
  }, [enabled]);

  return null;
}
