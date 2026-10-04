/**
 * Platform-wide WarpBot tool usage, as `GET /api/v1/assistant/admin/insights/tools?from&to` serves
 * it (wave 4 contract, 2d). Platform staff with `plugins.read`.
 *
 * One row per recorded tool call is aggregated on the server from `assistant.assistant_tool_calls`:
 * built-in tools, OpenAI hosted web search and plugin (MCP) tools alike. Only counts and outcomes
 * cross the wire — never arguments, answers or who asked.
 *
 * The shape is the workspace insights response (2c) plus `byWorkspace`, `byTool[].workspaces` and
 * `previousSuccessRate`. Field names are exactly the contract's.
 */

export type ToolCallSource = "builtin" | "plugin" | "web_search";

export interface ToolInsightsTotalsDto {
  calls: number;
  ok: number;
  error: number;
  blocked: number;
  needsSetup: number;
  declined: number;
  confirmationRequired: number;
  /** Whole milliseconds; null when no call in the window was timed. */
  medianDurationMs: number | null;
}

export interface ToolInsightsBySourceDto {
  source: ToolCallSource | string;
  calls: number;
}

/** One UTC day of the window; every day is present, zero days included. */
export interface ToolInsightsDayDto {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  builtin: number;
  plugin: number;
  webSearch: number;
  ok: number;
  /** `error + blocked + needsSetup`. */
  failed: number;
}

export interface AdminToolInsightsToolDto {
  tool: string;
  source: ToolCallSource | string;
  pluginKey: string | null;
  calls: number;
  ok: number;
  error: number;
  blocked: number;
  needsSetup: number;
  medianDurationMs: number | null;
  lastCalledAt: string | null;
  /** Distinct workspaces that called this tool in the window. */
  workspaces: number;
}

export interface AdminToolInsightsWorkspaceDto {
  workspaceId: string;
  calls: number;
  failed: number;
}

export interface AdminToolInsightsDto {
  /** The window actually used (after clamping). */
  from: string;
  to: string;
  /** The earliest recorded call in the whole table, or null when nothing has been recorded yet. */
  recordingSince: string | null;
  totals: ToolInsightsTotalsDto;
  /** Always three rows: builtin, plugin, web_search. */
  bySource: ToolInsightsBySourceDto[];
  byDay: ToolInsightsDayDto[];
  byTool: AdminToolInsightsToolDto[];
  /** Calls in the window of the same length immediately before. */
  previousPeriodCalls: number;
  /** Top 20 by calls. */
  byWorkspace: AdminToolInsightsWorkspaceDto[];
  /** `ok / calls` of the previous window, a 0-1 fraction; null when it had no calls. */
  previousSuccessRate: number | null;
}

export interface AdminToolInsightsQuery {
  /** ISO-8601 UTC. */
  from: string;
  /** ISO-8601 UTC, exclusive. Must be after `from` (400 otherwise); a window over 180 days is clamped. */
  to: string;
}
