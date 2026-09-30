"use client";

import { useQuery } from "@tanstack/react-query";

import { adminOutboxService } from "@/services/admin-outbox.service";

export const ADMIN_OUTBOX_KEYS = {
  all: ["admin", "workspace-outbox"] as const,
  deadLetters: (limit: number) => ["admin", "workspace-outbox", "dead-letters", limit] as const,
};

/** Insights counts these live; `refetchInterval` is how often. */
export function useAdminOutboxDeadLetters(limit: number, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ADMIN_OUTBOX_KEYS.deadLetters(limit),
    queryFn: () => adminOutboxService.listDeadLetters(limit),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
    refetchInterval: options.refetchInterval,
  });
}
