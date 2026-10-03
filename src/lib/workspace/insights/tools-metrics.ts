/**
 * The workspace Insights "Tools" tab, as pure shaping of the server's tool-call figures.
 * WT-878, rebuilt on `GET /assistant/workspaces/{id}/insights/tools` in wave 4 (2026-10-01).
 *
 * WHAT THE TAB SHOWS
 *   Every WarpBot tool call of the period — built-in tools, web search and plugin tools — as calls
 *   per day stacked by source with the day's success rate, the split of outcomes, and one table of
 *   every tool that ran with a source chip in front of it. The server does the counting (see
 *   `tool-insights.ts`); this file only turns its lists into what the charts and table draw.
 *
 * DAYS ARE THE SERVER'S
 *   `byDay` holds every UTC day of the window, zero days included. They are plotted as they come;
 *   nothing is re-bucketed in the browser. A month or custom range still in progress adds the days
 *   still to come, drawn blank (null), never as 0.
 *
 * No `@/` imports: this file runs under `node --test` with type stripping.
 */

import type {
  ToolInsightsDayDto,
  ToolInsightsSourceDto,
  ToolInsightsToolDto,
  ToolInsightsTotalsDto,
} from "../../../types/assistant-tool-insights.ts";
import { WARPBOT_TOOL_COPY, humaniseToolName } from "../../assistant/warpbot-tools-catalog.ts";

export type ToolSourceKey = "builtin" | "webSearch" | "plugin" | "other";

/** Chip and stack order: WarpBot's own tools first, then the web, then plugins. */
export const TOOL_SOURCE_ORDER: readonly Exclude<ToolSourceKey, "other">[] = ["builtin", "webSearch", "plugin"];

/** The server's `source` value to the view's key. Anything unknown is "other", never dropped. */
export function toolSourceKey(source: string | null | undefined): ToolSourceKey {
  switch ((source ?? "").toLowerCase()) {
    case "builtin":
      return "builtin";
    case "web_search":
      return "webSearch";
    case "plugin":
      return "plugin";
    default:
      return "other";
  }
}

// ── days ─────────────────────────────────────────────────────────────────────

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD plus `days`, as calendar arithmetic on the key itself. */
export function addDaysToDayKey(key: string, days: number): string {
  const match = DAY_KEY.exec(key);
  if (!match) return key;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** The axis never needs more than a year (the period bar's own limit). */
const MAX_AXIS_DAYS = 366;

export interface ToolsDay {
  /** YYYY-MM-DD (UTC date, as the server cut it). */
  key: string;
  /** A day after the end of the period: every figure is null. */
  future: boolean;
  builtin: number | null;
  webSearch: number | null;
  plugin: number | null;
  total: number | null;
  ok: number | null;
  failed: number | null;
  /** 0–100; null on a day with no calls and on a day still to come. */
  successRate: number | null;
}

/**
 * The per-day series: the server's days in date order (a repeated date is counted once), then —
 * when `axisEndDay` (exclusive) runs past the last of them — the days still to come.
 */
export function toolDaySeries(byDay: readonly ToolInsightsDayDto[], axisEndDay?: string | null): ToolsDay[] {
  const seen = new Set<string>();
  const days: ToolsDay[] = [];
  for (const row of [...byDay].filter((d) => DAY_KEY.test(d.date)).sort((a, b) => a.date.localeCompare(b.date))) {
    if (seen.has(row.date) || days.length >= MAX_AXIS_DAYS) continue;
    seen.add(row.date);
    const total = row.builtin + row.webSearch + row.plugin;
    days.push({
      key: row.date,
      future: false,
      builtin: row.builtin,
      webSearch: row.webSearch,
      plugin: row.plugin,
      total,
      ok: row.ok,
      failed: row.failed,
      successRate: total > 0 ? (Math.min(row.ok, total) / total) * 100 : null,
    });
  }
  const end = axisEndDay && DAY_KEY.test(axisEndDay) ? axisEndDay : null;
  if (end && days.length > 0) {
    for (
      let key = addDaysToDayKey(days[days.length - 1].key, 1);
      key < end && days.length < MAX_AXIS_DAYS;
      key = addDaysToDayKey(key, 1)
    ) {
      days.push({ key, future: true, builtin: null, webSearch: null, plugin: null, total: null, ok: null, failed: null, successRate: null });
    }
  }
  return days;
}

// ── outcomes ─────────────────────────────────────────────────────────────────

export type ToolOutcomeKey = "ok" | "error" | "needsSetup" | "blocked" | "declined" | "confirmationRequired";

/** Bar order: what ran, what broke, what someone has to fix, then the rules and choices working. */
export const TOOL_OUTCOME_ORDER: readonly ToolOutcomeKey[] = [
  "ok",
  "error",
  "needsSetup",
  "blocked",
  "declined",
  "confirmationRequired",
];

/** Every outcome with at least one call, in bar order, with its share of all calls (0–100). */
export function outcomeSplit(totals: ToolInsightsTotalsDto): { key: ToolOutcomeKey; calls: number; share: number }[] {
  return TOOL_OUTCOME_ORDER.map((key) => ({ key, calls: totals[key] })).filter((row) => row.calls > 0).map((row) => ({
    ...row,
    share: totals.calls > 0 ? (row.calls / totals.calls) * 100 : 0,
  }));
}

export type ToolsHealth = "idle" | "healthy" | "attention";

/** The Overview tool line's rule (`toolLineStatus`), named for the tab. */
export function toolsHealth(totals: Pick<ToolInsightsTotalsDto, "calls" | "needsSetup" | "error">): ToolsHealth {
  if (totals.calls === 0) return "idle";
  return totals.needsSetup > 0 || totals.error > 0 ? "attention" : "healthy";
}

// ── source chips ─────────────────────────────────────────────────────────────

export type ToolSourceFilter = "all" | Exclude<ToolSourceKey, "other">;

export interface ToolSourceChip {
  key: ToolSourceFilter;
  calls: number;
}

/**
 * The chips above the table: "All", then one per source that made a call this period, in source
 * order, each with its count. A source with no calls has no chip (a chip that filters to an empty
 * table is a dead end). Counts come from `bySource`; "other" sources only count toward "All".
 */
export function sourceChips(bySource: readonly ToolInsightsSourceDto[], totalCalls: number): ToolSourceChip[] {
  const perSource = new Map<ToolSourceKey, number>();
  for (const row of bySource) {
    const key = toolSourceKey(row.source);
    perSource.set(key, (perSource.get(key) ?? 0) + Math.max(0, row.calls));
  }
  const chips: ToolSourceChip[] = [{ key: "all", calls: totalCalls }];
  for (const key of TOOL_SOURCE_ORDER) {
    const calls = perSource.get(key) ?? 0;
    if (calls > 0) chips.push({ key, calls });
  }
  return chips;
}

// ── the tool table ───────────────────────────────────────────────────────────

/** Who acts on a plugin tool's problems: needs setup is the member's, a policy block the Owner's. */
export type ToolFixer = "member" | "owner" | null;

export interface ToolTableRow {
  /** Unique per row: a tool name can repeat across plugins. */
  id: string;
  tool: string;
  source: ToolSourceKey;
  pluginKey: string | null;
  label: string;
  pluginLabel: string | null;
  calls: number;
  ok: number;
  error: number;
  blocked: number;
  needsSetup: number;
  /** Declined or awaiting confirmation: the calls not in the four columns. */
  other: number;
  successRate: number | null;
  medianDurationMs: number | null;
  lastCalledAt: string | null;
  /** Set on plugin tools only; drives the "who to fix" link to Plugin activity. */
  fixer: ToolFixer;
}

export interface ToolLabelSources {
  /** "Web search", translated. */
  webSearch: string;
  /** Plugin key → label, from the plugin catalog. */
  pluginLabel?: (pluginKey: string) => string | null | undefined;
  /** Plugin key + tool name → the catalog's tool label. */
  pluginToolLabel?: (pluginKey: string, tool: string) => string | null | undefined;
}

/** A tool's display name: the built-in copy, "Web search", the plugin catalog's label, or the name humanised. */
export function toolDisplayName(
  row: Pick<ToolInsightsToolDto, "tool" | "source" | "pluginKey">,
  labels: ToolLabelSources,
): string {
  const source = toolSourceKey(row.source);
  if (source === "webSearch") return labels.webSearch;
  if (source === "builtin" && Object.prototype.hasOwnProperty.call(WARPBOT_TOOL_COPY, row.tool)) {
    return WARPBOT_TOOL_COPY[row.tool].displayName;
  }
  if (source === "plugin" && row.pluginKey) {
    const label = labels.pluginToolLabel?.(row.pluginKey, row.tool);
    if (label) return label;
  }
  return humaniseToolName(row.tool);
}

/** Every tool that ran, most called first (then by name), labelled and with its success rate. */
export function toolTableRows(byTool: readonly ToolInsightsToolDto[], labels: ToolLabelSources): ToolTableRow[] {
  return byTool
    .filter((row) => row.calls > 0)
    .map((row) => {
      const source = toolSourceKey(row.source);
      const pluginKey = source === "plugin" ? row.pluginKey : null;
      const counted = row.ok + row.error + row.blocked + row.needsSetup;
      return {
        id: `${row.source}:${row.pluginKey ?? ""}:${row.tool}`,
        tool: row.tool,
        source,
        pluginKey,
        label: toolDisplayName(row, labels),
        pluginLabel: pluginKey ? labels.pluginLabel?.(pluginKey) || pluginKey : null,
        calls: row.calls,
        ok: row.ok,
        error: row.error,
        blocked: row.blocked,
        needsSetup: row.needsSetup,
        other: Math.max(0, row.calls - counted),
        successRate: (Math.min(row.ok, row.calls) / row.calls) * 100,
        medianDurationMs: row.medianDurationMs,
        lastCalledAt: row.lastCalledAt,
        fixer: source !== "plugin" ? null : row.needsSetup > 0 ? "member" : row.blocked > 0 ? "owner" : null,
      } satisfies ToolTableRow;
    })
    .sort((a, b) => b.calls - a.calls || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export function filterToolRows(rows: readonly ToolTableRow[], filter: ToolSourceFilter): ToolTableRow[] {
  return filter === "all" ? [...rows] : rows.filter((row) => row.source === filter);
}

/** "850 ms", "1.2 s", "12 s", "2.5 min" — a median duration in the table. */
export function formatDurationMs(ms: number | null | undefined, locale = "en"): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(ms)} ms`;
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: seconds < 10 ? 1 : 0 }).format(seconds)} s`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 60_000)} min`;
}
