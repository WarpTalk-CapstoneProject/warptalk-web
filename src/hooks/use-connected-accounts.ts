"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth-store";

const ME_KEY = ["auth", "me", "sign-in-methods"] as const;

/**
 * GET /auth/me, read fresh for its sign-in methods.
 *
 * Not the auth store's `user`: that copy was written at login and persisted, so it predates any
 * link or unlink done since — and it predates the fields entirely for a session that signed in
 * before the auth service started sending them.
 */
export function useSignInMethods() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const { data } = await authService.getProfile();
      return data;
    },
  });
}

/** After a link change, refresh the page's read and keep the persisted store in step with it. */
function useSyncAfterChange() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  return async (googleLinked: boolean) => {
    updateUser({ googleLinked });
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
  };
}

export function useLinkGoogle() {
  const sync = useSyncAfterChange();
  return useMutation({
    mutationFn: async (idToken: string) => {
      await authService.linkGoogle(idToken);
    },
    onSuccess: () => sync(true),
  });
}

export function useUnlinkGoogle() {
  const sync = useSyncAfterChange();
  return useMutation({
    mutationFn: async () => {
      await authService.unlinkGoogle();
    },
    onSuccess: () => sync(false),
  });
}
