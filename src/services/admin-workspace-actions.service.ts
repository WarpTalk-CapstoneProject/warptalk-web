import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { MeetingsInsightsDto } from "@/types/admin-insights";
import type {
  AdminWorkspaceBillingActionResultDto,
  AdminWorkspaceBillingOverviewDto,
  AdminWorkspaceExportDto,
  AdminWorkspaceNoteDto,
  AdminWorkspaceNoticeResultDto,
  AdminWorkspaceSignOutResultDto,
  AdminWorkspaceTimelineEntryDto,
  EntitlementOverrideValue,
} from "@/types/admin-workspace-actions";
import type { AdminWorkspaceDetailDto } from "@/types/admin-workspace";

/**
 * The admin workspace page's reads and actions (ERP-style detail). Three services answer — billing,
 * workspace and auth — and every one of them is system-admin gated server-side; the /admin layout's
 * guard is a convenience, not the boundary. Every write carries a reason and is recorded in the
 * platform audit log before it takes effect.
 */
export const adminWorkspaceActionsService = {
  getBillingOverview: async (
    workspaceId: string,
    range: { from?: string; to?: string } = {},
  ): Promise<AdminWorkspaceBillingOverviewDto> => {
    const { data } = await apiClient.get<AdminWorkspaceBillingOverviewDto>(
      API.adminWorkspaceBilling.overview(workspaceId),
      { params: range },
    );
    return data;
  },

  /** Meetings held and hours for ONE workspace, from the platform insights maths. */
  getMeetingTotals: async (
    workspaceId: string,
    range: { from: string; to: string; tz: string },
  ): Promise<MeetingsInsightsDto> => {
    const { data } = await apiClient.get<MeetingsInsightsDto>(API.adminInsights.meetings, {
      params: { ...range, compare: "previous", workspaceId },
    });
    return data;
  },

  getTimeline: async (workspaceId: string, limit = 100): Promise<AdminWorkspaceTimelineEntryDto[]> => {
    const { data } = await apiClient.get<AdminWorkspaceTimelineEntryDto[]>(
      API.adminWorkspaces.timeline(workspaceId),
      { params: { limit } },
    );
    return data;
  },

  // ── billing ──────────────────────────────────────────────────────────────────────────

  adjustCredits: async (workspaceId: string, amount: number, reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceBillingActionResultDto>(
      API.adminWorkspaceBilling.adjustCredits(workspaceId),
      { amount, reason },
    );
    return data;
  },

  changePlan: async (workspaceId: string, planId: string, reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceBillingActionResultDto>(
      API.adminWorkspaceBilling.changePlan(workspaceId),
      { planId, reason },
    );
    return data;
  },

  extendTrial: async (workspaceId: string, days: number, reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceBillingActionResultDto>(
      API.adminWorkspaceBilling.extendTrial(workspaceId),
      { days, reason },
    );
    return data;
  },

  compPeriod: async (workspaceId: string, periods: number, reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceBillingActionResultDto>(
      API.adminWorkspaceBilling.comp(workspaceId),
      { periods, reason },
    );
    return data;
  },

  setEntitlementOverrides: async (
    workspaceId: string,
    overrides: Record<string, EntitlementOverrideValue>,
    reason: string,
  ) => {
    const { data } = await apiClient.put<AdminWorkspaceBillingActionResultDto>(
      API.adminWorkspaceBilling.entitlements(workspaceId),
      { overrides, reason },
    );
    return data;
  },

  // ── account ──────────────────────────────────────────────────────────────────────────

  transferOwnership: async (workspaceId: string, newOwnerUserId: string, reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceDetailDto>(
      API.adminWorkspaces.transferOwnership(workspaceId),
      { newOwnerUserId, reason },
    );
    return data;
  },

  signOut: async (workspaceId: string, userIds: string[], reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceSignOutResultDto>(
      API.adminUsers.workspaceSignOut(workspaceId),
      { userIds, reason },
    );
    return data;
  },

  sendNotice: async (workspaceId: string, title: string, message: string, reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceNoticeResultDto>(
      API.adminWorkspaces.notices(workspaceId),
      { title, message, reason },
    );
    return data;
  },

  addNote: async (workspaceId: string, body: string) => {
    const { data } = await apiClient.post<AdminWorkspaceNoteDto>(API.adminWorkspaces.notes(workspaceId), { body });
    return data;
  },

  // ── data ─────────────────────────────────────────────────────────────────────────────

  exportSummary: async (workspaceId: string, reason: string) => {
    const { data } = await apiClient.post<AdminWorkspaceExportDto>(
      API.adminWorkspaces.export(workspaceId),
      { reason },
    );
    return data;
  },
};
