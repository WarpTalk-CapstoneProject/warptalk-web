"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authService } from "@/services/auth.service";

export const SESSION_KEYS = {
  mine: ["auth", "sessions"] as const,
};

/** The signed-in user's own sessions, current one first. */
export function useMySessions() {
  return useQuery({
    queryKey: SESSION_KEYS.mine,
    queryFn: async () => (await authService.getSessions()).data,
    staleTime: 15_000,
  });
}

/**
 * End one of my OTHER sessions.
 *
 * Never pointed at the current session: that ends through `useAuthStore().logout()`, which clears
 * the cookies and runs the guarded revoke. The server refuses the current one with 409 anyway.
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authService.revokeSession(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSION_KEYS.mine }),
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authService.revokeOtherSessions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSION_KEYS.mine }),
  });
}
