/**
 * WarpBot tool calls over a period, from the assistant service's own count (wave 4, 2026-10-01).
 *
 * WHERE THE NUMBERS COME FROM NOW
 *   `GET /assistant/workspaces/{id}/insights/tools?from&to` counts every call WarpBot made —
 *   built-in tools, web search and plugin tools — on the server, by UTC day, by source and by tool.
 *   Until then the page read the plugin audit log page after page and counted the rows itself,
 *   which saw plugin calls only and had to say "at least N" once its read hit a cap. Nothing here
 *   pages or counts rows any more: these helpers only shape the server's figures for the view.
 *
 * RECORDING STARTED ON A DAY
 *   The server only began recording on `recordingSince` (the earliest row anywhere). A window that
 *   starts before it is not "no calls before then", it is "not recorded before then"; the page says
 *   so, and a previous period that starts before it is not a comparison to print.
 *
 * Shared by the Overview tool line and cards and the Tools tab. Pure, and free of `@/` imports so
 * `node --test` loads it.
 */

import type {
  ToolInsightsToolDto,
  ToolInsightsTotalsDto,
  WorkspaceToolInsightsDto,
} from "../../../types/assistant-tool-insights.ts";

/** The longest window the server answers for. */
export const TOOL_INSIGHTS_MAX_DAYS = 180;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ToolInsightsWindow {
  from: Date;
  to: Date;
  /** True when the period was longer than the server allows and `from` was moved up to fit. */
  clamped: boolean;
}

/**
 * The window to ask the server for. A period longer than 180 days (six months, a long custom
 * range) keeps its end and starts 180 days before it, and says it did — the page prints that
 * rather than letting the server refuse the whole read.
 */
export function toolInsightsWindow(from: Date, to: Date): ToolInsightsWindow {
  const max = TOOL_INSIGHTS_MAX_DAYS * MS_PER_DAY;
  if (to.getTime() - from.getTime() > max) {
    return { from: new Date(to.getTime() - max), to, clamped: true };
  }
  return { from, to, clamped: false };
}

/** Where the server's previous period starts: the same length, immediately before the window. */
export function previousWindowStart(window: Pick<ToolInsightsWindow, "from" | "to">): Date {
  return new Date(window.from.getTime() - (window.to.getTime() - window.from.getTime()));
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
const maybeMs = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/**
 * The response with every list present and every count a non-negative number, so the view never
 * has to guard. A field the server left out reads as zero or empty, never as a made-up figure.
 */
export function normaliseToolInsights(raw: Partial<WorkspaceToolInsightsDto> | null | undefined): WorkspaceToolInsightsDto {
  const totals: Partial<ToolInsightsTotalsDto> = raw?.totals ?? {};
  return {
    from: text(raw?.from) ?? "",
    to: text(raw?.to) ?? "",
    recordingSince: text(raw?.recordingSince),
    totals: {
      calls: count(totals.calls),
      ok: count(totals.ok),
      error: count(totals.error),
      blocked: count(totals.blocked),
      needsSetup: count(totals.needsSetup),
      declined: count(totals.declined),
      confirmationRequired: count(totals.confirmationRequired),
      medianDurationMs: maybeMs(totals.medianDurationMs),
    },
    bySource: (raw?.bySource ?? []).filter(Boolean).map((row) => ({ source: String(row.source ?? ""), calls: count(row.calls) })),
    byDay: (raw?.byDay ?? []).filter((row) => row && typeof row.date === "string").map((row) => ({
      date: row.date.slice(0, 10),
      builtin: count(row.builtin),
      plugin: count(row.plugin),
      webSearch: count(row.webSearch),
      ok: count(row.ok),
      failed: count(row.failed),
    })),
    byTool: (raw?.byTool ?? []).filter((row) => row && typeof row.tool === "string").map((row) => ({
      tool: row.tool,
      source: String(row.source ?? ""),
      pluginKey: text(row.pluginKey),
      calls: count(row.calls),
      ok: count(row.ok),
      error: count(row.error),
      blocked: count(row.blocked),
      needsSetup: count(row.needsSetup),
      medianDurationMs: maybeMs(row.medianDurationMs),
      lastCalledAt: text(row.lastCalledAt),
    })),
    previousPeriodCalls: count(raw?.previousPeriodCalls),
  };
}

/** Percent (0–100, unrounded) of the calls that ran and succeeded; null with no calls. */
export function toolSuccessRate(totals: Pick<ToolInsightsTotalsDto, "calls" | "ok">): number | null {
  return totals.calls > 0 ? (Math.min(totals.ok, totals.calls) / totals.calls) * 100 : null;
}

function instant(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * The day recording began, when the window starts before it: "Recording since {date}". Null when
 * the window is fully recorded, and null when nothing has been recorded at all (the page's empty
 * state already says there are no calls).
 */
export function recordingSinceNotice(windowFrom: Date, recordingSince: string | null | undefined): string | null {
  const since = instant(recordingSince);
  if (!Number.isFinite(since)) return null;
  return windowFrom.getTime() < since ? (recordingSince as string) : null;
}

/**
 * The previous period's calls, or null when that period starts before recording did (or nothing
 * was recorded): comparing with a period that was only partly recorded would print a rise that
 * is really the start of recording.
 */
export function comparablePreviousCalls(
  data: Pick<WorkspaceToolInsightsDto, "previousPeriodCalls" | "recordingSince">,
  previousFrom: Date,
): number | null {
  const since = instant(data.recordingSince);
  if (!Number.isFinite(since) || previousFrom.getTime() < since) return null;
  return data.previousPeriodCalls;
}

/** The newest call of the window across every tool. */
export function lastToolCallAt(byTool: readonly Pick<ToolInsightsToolDto, "lastCalledAt">[]): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const row of byTool) {
    const at = instant(row.lastCalledAt);
    if (at > bestMs) {
      bestMs = at;
      best = row.lastCalledAt;
    }
  }
  return best;
}

export type ToolLineStatus = "needsAttention" | "healthy" | "noCalls";

/**
 * The one word in front of the WarpBot tools line. Amber when anything needs setup or failed;
 * policy blocks and declined consents are the workspace's rules and its members' choices working,
 * so they do not colour it. The Tools tab's health uses the same rule.
 */
export function toolLineStatus(totals: Pick<ToolInsightsTotalsDto, "calls" | "needsSetup" | "error">): ToolLineStatus {
  if (totals.needsSetup > 0 || totals.error > 0) return "needsAttention";
  return totals.calls > 0 ? "healthy" : "noCalls";
}

/** Plugins with at least one needs-setup call in the window, most affected first. */
export function needsSetupPlugins(byTool: readonly ToolInsightsToolDto[]): string[] {
  const perPlugin = new Map<string, number>();
  for (const row of byTool) {
    if (row.source !== "plugin" || !row.pluginKey || row.needsSetup <= 0) continue;
    perPlugin.set(row.pluginKey, (perPlugin.get(row.pluginKey) ?? 0) + row.needsSetup);
  }
  return [...perPlugin.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key);
}

export type ToolOriginKind = "builtin" | "webSearch" | "plugin" | "other";

export interface ToolOriginCount {
  /** `builtin`, `web_search`, `plugin:{key}` or `other`. */
  key: string;
  kind: ToolOriginKind;
  /** Set for `plugin` only. */
  pluginKey: string | null;
  calls: number;
}

/**
 * Calls by where they ran, for the Overview bar list: WarpBot's built-in tools as one row, web
 * search as one row, and each plugin as its own row. Largest first.
 */
export function callsByOrigin(byTool: readonly ToolInsightsToolDto[]): ToolOriginCount[] {
  const rows = new Map<string, ToolOriginCount>();
  for (const tool of byTool) {
    if (tool.calls <= 0) continue;
    let entry: Omit<ToolOriginCount, "calls">;
    if (tool.source === "builtin") entry = { key: "builtin", kind: "builtin", pluginKey: null };
    else if (tool.source === "web_search") entry = { key: "web_search", kind: "webSearch", pluginKey: null };
    else if (tool.source === "plugin" && tool.pluginKey) {
      entry = { key: `plugin:${tool.pluginKey}`, kind: "plugin", pluginKey: tool.pluginKey };
    } else entry = { key: "other", kind: "other", pluginKey: null };
    const row = rows.get(entry.key) ?? { ...entry, calls: 0 };
    row.calls += tool.calls;
    rows.set(entry.key, row);
  }
  return [...rows.values()].sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));
}
