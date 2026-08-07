import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "@/types/auth";
import { clearSessionCookies, isLiveAccessToken } from "@/lib/auth/session-cookie";
import {
  resetSessionScopedStateOnLogin,
  resetSessionScopedStateOnLogout,
} from "@/lib/session-scoped-state";

interface AuthState {
  user: UserDto | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
 
  setUser: (user: UserDto) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  login: (user: UserDto, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<UserDto>) => void;
}
 
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
 
      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      login: (user, accessToken, refreshToken) => {
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
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },
      logout: () => {
        clearSessionCookies();
        // The identity goes first, and the order is load-bearing. Emptying the query cache
        // notifies every mounted observer, and an observer whose query has just been removed
        // refetches — so with the token still installed, the departing account's credentials
        // would be used to refill the cache we are in the middle of emptying.
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
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
      name: "warptalk-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // localStorage outlives the tokens in it. A persisted `isAuthenticated: true` around a
      // long-dead access token makes the app paint a signed-in shell before any request has
      // had the chance to disagree, which is what a stranded user actually sees.
      //
      // An expired access token on its own is not a dead session — the refresh token
      // outlives it by days and the client redeems it silently — so this only discards state
      // when there is nothing left to refresh with.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (isLiveAccessToken(state.accessToken) || state.refreshToken) return;
        if (!state.user && !state.accessToken && !state.isAuthenticated) return;

        clearSessionCookies();
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        resetSessionScopedStateOnLogout();
      },
    }
  )
);
