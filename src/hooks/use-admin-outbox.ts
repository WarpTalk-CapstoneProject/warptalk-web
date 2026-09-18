"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminOutboxService } from "@/services/admin-outbox.service";

export const ADMIN_OUTBOX_KEYS = {
  all: ["admin", "workspace-outbox"] as const,
  deadLetters: (limit: number) => ["admin", "workspace-outbox", "dead-letters", limit] as const,
};

/** `refetchInterval` is for a page that shows the count live (Insights); the Outbox list does not poll. */
export function useAdminOutboxDeadLetters(limit: number, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ADMIN_OUTBOX_KEYS.deadLetters(limit),
    queryFn: () => adminOutboxService.listDeadLetters(limit),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
    refetchInterval: options.refetchInterval,
  });
}

/**
 * Invalidates on settle, not only on success: a 404 means the row is no longer dead-lettered
 * (another admin replayed it first), and the list should stop offering it either way.
 */
export function useReplayOutboxEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => adminOutboxService.replay(eventId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADMIN_OUTBOX_KEYS.all }),
  });
}
