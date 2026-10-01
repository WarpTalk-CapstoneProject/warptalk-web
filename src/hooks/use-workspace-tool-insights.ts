"use client";

/**
 * WarpBot's tool calls for the workspace Insights page: one read of
 * `GET /assistant/workspaces/{id}/insights/tools?from&to` (wave 4, 2026-10-01).
 *
 * The server counts every call — built-in tools, web search, plugin tools — so nothing here pages
 * through the plugin audit log any more. The Overview and the Tools tab call this with the same
 * period and share one cached answer (the key sits under `INSIGHTS_QUERY_ROOT`, which is what the
 * "Updated" pulse reads).
 *
 * A period longer than the server's 180 days is asked for as its last 180 days (`range.clamped`,
 * which the Tools tab prints). Owner and Admin only, like the audit log; the route already turns a
 * member away, and a 403 that arrives anyway reads as "Not available yet", never as zero calls.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { INSIGHTS_QUERY_ROOT, insightsStateOf } from "@/hooks/use-workspace-insights";
import { getErrorStatus } from "@/lib/api/retry-policy";
import { normaliseToolInsights, toolInsightsWindow, type ToolInsightsWindow } from "@/lib/workspace/insights/tool-insights";
import { assistantService } from "@/services/assistant.service";
import type { WorkspaceToolInsightsDto } from "@/types/assistant-tool-insights";

export interface WorkspaceToolInsights {
  insights: InsightsSourceState<WorkspaceToolInsightsDto>;
  /** The window actually asked for (stable while the period is). */
  range: ToolInsightsWindow;
  refetch: () => void;
}

export function useWorkspaceToolInsights({
  workspaceId,
  period,
  enabled = true,
}: {
  workspaceId: string;
  period: { from: Date; to: Date };
  enabled?: boolean;
}): WorkspaceToolInsights {
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const range = useMemo(() => toolInsightsWindow(new Date(fromMs), new Date(toMs)), [fromMs, toMs]);
  const from = range.from.toISOString();
  const to = range.to.toISOString();

  const query = useQuery({
    queryKey: [INSIGHTS_QUERY_ROOT, workspaceId, "tool-insights", from, to] as const,
    queryFn: async () => normaliseToolInsights((await assistantService.getWorkspaceToolInsights(workspaceId, { from, to })).data),
    enabled: enabled && !!workspaceId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    // A 403 is an answer (a role changed in another tab), not a blip.
    retry: (failureCount, error) => getErrorStatus(error) !== 403 && failureCount < 1,
  });

  return {
    insights: insightsStateOf(query),
    range,
    refetch: () => {
      void query.refetch();
    },
  };
}
