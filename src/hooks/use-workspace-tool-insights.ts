"use client";

/**
 * The reads behind the workspace Insights "Tools" tab. WT-878.
 *
 * The plugin audit log (`GET /assistant/mcp/tools/audits`) is the only record of WarpBot's tool
 * calls. It takes skip/take, pluginKey and userId — no from/to, and it returns no total — so this
 * hook reads it newest first, 50 rows a page, until a page reaches back past the period start or
 * the log ends, and stops at `TOOL_AUDIT_MAX_PAGES` pages. When it stops at the cap the window is
 * `capped` and the tab labels its counts "at least N": older calls in the period were not read.
 * (The Plugin activity page used to count one 50-row page as "this month"; this is the fix.)
 *
 * Each read is its own `InsightsSourceState`, so a 403 or an error on the audit log shows "Not
 * available yet" on the audit panels while the member and plugin reads, which only label rows, are
 * unaffected — and vice versa.
 *
 * WHO CAN READ IT
 *   Owner and Admin (the assistant service asks the workspace service and fails closed). A Member's
 *   request is a guaranteed 403, so it is not sent: the source is simply unavailable.
 */

import { useQuery } from "@tanstack/react-query";

import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { useAssistantPlugins } from "@/hooks/use-assistant";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import type { ResolvedInsightsPeriod } from "@/lib/admin/insights-period";
import { collectAuditWindow, type AuditWindow } from "@/lib/workspace/insights/tools-metrics";
import { assistantService } from "@/services/assistant.service";
import type { AssistantPluginCatalogItemDto, WorkspacePluginToolAuditDto } from "@/types/assistant";
import type { WorkspaceMemberDto } from "@/types/workspace";

/** The page size the Plugin activity page uses; the server clamps anything larger. */
export const TOOL_AUDIT_PAGE_SIZE = 50;
/** 20 × 50 = the newest 1,000 calls. Past that the tab says "at least". */
export const TOOL_AUDIT_MAX_PAGES = 20;
/** Names are resolved from the first 100 members, as on the Plugin activity page. */
const MEMBER_PAGE_SIZE = 100;

type ApiErrorLike = { response?: { status?: number } };

export type ToolAuditWindow = AuditWindow<WorkspacePluginToolAuditDto>;

export interface WorkspaceToolInsights {
  audits: InsightsSourceState<ToolAuditWindow>;
  members: InsightsSourceState<WorkspaceMemberDto[]>;
  plugins: InsightsSourceState<AssistantPluginCatalogItemDto[]>;
  /** Re-read the audit log (the retry behind "Not available yet"). */
  refetchAudits: () => void;
}

function sourceOf<T>(
  query: { data: T | undefined; isError: boolean; isPending: boolean; isFetching: boolean; isPlaceholderData?: boolean },
  enabled: boolean,
): InsightsSourceState<T> {
  if (!enabled) return { status: "unavailable" };
  if (query.data !== undefined) {
    // An error behind data already on screen keeps the data; a placeholder is the previous period.
    return { status: "ready", data: query.data, refreshing: Boolean(query.isPlaceholderData) };
  }
  if (query.isError) return { status: "unavailable" };
  return { status: "loading" };
}

export function useWorkspaceToolInsights({
  workspaceId,
  period,
}: {
  workspaceId: string;
  period: Pick<ResolvedInsightsPeriod, "from" | "to">;
}): WorkspaceToolInsights {
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const canRead = roleLoaded && (role === "owner" || role === "admin") && !!workspaceId;

  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();

  const auditsQuery = useQuery({
    queryKey: ["assistant", "plugin-tool-audits", "insights", workspaceId, fromIso, toIso] as const,
    queryFn: () =>
      collectAuditWindow(
        async (skip, take) => {
          const { data } = await assistantService.listWorkspacePluginToolAudits({ workspaceId, skip, take });
          return data ?? [];
        },
        { from: new Date(fromIso), pageSize: TOOL_AUDIT_PAGE_SIZE, maxPages: TOOL_AUDIT_MAX_PAGES },
      ),
    enabled: canRead,
    placeholderData: (previous) => previous,
    staleTime: 15_000,
    // A 403 is an answer (a role changed in another tab), not a blip.
    retry: (failureCount, error) => (error as ApiErrorLike)?.response?.status !== 403 && failureCount < 1,
  });

  const membersQuery = useWorkspaceMembers(canRead ? workspaceId : undefined, 1, MEMBER_PAGE_SIZE);
  const pluginsQuery = useAssistantPlugins(canRead ? workspaceId : null);

  const auditsForbidden = (auditsQuery.error as ApiErrorLike | null)?.response?.status === 403;

  // Until the role is known nothing can be said either way; a Member cannot read any of it.
  if (!roleLoaded) {
    return {
      audits: { status: "loading" },
      members: { status: "loading" },
      plugins: { status: "loading" },
      refetchAudits: () => undefined,
    };
  }

  return {
    audits: auditsForbidden ? { status: "unavailable" } : sourceOf(auditsQuery, canRead),
    members: sourceOf(
      {
        data: membersQuery.data?.items,
        isError: membersQuery.isError,
        isPending: membersQuery.isPending,
        isFetching: membersQuery.isFetching,
      },
      canRead,
    ),
    plugins: sourceOf(pluginsQuery, canRead),
    refetchAudits: () => {
      void auditsQuery.refetch();
    },
  };
}
