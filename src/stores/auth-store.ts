import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "@/types/auth";
import { useWorkspaceStore } from "./workspace-store";
import { usePresenceStore } from "./presence-store";

interface AuthState {
  user: UserDto | null;
  accessToken: string | null;
  isAuthenticated: boolean;
 
  setUser: (user: UserDto) => void;
  setAccessToken: (accessToken: string) => void;
  login: (user: UserDto, accessToken: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<UserDto>) => void;
}
 
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
 
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      login: (user, accessToken) =>
        set((state) => {
          if (state.user?.id && state.user.id !== user.id) {
            useWorkspaceStore.getState().clearActiveWorkspace();
          }
          return { user, accessToken, isAuthenticated: true };
        }),
      logout: () => {
        useWorkspaceStore.getState().clearActiveWorkspace();
        // Whose colleagues were online is not the next account holder's business.
        usePresenceStore.getState().clear();
        set({
          user: null,
          accessToken: null,
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
      version: 2,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<AuthState> | undefined;
        return {
          user: persisted?.user ?? null,
          accessToken: null,
          isAuthenticated: Boolean(persisted?.isAuthenticated),
        } as AuthState;
      },
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
