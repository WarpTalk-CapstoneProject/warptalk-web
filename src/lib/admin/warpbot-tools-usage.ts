/**
 * The arithmetic of the admin WarpBot tools page (`/admin/warpbot-tools`), kept pure so it is tested
 * on its own: the period window, success rates, tool health and the previous-period deltas.
 *
 * TWO RATES, ON PURPOSE
 *   - The page's success rate (the card and the daily line) is the server's: `ok / calls`. It is
 *     what `previousSuccessRate` is computed with, so the card's point delta compares like with
 *     like. A day's calls are `builtin + plugin + webSearch`. (`failed` on the wire is
 *     `error + blocked + needsSetup`; declined and awaiting confirmation are neither ok nor failed.)
 *   - Tool HEALTH grades the tool itself, so it counts only calls the tool ran: `ok / (ok + error)`.
 *     A call blocked by an owner's rule or waiting on a member's setup is the policy working, not
 *     the tool failing (design 6tiXws9F, "Trạng thái tool").
 *
 * HEALTH NEEDS A SAMPLE
 *   Healthy ≥ 95%, Degraded 85–95%, Failing < 85%, graded only for a tool with at least 100 calls in
 *   the window. Below that one bad afternoon reads as an outage, so it says "Not enough calls".
 *
 * Imports are type-only and relative: this file runs under plain `node --test`.
 */

import type { FeatureFlagValue, PlatformSettingDto } from "../../types/admin-platform-settings.ts";
import type {
  AdminToolInsightsToolDto,
  ToolInsightsDayDto,
  ToolInsightsTotalsDto,
} from "../../types/admin-warpbot-tools.ts";

// ── the window ───────────────────────────────────────────────────────────────

export const USAGE_PERIODS = ["today", "7d", "30d", "180d"] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];
export const DEFAULT_USAGE_PERIOD: UsagePeriod = "30d";

export const WARPBOT_TOOLS_TABS = ["catalog", "usage"] as const;
export type WarpbotToolsTab = (typeof WARPBOT_TOOLS_TABS)[number];
export const DEFAULT_WARPBOT_TOOLS_TAB: WarpbotToolsTab = "usage";

/** The server refuses a longer window (contract 2c/2d). */
export const MAX_USAGE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<UsagePeriod, "today">, number> = { "7d": 7, "30d": 30, "180d": MAX_USAGE_DAYS };

export function parseUsagePeriod(value: string | null | undefined): UsagePeriod {
  return (USAGE_PERIODS as readonly string[]).includes(value ?? "") ? (value as UsagePeriod) : DEFAULT_USAGE_PERIOD;
}

export function parseWarpbotToolsTab(value: string | null | undefined): WarpbotToolsTab {
  return (WARPBOT_TOOLS_TABS as readonly string[]).includes(value ?? "")
    ? (value as WarpbotToolsTab)
    : DEFAULT_WARPBOT_TOOLS_TAB;
}

export interface UsageWindow {
  /** ISO-8601 UTC, inclusive. */
  from: string;
  /** ISO-8601 UTC, exclusive. */
  to: string;
}

/**
 * The `[from, to)` the endpoint is asked for. The server buckets days by UTC, so "today" is the UTC
 * day so far, and the rolling windows end now. `to` is truncated to the minute so a re-render a
 * second later reuses the same query instead of refetching.
 */
export function resolveUsageWindow(period: UsagePeriod, now: Date): UsageWindow {
  const to = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  if (period === "today") {
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    // The server answers 400 to an empty window; at 00:00 UTC "today so far" is one minute.
    const end = to.getTime() > from.getTime() ? to : new Date(from.getTime() + 60_000);
    return { from: from.toISOString(), to: end.toISOString() };
  }
  const from = new Date(to.getTime() - PERIOD_DAYS[period] * DAY_MS);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Whether the window opens before anything was recorded, so its early days are blank, not quiet. */
export function windowPredatesRecording(windowFrom: string, recordingSince: string | null): boolean {
  if (!recordingSince) return true;
  const from = Date.parse(windowFrom);
  const since = Date.parse(recordingSince);
  return Number.isFinite(from) && Number.isFinite(since) && from < since;
}

// ── rates ────────────────────────────────────────────────────────────────────

/** `ok / (ok + failed)` as a fraction; null when nothing counted (never a 0% or a 100%). */
export function successRate(ok: number, failed: number): number | null {
  const okCount = Math.max(0, ok || 0);
  const denominator = okCount + Math.max(0, failed || 0);
  return denominator > 0 ? okCount / denominator : null;
}

/** `ok / calls`, the server's definition; null without calls. */
export function shareOfCalls(ok: number, calls: number): number | null {
  const total = Math.max(0, calls || 0);
  return total > 0 ? Math.min(1, Math.max(0, ok || 0) / total) : null;
}

/** The page's headline rate over the whole window, as the server computes `previousSuccessRate`. */
export function overallSuccessRate(totals: ToolInsightsTotalsDto): number | null {
  return shareOfCalls(totals.ok, totals.calls);
}

/** One rate per day (`ok / calls`), in percent for the chart; a day without calls is a gap. */
export function dailySuccessPercents(days: readonly ToolInsightsDayDto[]): (number | null)[] {
  return days.map((day) => {
    const rate = shareOfCalls(day.ok, day.builtin + day.plugin + day.webSearch);
    return rate === null ? null : rate * 100;
  });
}

/** The server's `previousSuccessRate` (a 0-1 fraction) kept in range; anything else is unknown. */
export function normaliseRate(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  return Math.min(1, value);
}

// ── tool health ──────────────────────────────────────────────────────────────

export const TOOL_HEALTH_MIN_CALLS = 100;
export const HEALTHY_RATE = 0.95;
export const FAILING_RATE = 0.85;

export type ToolHealth = "healthy" | "degraded" | "failing" | "notEnoughCalls";

type GradedRow = Pick<AdminToolInsightsToolDto, "calls" | "ok" | "error">;

/** The tool's own reliability: calls it ran that succeeded. Blocked and needs-setup are left out. */
export function toolSuccessRate(row: GradedRow): number | null {
  return successRate(row.ok, row.error);
}

export function toolHealth(row: GradedRow): ToolHealth {
  if ((row.calls || 0) < TOOL_HEALTH_MIN_CALLS) return "notEnoughCalls";
  const rate = toolSuccessRate(row);
  // Every call was stopped before it ran (a rule, a missing connection): nothing the tool did failed.
  if (rate === null) return "healthy";
  if (rate >= HEALTHY_RATE) return "healthy";
  if (rate >= FAILING_RATE) return "degraded";
  return "failing";
}

/** Degraded plus failing: the tools an operator should look at. */
export function unhealthyToolCount(rows: readonly GradedRow[]): number {
  return rows.filter((row) => {
    const health = toolHealth(row);
    return health === "degraded" || health === "failing";
  }).length;
}

const HEALTH_ORDER: Record<ToolHealth, number> = { failing: 0, degraded: 1, healthy: 2, notEnoughCalls: 3 };

/** Worst first, then busiest first — the order the health table reads in. */
export function sortByHealth<T extends GradedRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const byHealth = HEALTH_ORDER[toolHealth(a)] - HEALTH_ORDER[toolHealth(b)];
    if (byHealth !== 0) return byHealth;
    const byRate = (toolSuccessRate(a) ?? 1) - (toolSuccessRate(b) ?? 1);
    if (byRate !== 0) return byRate;
    return b.calls - a.calls;
  });
}

/** Tools with enough calls to grade, by failure rate, worst first; tools that never failed are left out. */
export function failingMost<T extends GradedRow>(rows: readonly T[], limit = 5): { row: T; failureRate: number }[] {
  return rows
    .filter((row) => row.calls >= TOOL_HEALTH_MIN_CALLS)
    .map((row) => ({ row, failureRate: 1 - (toolSuccessRate(row) ?? 1) }))
    .filter((entry) => entry.failureRate > 0)
    .sort((a, b) => b.failureRate - a.failureRate || b.row.calls - a.row.calls)
    .slice(0, limit);
}

// ── deltas against the previous period ──────────────────────────────────────

export type CountDelta =
  | { kind: "none" }
  /** Nothing before, something now: a percentage of zero is not a number worth printing. */
  | { kind: "new" }
  | { kind: "change"; percent: number };

/** The change in a count against the window of the same length immediately before. */
export function countDelta(current: number, previous: number): CountDelta {
  const now = Math.max(0, current || 0);
  const before = Math.max(0, previous || 0);
  if (before === 0) return now === 0 ? { kind: "none" } : { kind: "new" };
  return { kind: "change", percent: Math.round(((now - before) / before) * 1000) / 10 };
}

/** The change in a rate, in percentage points (0.964 vs 0.972 → -0.8); null when either is unknown. */
export function rateDeltaPoints(current: number | null, previous: number | null | undefined): number | null {
  const before = normaliseRate(previous);
  if (current === null || before === null) return null;
  return Math.round((current - before) * 1000) / 10;
}

// ── the web search flag ──────────────────────────────────────────────────────

export const WEB_SEARCH_FLAG_KEY = "flags.warpbot_web_search";

export interface WebSearchFlagView {
  state: "on" | "off" | "unknown";
  /** Workspaces the flag value itself turns off (`denyWorkspaces`). */
  deniedWorkspaces: number;
  /** Values stored at a plan or workspace scope, which win over the platform value there. */
  scopedOverrides: number;
  /** Below 100 only when a partial rollout is configured. */
  rolloutPercent: number | null;
}

function asFlag(value: unknown): FeatureFlagValue | null {
  if (typeof value === "boolean") return { enabled: value };
  if (value && typeof value === "object" && typeof (value as FeatureFlagValue).enabled === "boolean") {
    return value as FeatureFlagValue;
  }
  return null;
}

/** What the platform flag says, from the settings console row (absent → unknown, never "off"). */
export function webSearchFlagView(setting: PlatformSettingDto | null | undefined): WebSearchFlagView {
  if (!setting) return { state: "unknown", deniedWorkspaces: 0, scopedOverrides: 0, rolloutPercent: null };
  const flag = asFlag(setting.value ?? setting.defaultValue);
  const rollout = flag?.rolloutPercent;
  return {
    state: flag ? (flag.enabled ? "on" : "off") : "unknown",
    deniedWorkspaces: flag?.denyWorkspaces?.length ?? 0,
    scopedOverrides: setting.overrides?.length ?? 0,
    rolloutPercent: typeof rollout === "number" && rollout < 100 ? rollout : null,
  };
}
