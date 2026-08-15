import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "@/types/auth";
import {
  clearSessionCookies,
  hasRedeemableSession,
  isLiveAccessToken,
  recordSessionTeardown,
} from "@/lib/auth/session-cookie";
import {
  resetSessionScopedStateOnLogin,
  resetSessionScopedStateOnLogout,
} from "@/lib/auth/session-scoped-state";
import {
  resetRevokeDedupe,
  revokeWithRetry,
  shouldSendRevoke,
} from "@/lib/auth/revoke-session";

const AUTH_STORAGE_KEY = "warptalk-auth";

/**
 * Tell the server the session is over.
 *
 * Nothing in the app did this. `authService.logout()` had exactly one caller,
 * `useLogout()` in hooks/use-auth.ts, and that hook had no callers at all —
 * every sign-out in the product went through this store's client-only
 * `logout()`, so `POST /auth/logout` was never sent. A refresh token lives
 * seven days: signing out cleared the browser and left the credential fully
 * redeemable by anyone who had a copy of it.
 *
 * The token itself is no longer passed, because this side can no longer read
 * it: it lives in the HttpOnly `warptalk_refresh` cookie. The request carries
 * the cookie instead, and the server falls back to it when the body is empty.
 * The import is dynamic to keep the axios client out of this module's import
 * cycle (lib/api/client.ts imports this store).
 *
 * Still asynchronous to the caller — a sign-out must never wait on the network — but no
 * longer silent. The outcome lands in the teardown breadcrumb, so "the server still thinks
 * this session is alive" is a readable fact afterwards rather than something that has to be
 * reconstructed from gateway logs.
 */
function revokeSessionOnServer(accessToken: string | null) {
  if (typeof window === "undefined") return;

  // The same session asking to be revoked twice is not two sign-outs. WT-405 round 2: a caller
  // re-entering logout() 200ms apart produced 117 POSTs in one minute in production, all
  // refused. See shouldSendRevoke — this bounds that at one request without hiding it.
  if (!shouldSendRevoke(accessToken)) return;

  void (async () => {
    const { authService } = await import("@/services/auth.service");
    const outcome = await revokeWithRetry(() => authService.logout(accessToken));

    if (!outcome.revoked) {
      recordSessionTeardown(`sign-out-revoke-failed(${outcome.lastFailure})`);
    }
  })().catch(() => {
    // The dynamic import itself failing — a chunk that will not load — must not become an
    // unhandled rejection on a page that is already leaving.
  });
}

interface AuthState {
  user: UserDto | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  setUser: (user: UserDto) => void;
  setTokens: (accessToken: string) => void;
  login: (user: UserDto, accessToken: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<UserDto>) => void;
}
 
/**
 * Set while a sibling tab's sign-out is being replayed into this one. The other
 * tab already revoked the refresh token; re-posting the same spent credential
 * from every open tab would achieve nothing but noise.
 */
let replayingRemoteSignOut = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setUser: (user) => set({ user }),
      setTokens: (accessToken) => set({ accessToken }),
      login: (user, accessToken) => {
        // Before the new identity is installed, not after. Anything still cached at this
        // point was fetched as somebody else, and this is the last instant at which nothing
        // is subscribed to it yet.
        //
        // This used to clear only the active workspace, and only when the persisted previous
        // user id happened to differ. Both conditions were too weak: the query cache was
        // never touched at all, and the paths that end a session without a clean logout —
        // an unredeemable refresh token, a sign-out in another tab, a hard refresh — are
        // exactly the paths that leave no previous user id to compare against.
        resetSessionScopedStateOnLogin();
        // A new session must be able to sign itself out, even seconds after the last one did.
        resetRevokeDedupe();
        set({ user, accessToken, isAuthenticated: true });
      },
      logout: () => {
        // Before anything is cleared, while the cookies are still in the jar: tell the server
        // the session is spent. Fire-and-forget — the teardown below runs whether or not this
        // succeeds, because a sign-out that can fail is not a sign-out.
        if (!replayingRemoteSignOut) {
          revokeSessionOnServer(get().accessToken);
        }

        recordSessionTeardown(
          replayingRemoteSignOut ? "remote-sign-out" : "user-sign-out",
        );
        clearSessionCookies();
        // The identity goes first, and the order is load-bearing. Emptying the query cache
        // notifies every mounted observer, and an observer whose query has just been removed
        // refetches — so with the token still installed, the departing account's credentials
        // would be used to refill the cache we are in the middle of emptying.
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        });
        // The auth state is only the smallest part of what identifies the departing account.
        // The query cache holds their rooms, workspaces, members and notifications, and seven
        // module-level stores outlive the sign-out with them. See session-scoped-state.ts.
        resetSessionScopedStateOnLogout();
      },
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // localStorage outlives the tokens in it. A persisted `isAuthenticated: true` around a
      // long-dead access token makes the app paint a signed-in shell before any request has
      // had the chance to disagree, which is what a stranded user actually sees.
      //
      // An expired access token on its own is not a dead session — the refresh token
      // outlives it by days and the client redeems it silently — so this only discards state
      // when there is nothing left to refresh with.
      //
      // "Nothing left" is the session marker, not a stored refresh token. The refresh token
      // moved into an HttpOnly cookie that this side cannot read, so the old
      // `state.refreshToken` test could only ever be false: closing the browser for half an
      // hour and coming back was enough to wipe a session the server was still perfectly
      // willing to renew, and clearSessionCookies() cannot even reach the HttpOnly cookie it
      // was throwing away. The marker is written beside it with the same lifetime for exactly
      // this question. Passing null keeps the access token out of it — here an expired access
      // token is the case being judged, so it cannot also be the evidence.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (isLiveAccessToken(state.accessToken) || hasRedeemableSession(null)) return;
        if (!state.user && !state.accessToken && !state.isAuthenticated) return;

        // No live access token AND no session marker.
        recordSessionTeardown("rehydrate-nothing-to-refresh-with");
        clearSessionCookies();
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        resetSessionScopedStateOnLogout();
      },
    }
  )
);

/**
 * Whether a persisted auth snapshot describes a session that is over.
 *
 * `null` means the key was removed outright — localStorage.clear(), or a
 * devtools wipe. That is a sign-out too.
 */
function isSignedOutSnapshot(rawValue: string | null) {
  if (rawValue === null) return true;

  try {
    const parsed = JSON.parse(rawValue) as {
      state?: { accessToken?: unknown };
    };
    return !parsed.state?.accessToken;
  } catch {
    // Unparseable persisted state is not evidence of a sign-out, and guessing
    // wrong here would sign a working tab out for no reason.
    return false;
  }
}

/**
 * Sign-out has to reach the other tabs.
 *
 * zustand's `persist` writes to localStorage but never reads it again after
 * hydration, so a sign-out in tab A left tab B holding both tokens in memory.
 * `chooseNewestAccessToken()` kept preferring the store's copy, and tab B went
 * on working — and went on refreshing, renewing a session the user believed
 * they had ended. On a shared machine the signed-out state was decoration.
 *
 * The `storage` event fires only in the *other* tabs, which is exactly the
 * audience. The teardown is the store's own logout() rather than a hand-rolled
 * copy, so the sibling tabs clear cookies, identity, query cache and the seven
 * session-scoped stores by the same path as the tab that started it — minus the
 * server revoke, which tab A has already done.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage) return;
    // A null key means the whole store was cleared.
    if (event.key !== null && event.key !== AUTH_STORAGE_KEY) return;
    if (!isSignedOutSnapshot(event.newValue)) return;

    const { accessToken, isAuthenticated } = useAuthStore.getState();
    if (!accessToken && !isAuthenticated) return;

    replayingRemoteSignOut = true;
    try {
      useAuthStore.getState().logout();
    } finally {
      replayingRemoteSignOut = false;
    }
  });
}
