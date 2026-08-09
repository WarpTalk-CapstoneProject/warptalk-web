import type { QueryClient } from "@tanstack/react-query";

import { useActiveMeetingStore } from "../../stores/active-meeting-store.ts";
import { useAssistantContextStore } from "../../stores/assistant-context-store.ts";
import { useNotificationStore } from "../../stores/notification-store.ts";
import { usePresenceStore } from "../../stores/presence-store.ts";
import { useTranslationRoomStore } from "../../stores/translationRoom-store.ts";
import { useWorkspaceStore } from "../../stores/workspace-store.ts";
import { useWorkspaceTabsStore } from "../../stores/workspace-tabs-store.ts";

/**
 * Everything the browser is still holding about the account that just left.
 *
 * `logout()` used to clear the auth state, the session cookies, the active workspace and the
 * presence map — and nothing else. It could not clear the rest, because the rest does not
 * live anywhere the auth store can see:
 *
 *   - The TanStack query cache is created inside `<Providers>` with `useState`, so it is
 *     owned by React and lives exactly as long as the tab. Signing out does not unmount it.
 *   - Six zustand stores are module singletons. A module singleton is created once per tab
 *     and outlives every navigation, every route change and every sign-out.
 *
 * The query cache is the one that leaks visibly. Query keys carry no identity — the room
 * list is `["translation-rooms", params]` and the workspace list is
 * `["workspaces", "list", {...}]` for every account alike — so the next account mounts the
 * same key, TanStack answers from cache synchronously, and the previous account's rows paint
 * on the first frame. With `staleTime` at 30-60s it is worse than a flash: inside that
 * window the query is not even considered stale, so no refetch is issued to correct it.
 *
 * The workspace list makes that more than cosmetic. `(app)/workspace/page.tsx` and
 * `(app)/layout.tsx` both auto-select `items[0]` and navigate to its slug, so a cached list
 * belonging to the previous account does not just render — it decides where the new account
 * is sent and what gets written into the `active_workspace_*` cookies.
 *
 * So the reset has to be driven from the auth store, and the auth store has to be handed the
 * query client. Hence the registry below.
 */

let activeQueryClient: QueryClient | null = null;

/**
 * Hand the tab's query client to the non-React code that has to be able to empty it.
 *
 * Deliberately a registration and not a module-level `new QueryClient()`: `<Providers>` is a
 * client component, which still executes on the server during SSR, and a module-level client
 * there would be shared between concurrent requests — a far worse version of this same bug.
 * Registration happens from an effect, so it only ever runs in the browser.
 *
 * Returns an unregister function for the provider's effect cleanup.
 */
export function registerSessionQueryClient(client: QueryClient): () => void {
  activeQueryClient = client;
  return () => {
    if (activeQueryClient === client) activeQueryClient = null;
  };
}

/** Test seam. Not used by application code. */
export function getSessionQueryClient(): QueryClient | null {
  return activeQueryClient;
}

/**
 * Browser storage written outside zustand's `persist`. Both are keyed by room, not by user,
 * so a join preview captured in the previous account's room would otherwise be replayed into
 * the next account's.
 */
export const SESSION_SCOPED_SESSION_STORAGE_PREFIX = "warptalk.";

/**
 * Every module-level store whose contents belong to one signed-in account.
 *
 * `ui-store` is deliberately absent: sidebar-open, which modal is open and which room id a
 * dialog is editing are properties of the window, not of the person. Clearing it would close
 * the sign-in-adjacent chrome for no security gain. Every other store here holds something
 * that identifies the previous account or their colleagues — room transcripts and chat,
 * notifications, presence, workspace identity, open workspace tabs, the meeting in progress
 * and the assistant's page context.
 */
function resetSessionScopedStores() {
  useWorkspaceStore.getState().clearActiveWorkspace();
  // Whose colleagues were online is not the next account holder's business.
  usePresenceStore.getState().clear();
  useNotificationStore.getState().clear();
  useWorkspaceTabsStore.getState().clearAllTabs();
  useTranslationRoomStore.getState().reset();
  useActiveMeetingStore.getState().closeMeeting();
  useAssistantContextStore.getState().clearAllContext();
}

function resetSessionScopedBrowserStorage() {
  try {
    // Read the binding rather than `window.sessionStorage`: absent on the server, absent in
    // the test runner unless something installs it, and present in the browser — one check
    // that is true wherever the storage really is.
    if (typeof sessionStorage === "undefined") return;
    const storage = sessionStorage;
    const doomed: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(SESSION_SCOPED_SESSION_STORAGE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage can be unavailable (private mode, blocked third-party context). Failing to
    // clear a device preview must never be what stops a sign-out from completing.
  }
}

/**
 * Drop every cached server response, without touching mutations.
 *
 * `cancelQueries()` first, and this is the ordering that matters: a request issued as the
 * previous account can still be in flight, and its `onSuccess` would write the response
 * straight back into a cache we just emptied. Cancelling before removing closes that window.
 */
function resetQueryCache(options: { alsoClearMutations: boolean }) {
  const client = activeQueryClient;
  if (!client) return;

  void client.cancelQueries();
  client.removeQueries();
  if (options.alsoClearMutations) client.getMutationCache().clear();
}

/**
 * Forget the account that was signed in. Called when one leaves.
 *
 * Mutations go too. Nothing is running that we need to survive — the caller is on its way to
 * /login — and a mutation cache entry still holds the variables and result of, say, the last
 * "invite this person to my workspace".
 */
export function resetSessionScopedStateOnLogout() {
  resetQueryCache({ alsoClearMutations: true });
  resetSessionScopedStores();
  resetSessionScopedBrowserStorage();
}

/**
 * Forget whatever was cached before this sign-in. Called when one arrives.
 *
 * Logout is not the only door. A session can end without anyone pressing anything — an
 * expired refresh token, a second tab that signed out, a hard refresh onto a warm cache — and
 * in each of those the next sign-in is the first moment anyone can act. Clearing here means
 * the guarantee does not depend on the previous account having left politely.
 *
 * Unconditional on purpose. "Only clear when the user id changed" needs a reliable record of
 * the previous id, which is exactly what those paths destroy; and at the instant of sign-in
 * there is by definition nothing cached *for the arriving account* that is worth keeping.
 *
 * Mutations are left alone here, and only here: this runs inside the login mutation's own
 * `onSuccess`, so emptying the mutation cache would be reaching into the callback's own
 * machinery mid-flight.
 */
export function resetSessionScopedStateOnLogin() {
  resetQueryCache({ alsoClearMutations: false });
  resetSessionScopedStores();
  resetSessionScopedBrowserStorage();
}
