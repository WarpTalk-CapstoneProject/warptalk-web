/**
 * The workspace Insights Overview's arithmetic, kept out of the components so it can be tested.
 * WT-878.
 *
 * NOTHING IS INVENTED
 *   The telemetry dashboard this page replaces fell back to 15,000 / 25,000 credits, "12 meetings",
 *   "8 members", a 96% success rate and a seeded fortnight of daily history whenever a source had
 *   not answered. Every function here returns `null` for "the sources cannot say", and the page
 *   draws that as "—" with "Not available yet". A zero is a claim about the workspace; a dash is a
 *   claim about the page.
 *
 * WHERE EACH FIGURE COMES FROM
 *   - Credits: the credit ledger (`getAllCreditHistory`) for the period and the one before it. Spend
 *     is a sign, not a type — the Usage page's rule (`isSpend` in lib/billing/usage-overview.ts) —
 *     so a negative adjustment counts, as it does in "Credits spent" there.
 *   - Credits by AI service: the same ledger rows, by the settlement's "Aggregated <charge_type>"
 *     (`serviceOfTransaction`). The breakdown endpoint only answers "the last N days from now" and
 *     cannot describe last month; the ledger describes any window and adds up to Credits used.
 *   - Meetings: ENDED rooms whose `startedAt` falls in the window. Hours from `durationSeconds`, else
 *     from `endedAt - startedAt`; a room with neither is counted as a meeting and left out of hours.
 *
 * DAYS ARE THE BROWSER'S
 *   The period bar is built on the browser's calendar (lib/admin/insights-period.ts) and these
 *   sources carry instants, not server day keys, so days are cut in local time here — the same
 *   calendar the period was drawn on.
 *
 * Free of `@/` imports so `node --test` loads it.
 */

import type {
  CreditBalanceDto,
  CreditTransactionDto,
  MonthlyUsagePoint,
  RecurringBillingStatusDto,
  SubscriptionDto,
} from "../../../types/billing.ts";
import { computeDelta, deltaCsv } from "../../admin/insights-metrics.ts";
import { dayKey, monthKey } from "../../admin/insights-period.ts";
import { isSpend, serviceOfTransaction, toCsv } from "../../billing/usage-overview.ts";
import { decideUsageWarning } from "../../billing/usage-warning.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TimeRange {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

function timeOf(iso: string | null | undefined): number {
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export function isInRange(iso: string | null | undefined, range: TimeRange): boolean {
  const at = timeOf(iso);
  return at >= range.from.getTime() && at < range.to.getTime();
}

/** a / b, or null when either side is unknown or there is nothing to divide by. */
export function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

// ── a figure with its previous period ────────────────────────────────────────

/**
 * One period card's numbers. `atLeast` marks a floor: a source read up to a cap. A floor has no
 * previous-period comparison — two floors compared are a claim about the cap, not the workspace.
 */
export interface PeriodFigure {
  value: number | null;
  previous: number | null;
  atLeast: boolean;
}

export function periodFigure(value: number | null, previous: number | null, atLeast = false): PeriodFigure {
  return { value, previous: atLeast ? null : previous, atLeast };
}

export const UNAVAILABLE_FIGURE: PeriodFigure = { value: null, previous: null, atLeast: false };

// ── the credit ledger ────────────────────────────────────────────────────────

export interface LedgerRead {
  items: readonly CreditTransactionDto[];
  /** False when paging stopped before the server's own total (`getAllCreditHistory` caps at 10,000). */
  complete: boolean;
}

/** Credits spent inside `range`. */
export function creditsUsedIn(items: readonly CreditTransactionDto[], range: TimeRange): number {
  let total = 0;
  for (const tx of items) {
    if (isSpend(tx) && isInRange(tx.createdAt, range)) total += -tx.amount;
  }
  return total;
}

/**
 * Credits used this period and last. An incomplete read is missing its OLDEST rows at the latest,
 * so the current window is a floor and the previous one is unknown.
 */
export function creditsFigure(read: LedgerRead, current: TimeRange, previous: TimeRange): PeriodFigure {
  return periodFigure(
    creditsUsedIn(read.items, current),
    read.complete ? creditsUsedIn(read.items, previous) : null,
    !read.complete,
  );
}

/** Credits spent per local day inside `range`, keyed YYYY-MM-DD. Days with no spend are absent. */
export function creditsByDay(items: readonly CreditTransactionDto[], range: TimeRange): Map<string, number> {
  const days = new Map<string, number>();
  for (const tx of items) {
    if (!isSpend(tx) || !isInRange(tx.createdAt, range)) continue;
    const key = dayKey(new Date(tx.createdAt));
    days.set(key, (days.get(key) ?? 0) + -tx.amount);
  }
  return days;
}

/**
 * The first local day a ledger read holds in full, or null when it holds everything. A capped read
 * lacks its oldest rows, so the day of the oldest row it has may be partial, and the days before it
 * are unknown — a per-day chart leaves them blank rather than drawing 0.
 */
export function ledgerFirstFullDay(read: LedgerRead): string | null {
  if (read.complete) return null;
  let oldest = Number.POSITIVE_INFINITY;
  for (const tx of read.items) {
    const at = timeOf(tx.createdAt);
    if (at < oldest) oldest = at;
  }
  // Incomplete with nothing read: no day is known.
  if (!Number.isFinite(oldest)) return "9999-12-31";
  const next = new Date(oldest);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return dayKey(next);
}

export interface ServiceCredits {
  key: string;
  /** English; the page translates known keys. */
  label: string;
  known: boolean;
  credits: number;
}

/** Credits spent inside `range` per AI service, largest first. */
export function creditsByService(items: readonly CreditTransactionDto[], range: TimeRange): ServiceCredits[] {
  const services = new Map<string, ServiceCredits>();
  for (const tx of items) {
    if (!isSpend(tx) || !isInRange(tx.createdAt, range)) continue;
    const service = serviceOfTransaction(tx);
    const entry = services.get(service.key) ?? { ...service, credits: 0 };
    entry.credits += -tx.amount;
    services.set(service.key, entry);
  }
  return [...services.values()]
    .filter((entry) => entry.credits > 0)
    .sort((a, b) => b.credits - a.credits || a.key.localeCompare(b.key));
}

/**
 * The five largest services, then everything else as one row — the admin page's rule, so the list
 * never grows past what a card can hold and still adds up to the total above it.
 */
export function topServices(rows: readonly ServiceCredits[], limit = 5): { top: ServiceCredits[]; rest: number } {
  return {
    top: rows.slice(0, limit),
    rest: rows.slice(limit).reduce((sum, row) => sum + row.credits, 0),
  };
}

// ── days ─────────────────────────────────────────────────────────────────────

/**
 * Every local day the window has started, as YYYY-MM-DD, oldest first. The day containing `to`'s
 * last instant is the last one; days still to come are added by `seriesAxis`, not here.
 */
export function elapsedDayKeys(range: TimeRange): string[] {
  const keys: string[] = [];
  const last = new Date(range.to.getTime() - 1);
  if (!(last.getTime() >= range.from.getTime())) return keys;
  const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const lastKey = dayKey(last);
  // Bounded: a malformed range must not spin.
  for (let guard = 0; guard < 400; guard += 1) {
    const key = dayKey(cursor);
    keys.push(key);
    if (key === lastKey) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

// ── meetings ─────────────────────────────────────────────────────────────────

export interface HeldRoomLike {
  id: string;
  status?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
}

export interface RoomsRead {
  rooms: readonly HeldRoomLike[];
  /** False when paging stopped at its cap before the server's total. */
  complete: boolean;
}

/** How long a room ran, in seconds, or null when the room does not say. */
export function roomDurationSeconds(room: HeldRoomLike): number | null {
  if (typeof room.durationSeconds === "number" && Number.isFinite(room.durationSeconds) && room.durationSeconds >= 0) {
    return room.durationSeconds;
  }
  const start = timeOf(room.startedAt);
  const end = timeOf(room.endedAt);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return (end - start) / 1000;
  return null;
}

/** A meeting that was held in the window: it ended, and it started inside the window. */
export function heldIn(room: HeldRoomLike, range: TimeRange): boolean {
  return (room.status ?? "").toLowerCase() === "ended" && isInRange(room.startedAt, range);
}

export interface MeetingsHeld {
  count: number;
  /** Null when not one of the meetings says how long it ran. */
  hours: number | null;
  /** Meetings counted in `count` but not in `hours`. */
  withoutDuration: number;
}

export function meetingsHeldIn(rooms: readonly HeldRoomLike[], range: TimeRange): MeetingsHeld {
  let count = 0;
  let seconds = 0;
  let timed = 0;
  for (const room of rooms) {
    if (!heldIn(room, range)) continue;
    count += 1;
    const duration = roomDurationSeconds(room);
    if (duration === null) continue;
    timed += 1;
    seconds += duration;
  }
  return {
    count,
    hours: count === 0 ? 0 : timed === 0 ? null : seconds / 3600,
    withoutDuration: count - timed,
  };
}

/** Meetings held and hours this period and last, as period figures. */
export function meetingFigures(
  read: RoomsRead,
  current: TimeRange,
  previous: TimeRange,
): { meetings: PeriodFigure; hours: PeriodFigure; withoutDuration: number } {
  const now = meetingsHeldIn(read.rooms, current);
  const before = meetingsHeldIn(read.rooms, previous);
  return {
    meetings: periodFigure(now.count, read.complete ? before.count : null, !read.complete),
    hours: periodFigure(now.hours, read.complete ? before.hours : null, !read.complete && now.hours !== null),
    withoutDuration: now.withoutDuration,
  };
}

export interface MeetingDay {
  meetings: number;
  /** Seconds of the meetings that said how long they ran. */
  seconds: number;
}

export function meetingsByDay(rooms: readonly HeldRoomLike[], range: TimeRange): Map<string, MeetingDay> {
  const days = new Map<string, MeetingDay>();
  for (const room of rooms) {
    if (!heldIn(room, range)) continue;
    const key = dayKey(new Date(room.startedAt as string));
    const entry = days.get(key) ?? { meetings: 0, seconds: 0 };
    entry.meetings += 1;
    entry.seconds += roomDurationSeconds(room) ?? 0;
    days.set(key, entry);
  }
  return days;
}

// ── up next ──────────────────────────────────────────────────────────────────

export interface UpcomingRoomLike {
  id: string;
  status: string;
  scheduledAt?: string | null;
}

/**
 * The dashboard's "coming up" rule: running or open first (it is happening whatever the booking
 * says), then waiting, then scheduled rooms whose slot has not passed, soonest first.
 */
export function upcomingRooms<T extends UpcomingRoomLike>(rooms: readonly T[], nowMs: number, limit = 5): T[] {
  const live = (status: string) => status === "in_progress" || status === "open";
  return rooms
    .filter(
      (room) =>
        live(room.status) ||
        room.status === "waiting" ||
        (room.status === "scheduled" && !!room.scheduledAt && timeOf(room.scheduledAt) >= nowMs),
    )
    .sort((a, b) => {
      const rank = (room: T) => (live(room.status) ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (timeOf(a.scheduledAt) || 0) - (timeOf(b.scheduledAt) || 0);
    })
    .slice(0, limit);
}

// ── six months ───────────────────────────────────────────────────────────────

/** The `count` months ending with the one `anchor` is in, as YYYY-MM, oldest first. */
export function lastMonthKeys(anchor: Date, count = 6): string[] {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(monthKey(new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1)));
  }
  return keys;
}

/** The calendar years those months fall in. */
export function yearsOfMonthKeys(keys: readonly string[]): number[] {
  return [...new Set(keys.map((key) => Number(key.slice(0, 4))))].filter(Number.isFinite).sort((a, b) => a - b);
}

export interface MonthCredits {
  key: string;
  /** Null when the chart endpoint did not describe that month. */
  credits: number | null;
}

/** Credits consumed per month from the yearly usage charts, one row per key. */
export function monthlyCredits(
  keys: readonly string[],
  charts: ReadonlyMap<number, readonly MonthlyUsagePoint[] | null>,
): MonthCredits[] {
  return keys.map((key) => {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const points = charts.get(year);
    const point = points?.find((row) => row.month === month);
    return { key, credits: point && Number.isFinite(point.consumedCredits) ? Math.max(0, point.consumedCredits) : null };
  });
}

// ── snapshot ─────────────────────────────────────────────────────────────────

export type CreditLevel = "ok" | "warning" | "critical";

export interface CreditsRemainingView {
  remaining: number;
  /** Everything this cycle has had available — remaining + used. */
  available: number;
  /** Whole percent left, floored; null without a ceiling. */
  percentLeft: number | null;
  level: CreditLevel;
}

/**
 * The balance card. The level follows the usage warning's rule (lib/billing/usage-warning.ts):
 * amber at 10% left or less, red at 1% or less — the same numbers the banner shouts at.
 */
export function creditsRemainingView(balance: CreditBalanceDto): CreditsRemainingView {
  const remaining = Math.max(0, balance.currentCredits);
  const available = Math.max(balance.totalCredits, remaining + Math.max(0, balance.creditsUsedThisCycle));
  const percentLeft = available > 0 ? Math.floor((remaining / available) * 100) : null;
  const warning = decideUsageWarning(balance);
  return {
    remaining,
    available,
    percentLeft,
    level: warning ? (warning.isCritical ? "critical" : "warning") : "ok",
  };
}

// ── needs attention ──────────────────────────────────────────────────────────

export type AttentionKind =
  | "noPlan"
  | "paymentFailed"
  | "lowCredits"
  | "planEnding"
  | "pluginsNeedSetup"
  | "policyBlocks"
  | "pendingRequests";

export type AttentionTone = "danger" | "warning" | "neutral";

/** Where a row sends the reader: resolved to a URL by the page, which knows the slug. */
export type AttentionTarget = "plans" | "billing" | "plugins" | "tools";

export interface AttentionItem {
  kind: AttentionKind;
  tone: AttentionTone;
  target: AttentionTarget;
  values: Record<string, string | number>;
}

export type AttentionSource = "billing" | "payments" | "toolAudit" | "plugins";

export interface AttentionInputs {
  /** `null` = no plan (404); `undefined` = the balance could not be read. */
  balance: CreditBalanceDto | null | undefined;
  subscription: SubscriptionDto | null | undefined;
  /** `null` = nothing to renew; `undefined` = not read. */
  recurring: RecurringBillingStatusDto | null | undefined;
  /** Undefined when the audit log could not be read. */
  tools?: { needsSetupPlugins: readonly string[]; blocked: number; complete: boolean };
  /** Pending plugin requests, or undefined when the workspace plugin list could not be read. */
  pendingRequests?: number;
  /** A plugin key to its name. */
  pluginLabel?: (key: string) => string;
}

export interface AttentionResult {
  items: AttentionItem[];
  /** Sources that did not answer, so "nothing needs attention" is not claimed for them. */
  unavailable: AttentionSource[];
}

const TONE_RANK: Record<AttentionTone, number> = { danger: 0, warning: 1, neutral: 2 };

export function assembleAttention(input: AttentionInputs): AttentionResult {
  const items: AttentionItem[] = [];
  const unavailable: AttentionSource[] = [];
  const label = input.pluginLabel ?? ((key: string) => key);

  if (input.balance === undefined) unavailable.push("billing");
  else if (input.balance === null) {
    items.push({ kind: "noPlan", tone: "warning", target: "plans", values: {} });
  } else {
    const warning = decideUsageWarning(input.balance);
    if (warning) {
      items.push({
        kind: "lowCredits",
        tone: warning.isCritical ? "danger" : "warning",
        target: "billing",
        values: { percent: warning.percentRemaining, credits: warning.creditsRemaining },
      });
    }
  }

  if (input.subscription?.cancelAtPeriodEnd) {
    items.push({
      kind: "planEnding",
      tone: "warning",
      target: "billing",
      values: { plan: input.subscription.planName, date: input.subscription.currentPeriodEnd },
    });
  }

  if (input.recurring === undefined) unavailable.push("payments");
  else if (input.recurring?.paymentFailed) {
    items.push({
      kind: "paymentFailed",
      tone: "danger",
      target: "billing",
      values: {
        reason: input.recurring.paymentFailureReason ?? "",
        graceEndsAt: input.recurring.paymentGraceEndsAt ?? "",
      },
    });
  }

  if (!input.tools) unavailable.push("toolAudit");
  else {
    const plugins = input.tools.needsSetupPlugins;
    if (plugins.length > 0) {
      items.push({
        kind: "pluginsNeedSetup",
        tone: "warning",
        target: "plugins",
        values: { count: plugins.length, plugins: plugins.slice(0, 3).map(label).join(", ") },
      });
    }
    if (input.tools.blocked > 0) {
      items.push({
        kind: "policyBlocks",
        tone: "neutral",
        target: "tools",
        values: { count: input.tools.blocked, atLeast: input.tools.complete ? "no" : "yes" },
      });
    }
  }

  if (input.pendingRequests === undefined) unavailable.push("plugins");
  else if (input.pendingRequests > 0) {
    items.push({ kind: "pendingRequests", tone: "warning", target: "plugins", values: { count: input.pendingRequests } });
  }

  items.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
  return { items, unavailable };
}

// ── export ───────────────────────────────────────────────────────────────────

export interface CsvFigure {
  label: string;
  figure: PeriodFigure;
  unit: string;
}

export const OVERVIEW_CSV_HEADER = ["Metric", "This period", "Previous period", "Change", "Unit", "Note"] as const;

/** One row per figure; an unavailable figure is an empty cell, never a 0. */
export function overviewCsvRows(figures: readonly CsvFigure[]): (string | number)[][] {
  const round = (value: number | null) => (value === null ? "" : Math.round(value * 10) / 10);
  return [
    [...OVERVIEW_CSV_HEADER],
    ...figures.map(({ label, figure, unit }) => [
      label,
      round(figure.value),
      round(figure.previous),
      deltaCsv(computeDelta(figure.value, figure.previous)),
      unit,
      figure.value === null ? "not available" : figure.atLeast ? "at least" : "",
    ]),
  ];
}

export function overviewCsv(figures: readonly CsvFigure[]): string {
  return toCsv(overviewCsvRows(figures));
}

/** Whole days between two instants, rounded up — "cycle ends in 16 days". */
export function daysUntil(iso: string, nowMs: number): number | null {
  const at = timeOf(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - nowMs) / MS_PER_DAY));
}
