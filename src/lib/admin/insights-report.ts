/**
 * The Insights report: a laid-out, readable document built from the same sources and period the
 * dashboard shows. The CSV export stays as the raw table; this is the version for a meeting.
 *
 * This file is the MODEL only — plain data, no `docx`, no canvas — so it runs under node --test.
 * `insights-report-docx.ts` lays it out. The report is tables and sentences only, without charts.
 *
 * Rules that carry over from the dashboard:
 *   - a figure the server could not compute is "—" with its note, never 0;
 *   - nothing is derived that no source supplied: no margin percentage without revenue, no credit
 *     allocation, no cost per plan beyond what the P&L source returns;
 *   - a source that is unavailable says so in the report instead of silently dropping its section;
 *   - every amount is USD, and USD is the only currency the document names. Server notes that
 *     mention another currency are reworded (see `usdOnlyNote`).
 */

import type {
  BillingInsightsDto,
  BillingSnapshotDto,
  InsightsMetric,
  MeetingsInsightsDto,
  ProfitAndLossDto,
  UsersInsightsDto,
  WorkspacesInsightsDto,
} from "../../types/admin-insights.ts";
import { providerLabel } from "./insights-pnl.ts";
import {
  computeDelta,
  deltaTone,
  findMetric,
  formatCount,
  formatInsightValue,
  METRIC_LABELS,
  workspaceLabel,
  type InsightsDelta,
} from "./insights-metrics.ts";

/** How the document is marked. The admin picks one when exporting. */
export type ReportClassification = "confidential" | "internal";

export const REPORT_CLASSIFICATIONS: Record<ReportClassification, { label: string; line: string }> = {
  confidential: {
    label: "CONFIDENTIAL",
    line: "CONFIDENTIAL — for authorised WarpTalk staff only. Do not forward or publish.",
  },
  internal: {
    label: "INTERNAL",
    line: "INTERNAL — for WarpTalk staff. Not for external distribution.",
  },
};

export interface ReportOptions {
  /** IANA zone the period's days were cut in (the server's `tz`). Null/absent = not stated. */
  timeZone?: string | null;
  classification?: ReportClassification;
  /** The per-day table. On by default. */
  includeDaily?: boolean;
}

export interface ReportSources {
  billing?: BillingInsightsDto | null;
  snapshot?: BillingSnapshotDto | null;
  users?: UsersInsightsDto | null;
  workspaces?: WorkspacesInsightsDto | null;
  meetings?: MeetingsInsightsDto | null;
  pnl?: ProfitAndLossDto | null;
}

/** The slice of `ResolvedInsightsPeriod` the report needs, so tests need not build the whole thing. */
export interface ReportPeriod {
  label: string;
  compare: "previous" | "previousMonth";
  /** YYYY-MM-DD, inclusive. */
  customFrom: string;
  customTo: string;
  previousFrom: Date;
  /** Exclusive. */
  previousTo: Date;
  /** Inclusive start of the period actually read. Absent = the report cannot judge whether it is open. */
  from?: Date;
  to?: Date;
  /** `ResolvedInsightsPeriod.closed`: false means the period is still running. Absent = unknown. */
  closed?: boolean;
  /** Exclusive end of the whole planned period (month, custom range), YYYY-MM-DD. */
  axisEndDay?: string | null;
}

/** Whether a figure moved the way the business wants. Colour in the document, words in the text. */
export type ReportTone = "good" | "bad";

export interface ReportTable {
  title: string;
  columns: string[];
  /** Column indexes that hold numbers and read right-aligned. */
  numericColumns: number[];
  rows: string[][];
  /** Parallel to `rows`: a cell the reader should see as good or bad news. Optional. */
  tones?: (ReportTone | null)[][];
  /** Share of the width the first column takes, 0-1. Default depends on the column count. */
  firstColumnShare?: number;
  note?: string | null;
}

export interface ReportSection {
  id: string;
  title: string;
  tables: ReportTable[];
}

export interface InsightsReport {
  /** The report's name, the same on every export. */
  title: string;
  /** The period in words, under the title: "1–30 September 2026". */
  periodTitle: string;
  /** Title and period on one line, for the file's properties and the page footer. */
  documentTitle: string;
  /** Calendar days in the reporting period, both ends included. */
  periodDays: number;
  classification: { id: ReportClassification; label: string; line: string };
  range: string;
  previousRange: string;
  comparisonLabel: string;
  /** "Asia/Ho_Chi_Minh (UTC+07:00)"; null when the caller did not say. */
  timeZone: string | null;
  generatedAt: string;
  /** The same instant in `timeZone` ("2026-10-03 14:05"), or in UTC when none was given. */
  generatedAtLocal: string;
  /** Things the reader must see before the numbers: an unfinished period. */
  warnings: string[];
  summary: string[];
  sections: ReportSection[];
  /** Plain-language caveats: unavailable sources, notes the server attached to figures. */
  notes: string[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The last INCLUSIVE day of a range whose `to` is exclusive. */
export function inclusiveEnd(exclusiveTo: Date): string {
  return localDay(new Date(exclusiveTo.getFullYear(), exclusiveTo.getMonth(), exclusiveTo.getDate() - 1));
}

const DASH = "—";

/**
 * The arrow says which way the number went; the word says whether that is good news. A ▼ on AI cost
 * and a ▼ on revenue look the same and mean opposite things, so with `higherIsBetter` the text adds
 * "better" or "worse" (never colour alone: the document gets printed in black and white).
 */
export function judgement(delta: InsightsDelta, higherIsBetter: boolean | undefined): ReportTone | null {
  if (higherIsBetter === undefined) return null;
  const tone = deltaTone(delta, higherIsBetter);
  return tone === "success" ? "good" : tone === "danger" ? "bad" : null;
}

/** "▲ 12.3% · better" / "▼ 4.0% · worse" / "no change" / "—" — plain text, readable on paper. */
export function changeText(delta: InsightsDelta, higherIsBetter?: boolean): string {
  const tone = judgement(delta, higherIsBetter);
  const verdict = tone === "good" ? " · better" : tone === "bad" ? " · worse" : "";
  switch (delta.kind) {
    case "none":
      return DASH;
    case "flat":
      return "no change";
    case "fromZero":
      return `${delta.direction === "up" ? "▲ from 0" : "▼ from 0"}${verdict}`;
    case "change":
      return `${delta.direction === "up" ? "▲" : "▼"} ${delta.percent.toFixed(1)}%${verdict}`;
  }
}

/** The absolute move, signed: "+1,200.00 USD", "-4.5 h", "+12". "—" when either side is unknown. */
export function differenceText(value: number | null, previous: number | null, unit: InsightsMetric["unit"]): string {
  if (value === null || previous === null || !Number.isFinite(value) || !Number.isFinite(previous)) return DASH;
  const diff = value - previous;
  if (unit === "percent") {
    const rounded = Math.round(diff * 10) / 10;
    return rounded === 0 ? "0.0 pp" : `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(1)} pp`;
  }
  const shown = formatInsightValue(Math.abs(diff), unit);
  // A difference that rounds to zero in the unit it is shown in carries no sign.
  if (/^0(\.0+)?( [A-Za-z]+)?$/.test(shown)) return shown;
  return `${diff > 0 ? "+" : "-"}${shown}`;
}

interface MetricLine {
  cells: string[];
  tones: (ReportTone | null)[];
}

function metricLine(label: string, metric: InsightsMetric | null | undefined): MetricLine {
  if (!metric) return { cells: [label, DASH, DASH, DASH, DASH], tones: [null, null, null, null, null] };
  const delta = computeDelta(metric.value, metric.previous);
  const tone = judgement(delta, metric.higherIsBetter);
  return {
    cells: [
      label,
      formatInsightValue(metric.value, metric.unit),
      formatInsightValue(metric.previous, metric.unit),
      differenceText(metric.value, metric.previous, metric.unit),
      changeText(delta, metric.higherIsBetter),
    ],
    tones: [null, null, null, tone, tone],
  };
}

const METRIC_COLUMNS = ["Metric", "This period", "Previous period", "Difference", "Change"];

function metricTable(title: string, lines: MetricLine[]): ReportTable {
  return {
    title,
    columns: METRIC_COLUMNS,
    numericColumns: [1, 2, 3, 4],
    rows: lines.map((line) => line.cells),
    tones: lines.map((line) => line.tones),
  };
}

function metricsTable(
  title: string,
  source: { metrics?: InsightsMetric[] | null } | null | undefined,
  ids: string[],
): ReportTable | null {
  if (!source) return null;
  return metricTable(title, ids.map((id) => metricLine(METRIC_LABELS[id] ?? id, findMetric(source, id))));
}

// ── wording that must stay USD ───────────────────────────────────────────────

/** What a note says once it may not name the second currency. */
const CONVERTED = "includes payments taken in another currency, converted to USD at the exchange rate of the day each was paid";

/**
 * Server notes are written for the dashboard, where "includes 4,734,000 VND converted at 26,300
 * VND/USD (billing_pricing_config.fx_rate_usd_vnd)" is fine. The report is USD and names no other
 * currency: the amount, the rate and the config key all go, and what stays is that a conversion
 * happened. A clause this does not recognise but that still names VND is replaced whole, so the
 * rule holds for notes written after this was.
 */
export function usdOnlyNote(note: string): string {
  const reworded = note
    .replace(/includes [\d,.]+ VND converted at [\d,.]+ VND\/USD/gi, CONVERTED)
    .replace(/\s*\(billing_pricing_config\.[a-z_]+\)/gi, "")
    .replace(/\s*\(no fx_rate_usd_vnd configured\)/gi, " (no exchange rate was available)")
    .replace(/excludes (\d+) [A-Z]{3}(?:\/[A-Z]{3})* rows/g, "excludes $1 payment(s) taken in another currency");
  return reworded
    .split("; ")
    .map((clause) => (/VND|₫/i.test(clause) ? "some figures include payments converted to USD from another currency" : clause))
    .filter((clause, index, all) => all.indexOf(clause) === index)
    .join("; ");
}

const cleaned = (note: string | null | undefined): string | null => {
  const text = note?.trim();
  return text ? usdOnlyNote(text) : null;
};

// ── time ─────────────────────────────────────────────────────────────────────

/** "Asia/Ho_Chi_Minh (UTC+07:00)". Falls back to the bare id when the runtime cannot name the offset. */
export function timeZoneLabel(timeZone: string, at: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part) return timeZone;
    const offset = part === "GMT" ? "UTC+00:00" : part.replace("GMT", "UTC");
    return `${timeZone} (${offset})`;
  } catch {
    return timeZone;
  }
}

/** "2026-10-03 14:05" in `timeZone`, or in UTC when none is given. */
export function localStamp(at: Date, timeZone: string | null): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  let list: Intl.DateTimeFormatPart[];
  try {
    list = format(timeZone ?? "UTC");
  } catch {
    list = format("UTC");
  }
  const get = (type: string) => list.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The period as a reader says it, day before month so no country reads it backwards:
 * "3 October 2026", "1–30 September 2026", "28 September – 3 October 2026",
 * "15 December 2026 – 14 January 2027". Both arguments are YYYY-MM-DD, inclusive.
 */
export function periodTitle(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = `${td} ${MONTHS[tm - 1]} ${ty}`;
  if (from === to) return end;
  if (fy === ty && fm === tm) return `${fd}–${end}`;
  if (fy === ty) return `${fd} ${MONTHS[fm - 1]} – ${end}`;
  return `${fd} ${MONTHS[fm - 1]} ${fy} – ${end}`;
}

/** Calendar days from `from` to `to`, both included. */
export function periodDayCount(from: string, to: string): number {
  const day = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((day(to) - day(from)) / DAY_MS) + 1;
}

/** The report's name. Title case, and the same on every export; the period goes on its own line. */
export const REPORT_TITLE = "WarpTalk Insights Report";

/** The warning for a period that has not finished, or null when it has (or the caller cannot tell). */
export function openPeriodWarning(
  period: ReportPeriod,
  generatedAt: Date,
  timeZone: string | null,
  comparisonLabel: string,
): string | null {
  if (period.closed !== false || !period.from) return null;
  const plannedEnd = period.axisEndDay ? new Date(`${period.axisEndDay}T00:00:00`) : null;
  const total = plannedEnd ? Math.max(1, Math.round((plannedEnd.getTime() - period.from.getTime()) / DAY_MS)) : null;
  const elapsed = Math.max(1, Math.ceil((generatedAt.getTime() - period.from.getTime()) / DAY_MS));
  const progress = total ? `${Math.min(elapsed, total)} of ${total} days have passed` : "it runs up to the moment of export";
  const through = plannedEnd ? ` The period is planned to end on ${inclusiveEnd(plannedEnd)}.` : "";
  return (
    `This period is not closed yet: ${progress} (read ${localStamp(generatedAt, timeZone)}).${through} ` +
    `Today's figures are partial and every number here can still change. ` +
    `Changes compare with ${comparisonLabel}, up to the same point in time.`
  );
}

// ── definitions ──────────────────────────────────────────────────────────────

/** What each figure means, as the servers compute it. Printed last, so the numbers can be audited. */
export const REPORT_DEFINITIONS: readonly (readonly [term: string, meaning: string])[] = [
  ["Revenue", "Payments that were paid and counted in the period, in USD. A payment taken in another currency is converted to USD at the exchange rate of the day it was paid. A Stripe checkout and its first invoice count once."],
  ["Payments / Failed payments", "Number of counted payments; number of payment attempts that failed. Failed payments are not part of revenue."],
  ["Revenue per payment", "Revenue divided by the number of payments that make it up."],
  ["New subscriptions", "Subscriptions whose first paid payment (or contract start) falls in the period. Trials that have not paid are not counted."],
  ["Cancelled subscriptions", "Paying subscriptions that ended (cancelled or expired), dated by the cancellation, or else by the end of the paid period. Plan switches are not counted."],
  ["AI provider cost", "What the AI providers charge for the credits consumed, in USD, from the provider cost on each service's rate card. Dubbing is taken from Cartesia's measured usage on the days it was synced and estimated from rate cards on the rest. It covers only credits whose provider cost is known; the notes say how much."],
  ["Revenue minus AI cost", "Revenue less AI provider cost. Other operating expenses are not deducted. It is overstated when the AI cost covers only part of the credits consumed."],
  ["Margin", "Revenue minus AI cost, as a percent of revenue."],
  ["Credits consumed / Overage credits", "Credits charged for AI services in the period; the part of them charged below a zero balance."],
  ["Meetings held", "Meetings that started in the period."],
  ["Hours translated", "Time a meeting room was open, from start to end, pauses included, counted only inside the period. A room still marked live counts at most 24 hours. It is not the time translation was running, so rooms left open raise it."],
  ["New users / Active users", "Accounts created in the period; distinct accounts issued a sign-in token in the period."],
  ["New workspaces", "Workspaces created in the period, deleted ones included."],
  ["MRR", "Monthly recurring revenue right now: the monthly price of every paying subscription (a yearly plan divided by 12), trials excluded, in USD."],
  ["Active subscriptions", "Subscriptions that are active right now and past any trial. A live count, not the count at the end of the period."],
  ["New and cancelled vs active", "New minus cancelled does not equal the change in active subscriptions: new and cancelled count events inside the period, while active is a count taken at the moment of export. The by-plan table counts trials and past-due subscriptions in their own columns."],
  ["Churn this month", "Subscriptions cancelled since the first of the month, divided by those active at the start of the month."],
  ["Days and time zone", "Every day, today and month boundary is cut in the time zone named on the first page."],
  ["Arrows", "The arrow shows which way a number moved. \"Better\" or \"worse\" shows whether that move is good for the business: lower AI cost or fewer failed payments is better, lower revenue is worse."],
];

function sentenceFor(label: string, metric: InsightsMetric | null | undefined, previousRange: string): string | null {
  if (!metric || metric.value === null) return null;
  const value = formatInsightValue(metric.value, metric.unit);
  const delta = computeDelta(metric.value, metric.previous);
  if (delta.kind === "none") return `${label}: ${value} (no comparable figure for ${previousRange}).`;
  if (delta.kind === "flat") return `${label}: ${value}, unchanged from ${previousRange}.`;
  if (delta.kind === "fromZero") return `${label}: ${value}, up from 0 in ${previousRange}.`;
  const direction = delta.direction === "up" ? "up" : "down";
  const tone = judgement(delta, metric.higherIsBetter);
  const verdict = tone === "good" ? " (better)" : tone === "bad" ? " (worse)" : "";
  return `${label}: ${value}, ${direction} ${delta.percent.toFixed(1)}% from ${formatInsightValue(metric.previous, metric.unit)} in ${previousRange}${verdict}.`;
}

// ── build ────────────────────────────────────────────────────────────────────

export function buildInsightsReport(
  sources: ReportSources,
  period: ReportPeriod,
  generatedAt: Date = new Date(),
  options: ReportOptions = {},
): InsightsReport {
  const classificationId = options.classification ?? "confidential";
  const timeZone = options.timeZone ? timeZoneLabel(options.timeZone, generatedAt) : null;
  const range = `${period.customFrom} to ${period.customTo}`;
  const previousRange = `${localDay(period.previousFrom)} to ${inclusiveEnd(period.previousTo)}`;
  const comparisonLabel =
    period.compare === "previousMonth" ? "the same days of the previous month" : "the period immediately before";
  const { billing, snapshot, users, workspaces, meetings, pnl } = sources;

  const warnings: string[] = [];
  const open = openPeriodWarning(period, generatedAt, options.timeZone ?? null, comparisonLabel);
  if (open) warnings.push(open);

  const notes: string[] = [];
  const unavailable = (name: string, source: unknown) => {
    if (!source) notes.push(`${name} data was not available when this report was generated; its figures show "${DASH}".`);
  };
  unavailable("Billing", billing);
  unavailable("Billing snapshot", snapshot);
  unavailable("User", users);
  unavailable("Workspace", workspaces);
  unavailable("Meeting", meetings);

  // Summary: the figures a reader asks about first, as sentences with their comparison.
  const summary = [
    sentenceFor("Revenue", findMetric(billing, "revenue"), previousRange),
    sentenceFor("AI provider cost", findMetric(billing, "aiProviderCost"), previousRange),
    sentenceFor("Revenue minus AI cost", findMetric(billing, "grossMargin"), previousRange),
    sentenceFor("Meetings held", findMetric(meetings, "meetingsHeld"), previousRange),
    sentenceFor("Hours translated", findMetric(meetings, "hoursTranslated"), previousRange),
    sentenceFor("Credits consumed", findMetric(billing, "creditsConsumed"), previousRange),
  ].filter((s): s is string => s !== null);
  if (snapshot) {
    const churn = snapshot.churnRateMonth;
    summary.push(
      `Right now: MRR ${formatInsightValue(snapshot.mrr, "money")}, ${formatCount(snapshot.activeSubscriptions)} active subscriptions, ` +
        `churn this month ${churn.rate === null ? DASH : `${churn.rate.toFixed(1)}%`} (${formatCount(churn.cancelled)} of ${formatCount(churn.atMonthStart)} at month start).`,
    );
  }

  const sections: ReportSection[] = [];

  // 1 · Revenue, subscriptions, AI cost
  {
    const tables: ReportTable[] = [];
    const periodTable = metricsTable("Period metrics", billing, [
      "revenue",
      "payments",
      "failedPayments",
      "revenuePerPayment",
      "newSubscriptions",
      "cancelledSubscriptions",
      "aiProviderCost",
      "grossMargin",
    ]);
    if (periodTable) tables.push(periodTable);
    if (snapshot) {
      tables.push({
        title: "Subscriptions right now",
        columns: ["Figure", "Value"],
        numericColumns: [1],
        rows: [
          ["Revenue today", formatInsightValue(snapshot.revenueToday, "money")],
          ["Revenue yesterday", formatInsightValue(snapshot.revenueYesterday, "money")],
          ["MRR", formatInsightValue(snapshot.mrr, "money")],
          ["Active subscriptions", formatCount(snapshot.activeSubscriptions)],
          ["Churn this month", snapshot.churnRateMonth.rate === null ? DASH : `${snapshot.churnRateMonth.rate.toFixed(1)}%`],
          ["Trials", formatCount(snapshot.trials)],
          ["Past due", formatCount(snapshot.pastDue)],
          [
            "Outstanding invoices",
            `${formatCount(snapshot.outstandingInvoices.count)} (${formatInsightValue(snapshot.outstandingInvoices.amount, "money")})`,
          ],
        ],
        note:
          [snapshot.mrrNote, snapshot.revenueTodayNote, snapshot.outstandingInvoices.amountNote]
            .map(cleaned)
            .filter(Boolean)
            .join(" · ") || null,
      });
      if (snapshot.subscriptionsByPlan.length) {
        tables.push({
          title: "Subscriptions by plan",
          columns: ["Plan", "Active", "Trial", "Past due"],
          numericColumns: [1, 2, 3],
          rows: snapshot.subscriptionsByPlan.map((p) => [
            p.planName,
            formatCount(p.active),
            formatCount(p.trial),
            formatCount(p.pastDue),
          ]),
        });
      }
    }
    const dayNote = cleaned(billing?.revenueByDayNote);
    if (dayNote) notes.push(`Revenue per day: ${dayNote}`);
    if (billing?.aiProviderCostBasis) {
      const basis = billing.aiProviderCostBasis;
      notes.push(
        `AI provider cost basis: ${basis.basis} (${basis.measuredDays} measured day(s), ${basis.estimatedDays} estimated day(s)).`,
      );
    }
    sections.push({ id: "revenue", title: "Revenue, subscriptions and AI cost", tables });
  }

  // 2 · Usage
  {
    const tables: ReportTable[] = [
      metricTable("Usage metrics", [
        metricLine("Meetings held", findMetric(meetings, "meetingsHeld")),
        metricLine("Hours translated", findMetric(meetings, "hoursTranslated")),
        metricLine("Credits consumed", findMetric(billing, "creditsConsumed")),
        metricLine("Overage credits", findMetric(billing, "overageCredits")),
        metricLine("New users", findMetric(users, "newUsers")),
        metricLine("Active users", findMetric(users, "activeUsers")),
        metricLine("New workspaces", findMetric(workspaces, "newWorkspaces")),
      ]),
    ];
    const lengthNote = meetingLengthNote(findMetric(meetings, "meetingsHeld"), findMetric(meetings, "hoursTranslated"));
    if (lengthNote) notes.push(lengthNote);
    if (billing?.creditsByService.length) {
      tables.push({
        title: "Credits by service",
        columns: ["Service", "Credits"],
        numericColumns: [1],
        rows: billing.creditsByService.map((s) => [s.usageType, formatCount(s.credits)]),
      });
    }
    sections.push({ id: "usage", title: "Usage", tables });
  }

  // 3 · Workspaces and providers
  {
    const tables: ReportTable[] = [];
    if (billing?.topWorkspaces.length) {
      tables.push({
        title: "Top workspaces by credits consumed",
        columns: ["#", "Workspace", "Credits"],
        numericColumns: [0, 2],
        rows: billing.topWorkspaces.map((w, i) => [String(i + 1), workspaceLabel(w.workspaceName), formatCount(w.credits)]),
      });
    }
    if (pnl?.plans.length) {
      tables.push({
        title: "Revenue and AI cost by plan",
        columns: ["Plan", "Revenue", "Credits", "AI cost", "Revenue minus AI cost", "Margin"],
        numericColumns: [1, 2, 3, 4, 5],
        rows: pnl.plans.map((p) => [
          p.planName,
          formatInsightValue(p.revenue, "money"),
          formatCount(p.credits),
          formatInsightValue(p.aiCost, "money"),
          formatInsightValue(p.grossMargin, "money"),
          p.marginPercent === null ? DASH : `${p.marginPercent.toFixed(1)}%`,
        ]),
        note:
          pnl.plans
            .map((p) => (p.note ? `${p.planName}: ${cleaned(p.note)}` : null))
            .filter(Boolean)
            .join(" · ") || null,
      });
    }
    if (pnl?.providers.length) {
      tables.push({
        title: "AI provider cost",
        columns: ["Provider", "Credits", "Cost", "Cost covered"],
        numericColumns: [1, 2, 3],
        rows: pnl.providers.map((p) => [
          providerLabel(p.provider),
          formatCount(p.credits),
          formatInsightValue(p.costUsd, "money"),
          `${p.coveragePercent.toFixed(0)}%`,
        ]),
      });
    }
    for (const note of [pnl?.costNote, pnl?.fxNote]) if (cleaned(note)) notes.push(cleaned(note)!);
    if (tables.length) {
      sections.push({ id: "workspaces", title: "Workspaces and providers", tables });
    }
  }

  // 4 · Daily detail
  {
    const days = new Set<string>();
    for (const d of billing?.revenueByDay ?? []) days.add(d.date);
    for (const d of meetings?.meetingsByDay ?? []) days.add(d.date);
    for (const d of users?.newUsersByDay ?? []) days.add(d.date);
    const revenue = new Map((billing?.revenueByDay ?? []).map((d) => [d.date, d.revenue]));
    const meet = new Map((meetings?.meetingsByDay ?? []).map((d) => [d.date, d]));
    const newUsers = new Map((users?.newUsersByDay ?? []).map((d) => [d.date, d.count]));
    const rows = (options.includeDaily === false ? [] : [...days]).sort().map((date) => {
      const m = meet.get(date);
      return [
        date,
        revenue.has(date) ? formatInsightValue(revenue.get(date) ?? null, "money") : DASH,
        m ? formatCount(m.meetings) : DASH,
        m ? formatInsightValue(m.hours, "hours") : DASH,
        newUsers.has(date) ? formatCount(newUsers.get(date)!) : DASH,
      ];
    });
    if (rows.length) {
      sections.push({
        id: "daily",
        title: "Daily detail",
        tables: [
          {
            title: "Per day",
            columns: ["Date", "Revenue", "Meetings", "Hours translated", "New users"],
            numericColumns: [1, 2, 3, 4],
            rows,
          },
        ],
      });
    }
  }

  // Server-attached notes on period figures, once each.
  for (const source of [billing, users, workspaces, meetings]) {
    for (const metric of source?.metrics ?? []) {
      const note = cleaned(metric.note);
      if (note) notes.push(`${METRIC_LABELS[metric.id] ?? metric.id}: ${note}`);
    }
  }
  if (cleaned(billing?.revenueByMonthNote)) notes.push(cleaned(billing?.revenueByMonthNote)!);

  // What every figure means: last, so the report can be read without it and audited with it.
  sections.push({
    id: "definitions",
    title: "Definitions",
    tables: [
      {
        title: "How each figure is calculated",
        columns: ["Term", "Meaning"],
        numericColumns: [],
        firstColumnShare: 0.28,
        rows: REPORT_DEFINITIONS.map(([term, meaning]) => [term, meaning]),
      },
    ],
  });

  return {
    title: REPORT_TITLE,
    periodTitle: periodTitle(period.customFrom, period.customTo),
    documentTitle: `${REPORT_TITLE} — ${periodTitle(period.customFrom, period.customTo)}`,
    periodDays: periodDayCount(period.customFrom, period.customTo),
    classification: { id: classificationId, ...REPORT_CLASSIFICATIONS[classificationId] },
    range,
    previousRange,
    comparisonLabel,
    timeZone,
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: localStamp(generatedAt, options.timeZone ?? null),
    warnings,
    summary,
    sections,
    notes: [...new Set(notes)],
  };
}

/**
 * A meeting is counted when it starts; its hours are the time the room stayed open. When the average
 * is long, rooms left open (nobody pressed "end") are the usual reason, and the hours figure and the
 * meetings figure then move by very different percentages. Say so instead of leaving the reader to
 * wonder which of the two is wrong. Null when there is nothing odd to say.
 */
export function meetingLengthNote(
  held: InsightsMetric | null | undefined,
  hours: InsightsMetric | null | undefined,
  thresholdHours = 6,
): string | null {
  if (!held || !hours) return null;
  const average = (h: number | null, m: number | null) => (h === null || m === null || m <= 0 ? null : h / m);
  const now = average(hours.value, held.value);
  const before = average(hours.previous, held.previous);
  if ((now ?? 0) <= thresholdHours && (before ?? 0) <= thresholdHours) return null;
  const show = (value: number | null) => (value === null ? DASH : `${formatInsightValue(value, "hours")}`);
  const hoursChange = computeDelta(hours.value, hours.previous);
  const heldChange = computeDelta(held.value, held.previous);
  const moved =
    hoursChange.kind === "change" && heldChange.kind === "change"
      ? ` Hours moved ${hoursChange.direction === "up" ? "up" : "down"} ${hoursChange.percent.toFixed(1)}% while meetings moved ${heldChange.direction === "up" ? "up" : "down"} ${heldChange.percent.toFixed(1)}%.`
      : "";
  return (
    `Average meeting length is ${show(now)} this period and ${show(before)} in the previous period. ` +
    `Hours count the time a room stayed open, so rooms left open raise them.${moved}`
  );
}

/** `warptalk-insights-report-2026-09-01-to-2026-09-30.docx` (or `.pdf`) */
export function insightsReportFileName(
  period: Pick<ReportPeriod, "customFrom" | "customTo">,
  extension: "docx" | "pdf" = "docx",
): string {
  return `warptalk-insights-report-${period.customFrom}-to-${period.customTo}.${extension}`;
}
