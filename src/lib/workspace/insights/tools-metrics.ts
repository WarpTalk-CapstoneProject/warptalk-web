/**
 * The workspace Insights "Tools" tab, as pure arithmetic over the WarpBot plugin audit log. WT-878.
 *
 * WHERE THE NUMBERS COME FROM
 *   There is no aggregate endpoint for plugin tool calls. The only source is the audit log the
 *   Plugin activity page reads (`GET /assistant/mcp/tools/audits`): a plain list, newest first, paged
 *   by skip/take, with no total and no date filter. So the tab reads pages until it has walked past
 *   the start of the period (or reached the end of the log) and counts what it read. Every figure
 *   here is a count of real rows — nothing is seeded, defaulted or extrapolated:
 *     - zero calls is a success rate of `null` ("—"), never a friendly default;
 *     - when the read stops at its page cap before reaching the period start, `capped` is set and
 *       the page says "at least N", because older calls in the period were not read.
 *
 * DAYS ARE CUT IN THE PAGE'S TIME ZONE
 *   The admin insights charts plot the server's own day keys and never re-bucket instants in the
 *   browser. This log has no server-side days, so the bucketing has to happen here — and it is done
 *   in the IANA zone the period was resolved in (`timeZone`), never in UTC and never in whatever
 *   zone the test runner happens to be in.
 *
 * No `@/` imports: this file runs under `node --test` with type stripping.
 */

export type ToolOutcomeTone = "success" | "blocked" | "attention" | "failed";

/** What a counted call needs: when, which plugin, and how it ended (a `PluginActivityRow` fits). */
export interface ToolCallLike {
  createdAt: string;
  pluginKey: string;
  pluginLabel?: string | null;
  outcome: { tone: ToolOutcomeTone; code?: string | null };
}

/** The three stacks of the outcomes chart. */
export type ToolOutcomeBucket = "succeeded" | "blocked" | "problem";

export type ToolsHealth = "idle" | "healthy" | "attention";

export interface ToolsPeriodInput {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
  timeZone: string;
  /**
   * Exclusive YYYY-MM-DD end of the day axis when the period runs past `to` (a month or custom
   * range still in progress); the days in between are drawn blank. Null for the to-now presets.
   */
  axisEndDay?: string | null;
  /** The read stopped at its page cap before reaching `from`. */
  capped?: boolean;
}

export interface ToolsPluginCount {
  key: string;
  label: string;
  calls: number;
  succeeded: number;
  blocked: number;
  problem: number;
}

export interface ToolsDay {
  /** YYYY-MM-DD in the period's time zone. */
  key: string;
  /** A day after the end of the period (still to come): every figure is null. */
  future: boolean;
  succeeded: number | null;
  blocked: number | null;
  problem: number | null;
  total: number | null;
  /** 0–100; null on a day with no calls, and on a day still to come. */
  successRate: number | null;
}

export interface ToolsMetrics<T extends ToolCallLike = ToolCallLike> {
  /** The calls inside [from, to), newest first. */
  rows: T[];
  calls: number;
  succeeded: number;
  blocked: number;
  needsSetup: number;
  awaitingConfirmation: number;
  failed: number;
  /** 0–100, unrounded; null when there were no calls. */
  successRate: number | null;
  /** ISO instant of the newest call in the period; null when there were none. */
  lastCallAt: string | null;
  capped: boolean;
  health: ToolsHealth;
  byPlugin: ToolsPluginCount[];
  days: ToolsDay[];
}

/** The awaiting-confirmation code; every other "attention" row is a setup problem. */
const CONFIRMATION_REQUIRED = "confirmation_required";

/** The server refuses longer insights ranges; the axis never needs more. */
const MAX_AXIS_DAYS = 366;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// ── classification ───────────────────────────────────────────────────────────

export function isNeedsSetup(outcome: ToolCallLike["outcome"]): boolean {
  return outcome.tone === "attention" && (outcome.code ?? "").toLowerCase() !== CONFIRMATION_REQUIRED;
}

export function isAwaitingConfirmation(outcome: ToolCallLike["outcome"]): boolean {
  return outcome.tone === "attention" && (outcome.code ?? "").toLowerCase() === CONFIRMATION_REQUIRED;
}

/**
 * Which stack a call lands in. A refusal by the workspace's own policy is its own stack — it is the
 * policy working, not the plugin breaking. Everything that did not run for another reason (failed,
 * needs setup, still awaiting a yes) is the third.
 */
export function outcomeBucket(outcome: ToolCallLike["outcome"]): ToolOutcomeBucket {
  if (outcome.tone === "success") return "succeeded";
  if (outcome.tone === "blocked") return "blocked";
  return "problem";
}

// ── time ─────────────────────────────────────────────────────────────────────

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** YYYY-MM-DD of an instant, on the calendar of `timeZone`. */
export function dayKeyInZone(instant: Date | number, timeZone: string): string {
  const parts = dayFormatter(timeZone).formatToParts(instant instanceof Date ? instant : new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** YYYY-MM-DD plus `days`, as calendar arithmetic on the key itself. */
export function addDaysToDayKey(key: string, days: number): string {
  const match = DAY_KEY.exec(key);
  if (!match) return key;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function instantOf(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/** The calls whose instant is inside [from, to), newest first. Unparseable rows are dropped. */
export function filterToPeriod<T extends { createdAt: string }>(rows: readonly T[], from: Date, to: Date): T[] {
  const start = from.getTime();
  const end = to.getTime();
  return rows
    .map((row) => ({ row, at: instantOf(row.createdAt) }))
    .filter(({ at }) => Number.isFinite(at) && at >= start && at < end)
    .sort((a, b) => b.at - a.at)
    .map(({ row }) => row);
}

export interface PeriodAxisDay {
  key: string;
  future: boolean;
}

/**
 * Every day of the period in its time zone: from the day `from` falls on to the day the last
 * instant before `to` falls on, then — when `axisEndDay` runs further — the days still to come.
 */
export function periodDayAxis(period: Pick<ToolsPeriodInput, "from" | "to" | "timeZone" | "axisEndDay">): PeriodAxisDay[] {
  const { from, to, timeZone } = period;
  if (!(to.getTime() > from.getTime())) return [];
  const first = dayKeyInZone(from, timeZone);
  const last = dayKeyInZone(to.getTime() - 1, timeZone);
  const axisEnd = period.axisEndDay && DAY_KEY.test(period.axisEndDay) ? period.axisEndDay : null;

  const days: PeriodAxisDay[] = [];
  for (let key = first; key <= last && days.length < MAX_AXIS_DAYS; key = addDaysToDayKey(key, 1)) {
    days.push({ key, future: false });
  }
  if (axisEnd) {
    for (
      let key = addDaysToDayKey(last, 1);
      key < axisEnd && days.length < MAX_AXIS_DAYS;
      key = addDaysToDayKey(key, 1)
    ) {
      days.push({ key, future: true });
    }
  }
  return days;
}

// ── the metrics ──────────────────────────────────────────────────────────────

const percent = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

export function toolsMetrics<T extends ToolCallLike>(allRows: readonly T[], period: ToolsPeriodInput): ToolsMetrics<T> {
  const rows = filterToPeriod(allRows, period.from, period.to);

  let succeeded = 0;
  let blocked = 0;
  let needsSetup = 0;
  let awaitingConfirmation = 0;
  let failed = 0;
  const plugins = new Map<string, ToolsPluginCount>();
  const perDay = new Map<string, { succeeded: number; blocked: number; problem: number }>();

  for (const row of rows) {
    const { outcome } = row;
    if (outcome.tone === "success") succeeded += 1;
    else if (outcome.tone === "blocked") blocked += 1;
    else if (outcome.tone === "failed") failed += 1;
    else if (isAwaitingConfirmation(outcome)) awaitingConfirmation += 1;
    else needsSetup += 1;

    const bucket = outcomeBucket(outcome);

    const plugin = plugins.get(row.pluginKey) ?? {
      key: row.pluginKey,
      label: row.pluginLabel || row.pluginKey,
      calls: 0,
      succeeded: 0,
      blocked: 0,
      problem: 0,
    };
    plugin.calls += 1;
    plugin[bucket] += 1;
    plugins.set(row.pluginKey, plugin);

    const key = dayKeyInZone(instantOf(row.createdAt), period.timeZone);
    const day = perDay.get(key) ?? { succeeded: 0, blocked: 0, problem: 0 };
    day[bucket] += 1;
    perDay.set(key, day);
  }

  const days: ToolsDay[] = periodDayAxis(period).map(({ key, future }) => {
    if (future) {
      return { key, future, succeeded: null, blocked: null, problem: null, total: null, successRate: null };
    }
    const day = perDay.get(key) ?? { succeeded: 0, blocked: 0, problem: 0 };
    const total = day.succeeded + day.blocked + day.problem;
    return { key, future, ...day, total, successRate: percent(day.succeeded, total) };
  });

  const calls = rows.length;
  return {
    rows,
    calls,
    succeeded,
    blocked,
    needsSetup,
    awaitingConfirmation,
    failed,
    successRate: percent(succeeded, calls),
    lastCallAt: rows[0]?.createdAt ?? null,
    capped: Boolean(period.capped),
    health: calls === 0 ? "idle" : needsSetup > 0 || failed > 0 ? "attention" : "healthy",
    byPlugin: [...plugins.values()].sort((a, b) => b.calls - a.calls || a.label.localeCompare(b.label)),
    days,
  };
}

/**
 * The plugins bar list: the largest `limit` plugins, then the rest summed into one "Other" row
 * (`key: null`) so the shares still add up to every call.
 */
export function topPlugins(
  byPlugin: readonly ToolsPluginCount[],
  limit: number,
): { key: string | null; label: string; calls: number }[] {
  const head = byPlugin.slice(0, Math.max(0, limit)).map((p) => ({ key: p.key as string | null, label: p.label, calls: p.calls }));
  const rest = byPlugin.slice(Math.max(0, limit)).reduce((sum, p) => sum + p.calls, 0);
  if (rest > 0) head.push({ key: null, label: "", calls: rest });
  return head;
}

// ── reading the log ──────────────────────────────────────────────────────────

export interface AuditWindowOptions {
  /** Inclusive start of the period: once a page reaches back past it, the read stops. */
  from: Date;
  pageSize: number;
  maxPages: number;
}

export interface AuditWindow<T> {
  /** Every row read, newest first as the server sent them (including rows outside the period). */
  rows: T[];
  pagesRead: number;
  /** Stopped at `maxPages` while the log still went on and had not yet reached `from`. */
  capped: boolean;
}

/**
 * Read the newest-first log page by page until a page is short (the end of the log), a page
 * reaches back before `from` (the rest is older than the period), or `maxPages` pages were read.
 * Only the last of the three leaves the period possibly incomplete, and only it sets `capped`.
 */
export async function collectAuditWindow<T extends { createdAt: string }>(
  fetchPage: (skip: number, take: number) => Promise<readonly T[]>,
  options: AuditWindowOptions,
): Promise<AuditWindow<T>> {
  const start = options.from.getTime();
  const pageSize = Math.max(1, Math.floor(options.pageSize));
  const maxPages = Math.max(1, Math.floor(options.maxPages));
  const rows: T[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await fetchPage(page * pageSize, pageSize);
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, pagesRead: page + 1, capped: false };
    const reachedStart = batch.some((row) => {
      const at = instantOf(row.createdAt);
      return Number.isFinite(at) && at < start;
    });
    if (reachedStart) return { rows, pagesRead: page + 1, capped: false };
  }
  return { rows, pagesRead: maxPages, capped: true };
}
