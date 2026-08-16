import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminSubscriptionDirectoryQuery,
  AdminSubscriptionLifecycleRequest,
  AdminSubscriptionSummaryDto,
  AdminSubscriptionSummaryTotalsDto,
} from "@/types/admin-subscription";
import type { AdminPagedResult } from "@/types/admin-workspace";

/**
 * System-admin subscription directory. Platform-wide and gated server-side by the "admin" role —
 * the UI guard in the /admin layout is a convenience, not the boundary.
 *
 * The reads come from `/admin/subscriptions`. The two lifecycle actions deliberately do NOT: they
 * call the ordinary subscriptions controller, which is where `SubscriptionService` lives with its
 * Stripe cancellation, its entitlement republish and its owner notification. There is no
 * admin-only cancel because a second path through the same commercial act is the one that would
 * be missing a step — the interface note on `IAdminSubscriptionService` says exactly that, and
 * routing through the existing endpoint is how this obeys it rather than working around it.
 *
 * Changing which plan a workspace is on is still absent, and that is not an oversight either: a
 * paid plan change goes through checkout, because the payment is what moves `Subscription.PlanId`.
 */
export const adminSubscriptionService = {
  getDirectory: async (
    query: AdminSubscriptionDirectoryQuery,
  ): Promise<AdminPagedResult<AdminSubscriptionSummaryDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminSubscriptionSummaryDto>>(
      API.adminSubscriptions.base,
      { params: query },
    );
    return data;
  },

  /**
   * Its own call, not a field on the directory. Recurring revenue is computed over EVERY active
   * subscription; folding it into a page of twenty would invite reading it as the page's total.
   */
  getSummary: async (): Promise<AdminSubscriptionSummaryTotalsDto> => {
    const { data } = await apiClient.get<AdminSubscriptionSummaryTotalsDto>(
      API.adminSubscriptions.summary,
    );
    return data;
  },

  /**
   * Cancel the workspace's active subscription.
   *
   * Keyed by workspace, not by subscription id, because that is what the endpoint takes: it finds
   * the one active subscription itself. A trial is cancelled immediately; a paid subscription is
   * cancelled at period end, and the server decides which — not this call.
   *
   * The reason travels as a query parameter. It is the only shape the endpoint accepts.
   */
  cancel: async (
    workspaceId: string,
    request: AdminSubscriptionLifecycleRequest,
  ): Promise<void> => {
    await apiClient.delete(API.adminSubscriptions.cancel(workspaceId), {
      params: { reason: request.reason },
    });
  },

  /** Undo a cancellation that has not taken effect yet. */
  resume: async (
    workspaceId: string,
    request: AdminSubscriptionLifecycleRequest,
  ): Promise<void> => {
    await apiClient.post(API.adminSubscriptions.resume(workspaceId), request);
  },
};
