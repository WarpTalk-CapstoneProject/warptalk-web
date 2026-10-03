/**
 * What WarpBot is told about the Insights → Tools tab the owner has open.
 *
 * The tab already holds the server's count of every WarpBot tool call in the period
 * (`GET /assistant/workspaces/{id}/insights/tools`), so those figures go to WarpBot as page
 * context, not behind a tool. It is built from the same shaping the tab's table and chips use
 * (`toolTableRows`, `sourceChips`, `outcomeSplit`), so the two cannot disagree.
 *
 * THE RULES IT KEEPS
 *   - A read that has not answered registers nothing (the caller passes null), so WarpBot says it
 *     does not know instead of reading a missing figure as 0 calls.
 *   - A previous-period figure only when the page would draw one (`comparablePreviousCalls`): a
 *     period that began before recording did is not a comparison.
 *   - Counts per tool, never a call's arguments or result: the server does not send them.
 *   - No comma inside a value (see snapshot-text.ts).
 */

import type { WorkspaceToolInsightsDto } from "../../../types/assistant-tool-insights.ts";
import {
  comparablePreviousCalls,
  previousWindowStart,
  recordingSinceNotice,
  toolSuccessRate,
  type ToolInsightsWindow,
} from "./tool-insights.ts";
import { formatDurationMs, outcomeSplit, sourceChips, toolTableRows, type ToolLabelSources, type ToolTableRow } from "./tools-metrics.ts";
import { dayOf, plain, rangeText, whole } from "./snapshot-text.ts";

export interface ToolsSnapshotInput {
  range: ToolInsightsWindow;
  insights: WorkspaceToolInsightsDto;
  labels: ToolLabelSources;
}

const MAX_TOOLS = 5;

const SOURCE_WORDS: Record<string, string> = {
  builtin: "WarpBot built-in tools",
  webSearch: "web search",
  plugin: "plugins",
  other: "other",
};

const OUTCOME_KEYS = {
  ok: "tool_calls_succeeded",
  error: "tool_calls_failed",
  blocked: "tool_calls_blocked_by_policy",
  needsSetup: "tool_calls_needing_setup",
  declined: "tool_calls_declined_by_member",
  confirmationRequired: "tool_calls_awaiting_confirmation",
} as const;

function toolName(row: ToolTableRow): string {
  const label = plain(row.label);
  return row.pluginLabel ? `${label} (${plain(row.pluginLabel)})` : label;
}

function problems(row: ToolTableRow): string {
  const parts = [
    row.error > 0 ? `${row.error} failed` : null,
    row.blocked > 0 ? `${row.blocked} blocked by policy` : null,
    row.needsSetup > 0 ? `${row.needsSetup} needing setup` : null,
  ].filter(Boolean);
  return parts.join(" and ");
}

export function toolsAssistantSnapshot(input: ToolsSnapshotInput): Record<string, string> {
  const { range, insights } = input;
  const totals = insights.totals;
  const out: Record<string, string> = { period: rangeText(range) };
  if (range.clamped) out.period_note = "the server answers for at most the last 180 days so earlier days are not included";

  const since = recordingSinceNotice(range.from, insights.recordingSince);
  const sinceDay = dayOf(since);
  if (sinceDay) out.recording_since = `${sinceDay}; earlier days were not recorded so they are not zero calls`;

  out.tool_calls = String(totals.calls);
  const previous = comparablePreviousCalls(insights, previousWindowStart(range));
  if (previous !== null) out.tool_calls_previous_period = String(previous);
  if (totals.calls === 0) return out;

  const rate = toolSuccessRate(totals);
  if (rate !== null) out.tool_success_rate = `${Math.round(rate)}%`;
  for (const { key, calls } of outcomeSplit(totals)) out[OUTCOME_KEYS[key]] = String(calls);
  const duration = formatDurationMs(totals.medianDurationMs);
  if (duration) out.median_tool_duration = duration;

  out.calls_by_source = sourceChips(insights.bySource, totals.calls)
    .filter((chip) => chip.key !== "all")
    .map((chip) => `${SOURCE_WORDS[chip.key]} ${chip.calls}`)
    .join("; ");

  const rows = toolTableRows(insights.byTool, input.labels);
  out.most_called_tools = rows
    .slice(0, MAX_TOOLS)
    .map((row) => `${toolName(row)} ${row.calls} calls`)
    .join("; ");

  const troubled = rows
    .filter((row) => row.error + row.blocked + row.needsSetup > 0)
    .sort((a, b) => b.error + b.blocked + b.needsSetup - (a.error + a.blocked + a.needsSetup) || b.calls - a.calls);
  out.tools_with_problems =
    troubled.length === 0
      ? "none"
      : troubled
          .slice(0, MAX_TOOLS)
          .map((row) => `${toolName(row)} ${problems(row)} of ${whole(row.calls)} calls`)
          .join("; ");

  return out;
}
