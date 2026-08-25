"use client";

import { useSyncExternalStore } from "react";

/** The preload bridge is injected before any script runs and never goes away. */
function subscribe() {
  return () => {};
}

function getSnapshot() {
  return Boolean((window as Window & { warptalk?: unknown }).warptalk);
}

/** No bridge exists during SSR, so the server always renders the web variant. */
function getServerSnapshot() {
  return false;
}

/**
 * Whether this page is being rendered inside the WarpTalk desktop shell.
 *
 * The Electron preload exposes `window.warptalk` via contextBridge (see
 * warptalk-desktop/src/preload/index.ts); a plain browser has nothing there. Used to hide
 * affordances that only make sense on the web — chiefly the "Download desktop" link, which
 * would otherwise offer the app to someone already running it.
 */
export function useIsDesktopRuntime(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
