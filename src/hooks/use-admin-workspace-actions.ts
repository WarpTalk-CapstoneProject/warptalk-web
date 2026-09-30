"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminWorkspaceActionsService } from "@/services/admin-workspace-actions.service";
import type { EntitlementOverrideValue } from "@/types/admin-workspace-actions";

export const ADMIN_WORKSPACE_ACTION_KEYS = {
  billingOverview: (id: string) => ["admin-workspaces", "billing-overview", id] as const,
  meetingTotals: (id: string, from: string, to: string) =>
    ["admin-workspaces", "meeting-totals", id, from, to] as const,
  timeline: (id: string) => ["admin-workspaces", "timeline", id] as const,
};

/** The money overview the page leads with. Default window: the server's, the last 30 days. */
export function useAdminWorkspaceBillingOverview(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ADMIN_WORKSPACE_ACTION_KEYS.billingOverview(workspaceId ?? ""),
    queryFn: () => adminWorkspaceActionsService.getBillingOverview(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

/** Meetings held and hours for this workspace over the same 30 days as the billing overview. */
export function useAdminWorkspaceMeetingTotals(workspaceId: string | undefined, window: { from: string; to: string }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
  return useQuery({
    queryKey: ADMIN_WORKSPACE_ACTION_KEYS.meetingTotals(workspaceId ?? "", window.from, window.to),
    queryFn: () => adminWorkspaceActionsService.getMeetingTotals(workspaceId!, { ...window, tz }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useAdminWorkspaceTimeline(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ADMIN_WORKSPACE_ACTION_KEYS.timeline(workspaceId ?? ""),
    queryFn: () => adminWorkspaceActionsService.getTimeline(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
  });
}

/**
 * After any action: the workspace's detail, roster, money, ledger and timeline are all refetched.
 * The timeline matters most — it is where the admin sees the audit entry their action just wrote.
 */
function useRefreshWorkspace() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-contract-billing"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: ["billing"] }),
    ]);
}

export function useAdminWorkspaceActions(workspaceId: string) {
  const refresh = useRefreshWorkspace();
  const service = adminWorkspaceActionsService;

  return {
    adjustCredits: useMutation({
      mutationFn: ({ amount, reason }: { amount: number; reason: string }) =>
        service.adjustCredits(workspaceId, amount, reason),
      onSuccess: refresh,
    }),
    changePlan: useMutation({
      mutationFn: ({ planId, reason }: { planId: string; reason: string }) =>
        service.changePlan(workspaceId, planId, reason),
      onSuccess: refresh,
    }),
    extendTrial: useMutation({
      mutationFn: ({ days, reason }: { days: number; reason: string }) =>
        service.extendTrial(workspaceId, days, reason),
      onSuccess: refresh,
    }),
    compPeriod: useMutation({
      mutationFn: ({ periods, reason }: { periods: number; reason: string }) =>
        service.compPeriod(workspaceId, periods, reason),
      onSuccess: refresh,
    }),
    setEntitlements: useMutation({
      mutationFn: ({ overrides, reason }: { overrides: Record<string, EntitlementOverrideValue>; reason: string }) =>
        service.setEntitlementOverrides(workspaceId, overrides, reason),
      onSuccess: refresh,
    }),
    transferOwnership: useMutation({
      mutationFn: ({ newOwnerUserId, reason }: { newOwnerUserId: string; reason: string }) =>
        service.transferOwnership(workspaceId, newOwnerUserId, reason),
      onSuccess: refresh,
    }),
    signOut: useMutation({
      mutationFn: ({ userIds, reason }: { userIds: string[]; reason: string }) =>
        service.signOut(workspaceId, userIds, reason),
      onSuccess: refresh,
    }),
    sendNotice: useMutation({
      mutationFn: ({ title, message, reason }: { title: string; message: string; reason: string }) =>
        service.sendNotice(workspaceId, title, message, reason),
      onSuccess: refresh,
    }),
    addNote: useMutation({
      mutationFn: (body: string) => service.addNote(workspaceId, body),
      onSuccess: refresh,
    }),
    exportSummary: useMutation({
      mutationFn: (reason: string) => service.exportSummary(workspaceId, reason),
      onSuccess: refresh,
    }),
  };
}
