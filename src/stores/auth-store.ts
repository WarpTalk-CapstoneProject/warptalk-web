import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "@/types/auth";
import { clearSessionCookies, isLiveAccessToken } from "@/lib/auth/session-cookie";
import { useWorkspaceStore } from "./workspace-store";
import { usePresenceStore } from "./presence-store";

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
      login: (user, accessToken, refreshToken) =>
        set((state) => {
          if (state.user?.id && state.user.id !== user.id) {
            useWorkspaceStore.getState().clearActiveWorkspace();
          }
          return { user, accessToken, refreshToken, isAuthenticated: true };
        }),
      logout: () => {
        clearSessionCookies();
        useWorkspaceStore.getState().clearActiveWorkspace();
        // Whose colleagues were online is not the next account holder's business.
        usePresenceStore.getState().clear();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
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
      },
    }
  )
);
