"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminSubscriptionService } from "@/services/admin-subscription.service";
import type {
  AdminSubscriptionDirectoryQuery,
  AdminSubscriptionLifecycleRequest,
} from "@/types/admin-subscription";

export const ADMIN_SUBSCRIPTION_KEYS = {
  all: ["admin-subscriptions"] as const,
  directory: (query: AdminSubscriptionDirectoryQuery) =>
    ["admin-subscriptions", "directory", query] as const,
  summary: ["admin-subscriptions", "summary"] as const,
};

/**
 * `placeholderData` keeps the previous page on screen while the next loads. Without it every page
 * turn blanks the table — which on this screen reads as "nobody is paying for anything".
 */
export function useAdminSubscriptionDirectory(query: AdminSubscriptionDirectoryQuery) {
  return useQuery({
    queryKey: ADMIN_SUBSCRIPTION_KEYS.directory(query),
    queryFn: () => adminSubscriptionService.getDirectory(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/** Revenue totals over every active subscription, independent of the directory's paging. */
export function useAdminSubscriptionSummary() {
  return useQuery({
    queryKey: ADMIN_SUBSCRIPTION_KEYS.summary,
    queryFn: () => adminSubscriptionService.getSummary(),
    staleTime: 60_000,
  });
}

/**
 * Both lifecycle actions invalidate the summary as well as the directory.
 *
 * Recurring revenue is computed over every active subscription, so a cancellation changes the
 * headline number on the same screen. Refreshing only the row would leave the total stating the
 * revenue of a subscription the reader just ended.
 */
function useInvalidateAdminSubscriptions() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ADMIN_SUBSCRIPTION_KEYS.all });
}

export function useCancelAdminSubscription() {
  const invalidate = useInvalidateAdminSubscriptions();
  return useMutation({
    mutationFn: ({
      workspaceId,
      request,
    }: {
      workspaceId: string;
      request: AdminSubscriptionLifecycleRequest;
    }) => adminSubscriptionService.cancel(workspaceId, request),
    onSuccess: invalidate,
  });
}

export function useResumeAdminSubscription() {
  const invalidate = useInvalidateAdminSubscriptions();
  return useMutation({
    mutationFn: ({
      workspaceId,
      request,
    }: {
      workspaceId: string;
      request: AdminSubscriptionLifecycleRequest;
    }) => adminSubscriptionService.resume(workspaceId, request),
    onSuccess: invalidate,
  });
}
