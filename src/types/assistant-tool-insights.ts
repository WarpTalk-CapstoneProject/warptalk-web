/**
 * Every WarpBot tool call of one workspace, counted by the assistant service (wave 4, 2026-10-01).
 *
 * `GET /assistant/workspaces/{workspaceId}/insights/tools?from=ISO&to=ISO` — Owner/Admin only,
 * the same check as the plugin audit log. Built from `assistant.assistant_tool_calls`, which the
 * service fills from every finalised WarpBot answer: built-in tools, web search and plugin tools
 * alike. Metadata only — no argument or result text is ever stored there, or sent here.
 *
 * Mirrors the backend contract field for field; do not add derived fields here (they live in
 * `lib/workspace/insights/tool-insights.ts`).
 */

/** Where a call ran. Anything else the server ever sends is shown as "Other". */
export type ToolCallSource = "builtin" | "plugin" | "web_search";

export interface ToolInsightsTotalsDto {
  calls: number;
  ok: number;
  error: number;
  blocked: number;
  needsSetup: number;
  declined: number;
  confirmationRequired: number;
  /** Null when no call in the window has a measured duration (web search has none). */
  medianDurationMs: number | null;
}

export interface ToolInsightsSourceDto {
  source: ToolCallSource | string;
  calls: number;
}

export interface ToolInsightsDayDto {
  /** YYYY-MM-DD, a UTC date. Every day of the window is present, zero days included. */
  date: string;
  builtin: number;
  plugin: number;
  webSearch: number;
  ok: number;
  /** error + blocked + needsSetup. */
  failed: number;
}

export interface ToolInsightsToolDto {
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
}

export interface WorkspaceToolInsightsDto {
  from: string;
  to: string;
  /** The earliest recorded call anywhere (the table is global), or null when nothing is recorded yet. */
  recordingSince: string | null;
  totals: ToolInsightsTotalsDto;
  bySource: ToolInsightsSourceDto[];
  byDay: ToolInsightsDayDto[];
  byTool: ToolInsightsToolDto[];
  /** Calls in the window of the same length immediately before. */
  previousPeriodCalls: number;
}
