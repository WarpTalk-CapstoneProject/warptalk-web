/**
 * The Insights report: a laid-out, readable document built from the same sources and period the
 * dashboard shows. The CSV export stays as the raw table; this is the version for a meeting.
 *
 * This file is the MODEL only — plain data, no `docx`, no canvas — so it runs under node --test.
 * `insights-report-docx.ts` lays it out; `insights-report-charts.ts` draws its charts.
 *
 * Rules that carry over from the dashboard:
 *   - a figure the server could not compute is "—" with its note, never 0;
 *   - nothing is derived that no source supplied: no margin percentage without revenue, no credit
 *     allocation, no cost per plan beyond what the P&L source returns;
 *   - a source that is unavailable says so in the report instead of silently dropping its section.
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
  findMetric,
  formatCount,
  formatInsightValue,
  METRIC_LABELS,
  workspaceLabel,
  type InsightsDelta,
} from "./insights-metrics.ts";

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
}

export interface ReportTable {
  title: string;
  columns: string[];
  /** Column indexes that hold numbers and read right-aligned. */
  numericColumns: number[];
  rows: string[][];
  note?: string | null;
}

export interface ReportChartPoint {
  label: string;
  value: number | null;
}

export interface ReportChart {
  id: "revenuePerDay" | "creditsPerWorkspace" | "meetingsPerDay";
  title: string;
  /** `columns`: one bar per day, left to right. `bars`: one horizontal bar per row, ranked. */
  kind: "columns" | "bars";
  unit: "money" | "count" | "credits" | "hours";
  points: ReportChartPoint[];
  note?: string | null;
}

export interface ReportSection {
  id: string;
  title: string;
  tables: ReportTable[];
  charts: ReportChart[];
}

export interface InsightsReport {
  title: string;
  periodLabel: string;
  range: string;
  previousRange: string;
  comparisonLabel: string;
  generatedAt: string;
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

/** "▲ 12.3%" / "▼ 4.0%" / "no change" / "—" — plain text, readable on paper. */
export function changeText(delta: InsightsDelta): string {
  switch (delta.kind) {
    case "none":
      return DASH;
    case "flat":
      return "no change";
    case "fromZero":
      return delta.direction === "up" ? "▲ from 0" : "▼ from 0";
    case "change":
      return `${delta.direction === "up" ? "▲" : "▼"} ${delta.percent.toFixed(1)}%`;
  }
}

function metricRow(label: string, metric: InsightsMetric | null | undefined): string[] {
  if (!metric) return [label, DASH, DASH, DASH];
  return [
    label,
    formatInsightValue(metric.value, metric.unit),
    formatInsightValue(metric.previous, metric.unit),
    changeText(computeDelta(metric.value, metric.previous)),
  ];
}

const METRIC_COLUMNS = ["Metric", "This period", "Previous period", "Change"];

function metricsTable(
  title: string,
  source: { metrics?: InsightsMetric[] | null } | null | undefined,
  ids: string[],
): ReportTable | null {
  if (!source) return null;
  return {
    title,
    columns: METRIC_COLUMNS,
    numericColumns: [1, 2, 3],
    rows: ids.map((id) => metricRow(METRIC_LABELS[id] ?? id, findMetric(source, id))),
  };
}

function sentenceFor(label: string, metric: InsightsMetric | null | undefined, previousRange: string): string | null {
  if (!metric || metric.value === null) return null;
  const value = formatInsightValue(metric.value, metric.unit);
  const delta = computeDelta(metric.value, metric.previous);
  if (delta.kind === "none") return `${label}: ${value} (no comparable figure for ${previousRange}).`;
  if (delta.kind === "flat") return `${label}: ${value}, unchanged from ${previousRange}.`;
  if (delta.kind === "fromZero") return `${label}: ${value}, up from 0 in ${previousRange}.`;
  const direction = delta.direction === "up" ? "up" : "down";
  return `${label}: ${value}, ${direction} ${delta.percent.toFixed(1)}% from ${formatInsightValue(metric.previous, metric.unit)} in ${previousRange}.`;
}

// ── build ────────────────────────────────────────────────────────────────────

export function buildInsightsReport(
  sources: ReportSources,
  period: ReportPeriod,
  generatedAt: Date = new Date(),
): InsightsReport {
  const range = `${period.customFrom} to ${period.customTo}`;
  const previousRange = `${localDay(period.previousFrom)} to ${inclusiveEnd(period.previousTo)}`;
  const comparisonLabel =
    period.compare === "previousMonth" ? "the same days of the previous month" : "the period immediately before";
  const { billing, snapshot, users, workspaces, meetings, pnl } = sources;

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
    const charts: ReportChart[] = [];
    if (billing?.revenueByDay.length) {
      charts.push({
        id: "revenuePerDay",
        title: "Revenue per day",
        kind: "columns",
        unit: "money",
        points: billing.revenueByDay.map((d) => ({ label: d.date.slice(5), value: d.revenue })),
        note: billing.revenueByDayNote,
      });
    }
    if (billing?.aiProviderCostBasis) {
      const basis = billing.aiProviderCostBasis;
      notes.push(
        `AI provider cost basis: ${basis.basis} (${basis.measuredDays} measured day(s), ${basis.estimatedDays} estimated day(s)).`,
      );
    }
    sections.push({ id: "revenue", title: "Revenue, subscriptions and AI cost", tables, charts });
  }

  // 2 · Usage
  {
    const tables: ReportTable[] = [
      {
        title: "Usage metrics",
        columns: METRIC_COLUMNS,
        numericColumns: [1, 2, 3],
        rows: [
          metricRow("Meetings held", findMetric(meetings, "meetingsHeld")),
          metricRow("Hours translated", findMetric(meetings, "hoursTranslated")),
          metricRow("Credits consumed", findMetric(billing, "creditsConsumed")),
          metricRow("Overage credits", findMetric(billing, "overageCredits")),
          metricRow("New users", findMetric(users, "newUsers")),
          metricRow("Active users", findMetric(users, "activeUsers")),
          metricRow("New workspaces", findMetric(workspaces, "newWorkspaces")),
        ],
      },
    ];
    if (billing?.creditsByService.length) {
      tables.push({
        title: "Credits by service",
        columns: ["Service", "Credits"],
        numericColumns: [1],
        rows: billing.creditsByService.map((s) => [s.usageType, formatCount(s.credits)]),
      });
    }
    const charts: ReportChart[] = [];
    if (meetings?.meetingsByDay.length) {
      charts.push({
        id: "meetingsPerDay",
        title: "Meetings per day",
        kind: "columns",
        unit: "count",
        points: meetings.meetingsByDay.map((d) => ({ label: d.date.slice(5), value: d.meetings })),
      });
    }
    sections.push({ id: "usage", title: "Usage", tables, charts });
  }

  // 3 · Workspaces and providers
  {
    const tables: ReportTable[] = [];
    const charts: ReportChart[] = [];
    if (billing?.topWorkspaces.length) {
      tables.push({
        title: "Top workspaces by credits consumed",
        columns: ["#", "Workspace", "Credits"],
        numericColumns: [0, 2],
        rows: billing.topWorkspaces.map((w, i) => [String(i + 1), workspaceLabel(w.workspaceName), formatCount(w.credits)]),
      });
      charts.push({
        id: "creditsPerWorkspace",
        title: "Credits per workspace",
        kind: "bars",
        unit: "credits",
        points: billing.topWorkspaces.map((w) => ({ label: workspaceLabel(w.workspaceName), value: w.credits })),
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
            .map((p) => (p.note ? `${p.planName}: ${p.note}` : null))
            .filter(Boolean)
            .join(" · ") || null,
      });
    }
    if (pnl?.providers.length) {
      tables.push({
        title: "AI provider cost",
        columns: ["Provider", "Credits", "Cost (USD)", "Cost (VND)", "Cost covered"],
        numericColumns: [1, 2, 3, 4],
        rows: pnl.providers.map((p) => [
          providerLabel(p.provider),
          formatCount(p.credits),
          p.costUsd.toFixed(2),
          formatInsightValue(p.costVnd, "money"),
          `${p.coveragePercent.toFixed(0)}%`,
        ]),
      });
    }
    for (const note of [pnl?.costNote, pnl?.fxNote]) if (note) notes.push(note);
    if (tables.length || charts.length) {
      sections.push({ id: "workspaces", title: "Workspaces and providers", tables, charts });
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
    const rows = [...days].sort().map((date) => {
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
        charts: [],
      });
    }
  }

  // Server-attached notes on period figures, once each.
  for (const source of [billing, users, workspaces, meetings]) {
    for (const metric of source?.metrics ?? []) {
      const note = metric.note?.trim();
      if (note) notes.push(`${METRIC_LABELS[metric.id] ?? metric.id}: ${note}`);
    }
  }
  if (billing?.revenueByMonthNote) notes.push(billing.revenueByMonthNote);

  return {
    title: "WarpTalk Insights report",
    periodLabel: period.label,
    range,
    previousRange,
    comparisonLabel,
    generatedAt: generatedAt.toISOString(),
    summary,
    sections,
    notes: [...new Set(notes)],
  };
}

/** `warptalk-insights-report-2026-09-01-to-2026-09-30.docx` */
export function insightsReportFileName(period: Pick<ReportPeriod, "customFrom" | "customTo">): string {
  return `warptalk-insights-report-${period.customFrom}-to-${period.customTo}.docx`;
}
