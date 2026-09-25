/**
 * The Insights page's arithmetic and wording, kept out of the components so it can be tested.
 *
 * DELTA SEMANTICS (taken from the OpenBoox ERP `DeltaChip`)
 *   previous unknown     → "no figure last period"
 *   |Δ| < 0.05%          → "no change"
 *   otherwise            → ▲/▼ and the percentage to one decimal
 *
 *   The colour says whether the move is GOOD, not which way it went: fewer cancellations is a ▼
 *   in green. That is what `higherIsBetter` is for, and it comes from the server with the metric.
 *
 * NOTHING IS INVENTED
 *   A source that did not answer, or a metric id it did not return, is "unavailable" — shown as a
 *   dash with a note — never as a zero. A zero is a claim about the platform; a dash is a claim
 *   about the page.
 */

import type {
  AiProviderCostBasisDto,
  BillingInsightsDto,
  BillingSnapshotDto,
  CartesiaUsageDto,
  InsightsMetric,
  InsightsUnit,
  MeetingsInsightsDto,
  UsersInsightsDto,
  WorkspacesInsightsDto,
} from "../../types/admin-insights.ts";
import { formatMoney } from "../format/currency.ts";
import { toCsv } from "../billing/usage-overview.ts";

export const NOT_AVAILABLE_NOTE = "Not available yet";

/** What a row says when workspace-service could not name the workspace. The link still uses the id. */
export const UNKNOWN_WORKSPACE = "Unknown workspace";

/**
 * Translator shape matching `useTranslations("adminOps.insights")` from next-intl. Optional and
 * defaulted to the pre-catalog English strings throughout this file, same convention as
 * `getPlanDescription` in `src/lib/utils.ts` — see `.agents/page-docs/i18n-localization.md`. The
 * page (`insights-dashboard.tsx`) passes the real translator; the node tests here call every
 * function without one and get the exact English wording they have always pinned.
 */
export type InsightsTranslator = (key: string, values?: Record<string, string | number>) => string;

/** `t(key, values)` when a translator was given, else the English `fallback` — never invented text. */
function say(
  t: InsightsTranslator | undefined,
  key: string,
  fallback: string,
  values?: Record<string, string | number>,
): string {
  return t ? t(key, values) : fallback;
}

export function workspaceLabel(name: string | null | undefined, t?: InsightsTranslator): string {
  return name?.trim() || say(t, "common.unknownWorkspace", UNKNOWN_WORKSPACE);
}

/** Joins the parts that say something, " · " between them; null when none does. */
export function joinNotes(...parts: (string | null | undefined)[]): string | null {
  const said = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return said.length ? said.join(" · ") : null;
}

const NUMBER_LOCALE = "en-US";
const integer = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 1 });

// ── delta ────────────────────────────────────────────────────────────────────

export type InsightsDelta =
  | { kind: "none" }
  | { kind: "flat" }
  | { kind: "fromZero"; direction: "up" | "down" }
  | { kind: "change"; direction: "up" | "down"; percent: number };

export function computeDelta(value: number | null, previous: number | null): InsightsDelta {
  if (value === null || previous === null || !Number.isFinite(value) || !Number.isFinite(previous)) {
    return { kind: "none" };
  }
  if (previous === 0) {
    // A percentage of nothing is infinite. "No figure" would be false — the figure was 0.
    if (value === 0) return { kind: "flat" };
    return { kind: "fromZero", direction: value > 0 ? "up" : "down" };
  }
  const percent = ((value - previous) / Math.abs(previous)) * 100;
  if (Math.abs(percent) < 0.05) return { kind: "flat" };
  return { kind: "change", direction: percent > 0 ? "up" : "down", percent: Math.abs(percent) };
}

export type DeltaTone = "success" | "danger" | "neutral";

/** Good or bad, from `higherIsBetter` — never from the sign alone. */
export function deltaTone(delta: InsightsDelta, higherIsBetter: boolean): DeltaTone {
  if (delta.kind !== "change" && delta.kind !== "fromZero") return "neutral";
  return (delta.direction === "up") === higherIsBetter ? "success" : "danger";
}

export function deltaText(delta: InsightsDelta, t?: InsightsTranslator): string {
  switch (delta.kind) {
    case "none":
      return say(t, "delta.noFigure", "no figure last period");
    case "flat":
      return say(t, "delta.noChange", "no change");
    case "fromZero": {
      const arrow = delta.direction === "up" ? "▲" : "▼";
      return say(t, "delta.fromZero", `${arrow} from 0`, { arrow });
    }
    case "change": {
      const arrow = delta.direction === "up" ? "▲" : "▼";
      const percent = delta.percent.toFixed(1);
      return say(t, "delta.change", `${arrow} ${percent}%`, { arrow, percent });
    }
  }
}

/** The "Change" column of the export: signed, one decimal, empty when there is nothing to say. */
export function deltaCsv(delta: InsightsDelta): string {
  if (delta.kind === "flat") return "0.0%";
  if (delta.kind !== "change") return "";
  return `${delta.direction === "up" ? "" : "-"}${delta.percent.toFixed(1)}%`;
}

// ── values ───────────────────────────────────────────────────────────────────

export function formatInsightValue(value: number | null | undefined, unit: InsightsUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "money":
      return formatMoney(Math.round(value), "VND");
    case "hours":
      return `${oneDecimal.format(value)} h`;
    case "percent":
      return `${oneDecimal.format(value)}%`;
    case "count":
    case "credits":
    default:
      return integer.format(value);
  }
}

/** Chart labels: 48.9M, 240k, 12. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${oneDecimal.format(value / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${oneDecimal.format(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${integer.format(value / 1_000)}k`;
  return oneDecimal.format(value);
}

export function formatCount(value: number): string {
  return integer.format(value);
}

export type ValueTone = "success" | "warning" | "danger" | "neutral";

/** Churn above this reads as a problem (percent of subscriptions active at month start). */
export const CHURN_DANGER_PERCENT = 5;

/**
 * The colour of a card's number. Money in is green, provider cost amber, losses red; operational
 * queues go amber the moment they are not empty, because an empty queue is the only healthy one.
 */
export function valueTone(id: string, value: number | null | undefined): ValueTone {
  if (value === null || value === undefined || !Number.isFinite(value)) return "neutral";
  switch (id) {
    case "revenue":
    case "revenueToday":
    case "mrr":
      return "success";
    case "grossMargin":
      return value < 0 ? "danger" : "success";
    case "aiProviderCost":
      return "warning";
    case "cancelledSubscriptions":
      return "danger";
    case "churnRate":
      return value > CHURN_DANGER_PERCENT ? "danger" : "neutral";
    case "outstandingInvoices":
    case "openSalesLeads":
    case "deadLetters":
    case "pastDue":
      return value > 0 ? "warning" : "neutral";
    default:
      return "neutral";
  }
}

// ── snapshot cards ───────────────────────────────────────────────────────────
//
// Each of these figures can be null on the wire (a currency with no FX rate, nothing active at
// month start). The value then renders "—" through formatInsightValue, and the sub-line below it
// carries the server's note, so a dash is never left unexplained and never reads as 0.

/** "yesterday 4,480,000 ₫" plus whatever today's and yesterday's notes say. */
export function revenueTodaySub(
  snapshot: Pick<BillingSnapshotDto, "revenueToday" | "revenueTodayNote" | "revenueYesterday" | "revenueYesterdayNote">,
  t?: InsightsTranslator,
): string {
  const yesterdayValue = formatInsightValue(snapshot.revenueYesterday, "money");
  return joinNotes(
    snapshot.revenueToday === null && !snapshot.revenueTodayNote
      ? say(t, "revenueToday.cannotTotal", "today cannot be totalled")
      : snapshot.revenueTodayNote,
    say(t, "revenueToday.yesterday", `yesterday ${yesterdayValue}`, { value: yesterdayValue }),
    snapshot.revenueYesterdayNote
      ? say(t, "revenueToday.yesterdayNote", `yesterday ${snapshot.revenueYesterdayNote}`, { note: snapshot.revenueYesterdayNote })
      : null,
  ) as string;
}

export function mrrSub(snapshot: Pick<BillingSnapshotDto, "mrr" | "mrrNote">, t?: InsightsTranslator): string {
  return (
    snapshot.mrrNote?.trim() ||
    (snapshot.mrr === null ? say(t, "mrr.cannotTotal", "Cannot be totalled in VND") : say(t, "mrr.note", "Monthly recurring revenue"))
  );
}

export function churnSub(churn: BillingSnapshotDto["churnRateMonth"], t?: InsightsTranslator): string {
  return joinNotes(
    say(
      t,
      "churn.breakdown",
      `${formatCount(churn.cancelled)} cancelled / ${formatCount(churn.atMonthStart)} at month start`,
      { cancelled: formatCount(churn.cancelled), atMonthStart: formatCount(churn.atMonthStart) },
    ),
    churn.rate === null ? say(t, "churn.noRate", "no rate without paying subscriptions at month start") : null,
  ) as string;
}

export function outstandingSub(invoices: BillingSnapshotDto["outstandingInvoices"], t?: InsightsTranslator): string {
  return joinNotes(
    say(t, "outstanding.invoiceCount", `${formatCount(invoices.count)} ${invoices.count === 1 ? "invoice" : "invoices"}`, {
      count: invoices.count,
    }),
    say(t, "outstanding.pastDueCount", `${formatCount(invoices.pastDueCount)} past due`, { count: invoices.pastDueCount }),
    invoices.amountNote ?? (invoices.amount === null ? say(t, "outstanding.cannotTotal", "amount cannot be totalled in VND") : null),
  ) as string;
}

/** "N,NNN ₫ outstanding", or what is known when the amount could not be totalled. */
function outstandingAmountText(invoices: BillingSnapshotDto["outstandingInvoices"], t?: InsightsTranslator): string {
  if (invoices.amount === null) {
    if (invoices.amountNote) {
      return say(t, "outstanding.amountNotTotalledWithNote", `Amount not totalled (${invoices.amountNote})`, {
        note: invoices.amountNote,
      });
    }
    return say(t, "outstanding.amountNotTotalled", "Amount not totalled");
  }
  const value = formatInsightValue(invoices.amount, "money");
  return say(t, "outstanding.amountOutstanding", `${value} outstanding`, { value });
}

// ── Cartesia ─────────────────────────────────────────────────────────────────
//
// Structured, not worded: the page translates these (next-intl), and the node tests here have no
// catalog. The tone is the only judgement made here.

/** A sync older than this, while the status still says ok, is stale: 3 missed 10-minute syncs. */
export const CARTESIA_STALE_MINUTES = 30;

export interface CartesiaLineView {
  /** `stale`: status ok, but the newest synced row is older than CARTESIA_STALE_MINUTES. */
  state: CartesiaUsageDto["status"] | "stale";
  tone: "neutral" | "warning";
  creditsThisMonth: number | null;
  creditsToday: number | null;
  remainingCredits: number | null;
  /** Minutes since the newest synced row; null when nothing was ever synced. */
  syncedMinutesAgo: number | null;
  note: string | null;
}

/** The snapshot's Cartesia line. Anything but a fresh ok sync is a warning. */
export function cartesiaLineView(cartesia: CartesiaUsageDto, nowMs: number): CartesiaLineView {
  const syncedMs = cartesia.lastSyncedAt ? Date.parse(cartesia.lastSyncedAt) : Number.NaN;
  const syncedMinutesAgo = Number.isFinite(syncedMs) ? Math.max(0, Math.floor((nowMs - syncedMs) / 60_000)) : null;
  const stale =
    cartesia.status === "ok" && (syncedMinutesAgo === null || syncedMinutesAgo > CARTESIA_STALE_MINUTES);
  const state = stale ? "stale" : cartesia.status;
  return {
    state,
    tone: state === "ok" || state === "pending" ? "neutral" : "warning",
    creditsThisMonth: cartesia.creditsThisMonth,
    creditsToday: cartesia.creditsToday,
    remainingCredits: cartesia.remainingCredits,
    syncedMinutesAgo,
    note: state === "ok" ? null : cartesia.statusNote,
  };
}

export interface AiCostBasisView {
  basis: AiProviderCostBasisDto["basis"];
  measuredDays: number;
  totalDays: number;
  cartesiaCredits: number;
  /** A basis the admin should question: estimated while the sync is broken or switched off. */
  tone: "neutral" | "warning";
}

/**
 * How the AI provider cost card priced dubbing. Null from a backend that predates the sync, so the
 * card claims no basis rather than a wrong one.
 */
export function aiCostBasisView(basis: AiProviderCostBasisDto | null | undefined): AiCostBasisView | null {
  if (!basis) return null;
  return {
    basis: basis.basis,
    measuredDays: basis.measuredDays,
    totalDays: basis.measuredDays + basis.estimatedDays,
    cartesiaCredits: basis.cartesiaCredits,
    tone: basis.basis !== "measured" && (basis.syncStatus === "error" || basis.syncStatus === "disabled") ? "warning" : "neutral",
  };
}

// ── period cards ─────────────────────────────────────────────────────────────

export type InsightsSourceKey = "billing" | "users" | "workspaces" | "meetings" | "snapshot";

export interface PeriodSources {
  billing?: BillingInsightsDto | null;
  users?: UsersInsightsDto | null;
  workspaces?: WorkspacesInsightsDto | null;
  meetings?: MeetingsInsightsDto | null;
}

export interface PeriodCardSpec {
  id: string;
  label: string;
  source: Exclude<InsightsSourceKey, "snapshot">;
  /** The unit to fall back on when the metric is unavailable. */
  unit: InsightsUnit;
}

/** The ten period cards, in the mock's order: money and growth first, then usage and cost. */
export const PERIOD_CARDS: readonly PeriodCardSpec[] = [
  { id: "revenue", label: "Revenue", source: "billing", unit: "money" },
  { id: "payments", label: "Payments", source: "billing", unit: "count" },
  { id: "newSubscriptions", label: "New subscriptions", source: "billing", unit: "count" },
  { id: "cancelledSubscriptions", label: "Cancelled", source: "billing", unit: "count" },
  { id: "newUsers", label: "New users", source: "users", unit: "count" },
  { id: "meetingsHeld", label: "Meetings held", source: "meetings", unit: "count" },
  { id: "hoursTranslated", label: "Hours translated", source: "meetings", unit: "hours" },
  { id: "creditsConsumed", label: "Credits consumed", source: "billing", unit: "credits" },
  { id: "aiProviderCost", label: "AI provider cost", source: "billing", unit: "money" },
  { id: "grossMargin", label: "Revenue minus AI cost", source: "billing", unit: "money" },
];

/** Labels for every period metric the contract names, cards or not — used by the export. */
export const METRIC_LABELS: Record<string, string> = {
  revenue: "Revenue",
  payments: "Payments",
  failedPayments: "Failed payments",
  newSubscriptions: "New subscriptions",
  cancelledSubscriptions: "Cancelled subscriptions",
  creditsConsumed: "Credits consumed",
  overageCredits: "Overage credits",
  aiProviderCost: "AI provider cost",
  grossMargin: "Revenue minus AI cost",
  revenuePerPayment: "Revenue per payment",
  newUsers: "New users",
  activeUsers: "Active users",
  newWorkspaces: "New workspaces",
  meetingsHeld: "Meetings held",
  hoursTranslated: "Hours translated",
};

export function findMetric(
  source: { metrics?: InsightsMetric[] | null } | null | undefined,
  id: string,
): InsightsMetric | null {
  return source?.metrics?.find((metric) => metric.id === id) ?? null;
}

export interface PeriodCardView {
  id: string;
  label: string;
  available: boolean;
  metric: InsightsMetric | null;
  value: string;
  previous: string;
  delta: InsightsDelta;
  deltaTone: DeltaTone;
  valueTone: ValueTone;
  note: string | null;
}

export function periodCardView(spec: PeriodCardSpec, sources: PeriodSources, t?: InsightsTranslator): PeriodCardView {
  const source = sources[spec.source];
  const metric = findMetric(source, spec.id);
  if (!metric) {
    return {
      id: spec.id,
      label: spec.label,
      available: false,
      metric: null,
      value: "—",
      previous: "—",
      delta: { kind: "none" },
      deltaTone: "neutral",
      valueTone: "neutral",
      note: say(t, "common.notAvailable", NOT_AVAILABLE_NOTE),
    };
  }
  const delta = computeDelta(metric.value, metric.previous);
  let note = metric.note;
  if (spec.id === "payments") {
    const failed = findMetric(source, "failedPayments");
    if (failed?.value != null) {
      const failedNote = say(t, "periodCards.failedCount", `${formatCount(failed.value)} failed`, { count: failed.value });
      note = note ? `${failedNote} · ${note}` : failedNote;
    }
  }
  return {
    id: spec.id,
    label: spec.label,
    available: true,
    metric,
    value: formatInsightValue(metric.value, metric.unit),
    previous: formatInsightValue(metric.previous, metric.unit),
    delta,
    deltaTone: deltaTone(delta, metric.higherIsBetter),
    valueTone: valueTone(spec.id, metric.value),
    note,
  };
}

// ── export ───────────────────────────────────────────────────────────────────

export const INSIGHTS_CSV_HEADER = ["Metric", "This period", "Previous period", "Change", "Unit"] as const;

const CSV_UNIT: Record<InsightsUnit, string> = {
  money: "VND",
  count: "count",
  credits: "credits",
  hours: "hours",
  percent: "percent",
};

/**
 * One row per period metric: the ten cards first, in their order, then every other metric the
 * sources returned. A card whose source is unavailable is still a row, with empty figures — a
 * spreadsheet with a missing row reads as "this metric does not exist", not "not yet".
 */
export function insightsCsvRows(sources: PeriodSources): (string | number)[][] {
  const rows: (string | number)[][] = [[...INSIGHTS_CSV_HEADER]];
  const seen = new Set<string>();
  const row = (label: string, metric: InsightsMetric | null, unit: InsightsUnit) => [
    label,
    metric?.value ?? "",
    metric?.previous ?? "",
    metric ? deltaCsv(computeDelta(metric.value, metric.previous)) : "",
    CSV_UNIT[metric?.unit ?? unit] ?? metric?.unit ?? unit,
  ];

  for (const spec of PERIOD_CARDS) {
    seen.add(spec.id);
    rows.push(row(spec.label, findMetric(sources[spec.source], spec.id), spec.unit));
  }
  for (const key of ["billing", "users", "workspaces", "meetings"] as const) {
    for (const metric of sources[key]?.metrics ?? []) {
      if (seen.has(metric.id)) continue;
      seen.add(metric.id);
      rows.push(row(METRIC_LABELS[metric.id] ?? metric.id, metric, metric.unit));
    }
  }
  return rows;
}

export function insightsCsv(sources: PeriodSources): string {
  return toCsv(insightsCsvRows(sources));
}

// ── needs attention ──────────────────────────────────────────────────────────

export interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  tag: string;
  tone: "danger" | "warning" | "success";
  href: string | null;
}

export interface AttentionInputs {
  /** Undefined = the snapshot did not answer. */
  snapshot?: BillingSnapshotDto | null;
  /** Workspaces an admin has suspended (workspace directory `total`). Undefined = unknown. */
  suspendedWorkspaces?: number;
  /** Dead-lettered outbox events, newest first. Undefined = unknown. */
  deadLetters?: { eventType: string; attemptCount: number }[];
  /** True when the dead-letter list hit its fetch limit, so the count is a floor. */
  deadLettersCapped?: boolean;
  /**
   * The existing 24h usage alerts, used when the snapshot's `highUsageAlerts` is unavailable.
   * Undefined = unknown.
   */
  usageAlerts?: { workspaceId: string; workspaceName: string | null; consumedCreditsIn24h: number; reason?: string }[];
  /** Sales leads in status "new". Undefined = unknown. */
  newSalesLeads?: number;
  /** The System Health read. Undefined = unknown. */
  health?: {
    monitoringAvailable: boolean;
    targets: { job: string; instance: string; isUp: boolean }[];
    alerts: { name: string; severity: string; state: string; summary: string | null }[];
  };
  links: {
    health: string | null;
    suspendedWorkspaces: string | null;
    deadLetters: string | null;
    newSalesLeads: string | null;
    subscriptions: string | null;
    workspace: (workspaceId: string) => string | null;
  };
}

export interface AttentionResult {
  items: AttentionItem[];
  /** Names of the inputs that could not be read, for an honest empty state. */
  unavailable: string[];
}

const plural = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

/**
 * What an operator should act on today, most severe first. Every row comes from a live figure;
 * a source that did not answer adds nothing and is named in `unavailable` instead, so "nothing
 * needs attention" is only ever said when every source actually said so.
 */
export function assembleNeedsAttention(input: AttentionInputs, t?: InsightsTranslator): AttentionResult {
  const items: AttentionItem[] = [];
  const unavailable: string[] = [];
  const { snapshot, links } = input;

  // Monitoring that could not be read is not an outage — it is a source we could not ask.
  if (!input.health || !input.health.monitoringAvailable) {
    unavailable.push(say(t, "common.systemHealth", "system health"));
  } else {
    const down = input.health.targets.filter((target) => !target.isUp);
    if (down.length > 0) {
      items.push({
        key: "targets-down",
        title: say(t, "needsAttention.targetsDown", `${plural(down.length, "service", "services")} not answering`, {
          count: down.length,
        }),
        detail: down.slice(0, 3).map((target) => target.job).join(", ") + (down.length > 3 ? ", …" : ""),
        tag: say(t, "needsAttention.tagHealth", "Health"),
        tone: "danger",
        href: links.health,
      });
    }
    for (const alert of input.health.alerts.filter((a) => a.state.toLowerCase() === "firing")) {
      items.push({
        key: `alert-${alert.name}`,
        title: say(t, "needsAttention.alertFiring", `Alert firing: ${alert.name}`, { name: alert.name }),
        detail: alert.summary ?? say(t, "needsAttention.severity", `Severity ${alert.severity}`, { severity: alert.severity }),
        tag: say(t, "needsAttention.tagHealth", "Health"),
        tone: alert.severity.toLowerCase() === "critical" ? "danger" : "warning",
        href: links.health,
      });
    }
  }

  if (snapshot) {
    const invoices = snapshot.outstandingInvoices;
    if (invoices && invoices.pastDueCount > 0) {
      // A past-due invoice always belongs to a workspace; a null name means it could not be looked up.
      const oldestWorkspace = invoices.oldestPastDueDays != null ? workspaceLabel(invoices.oldestPastDueWorkspace, t) : null;
      const oldestDays =
        invoices.oldestPastDueDays != null
          ? say(t, "needsAttention.days", plural(invoices.oldestPastDueDays, "day", "days"), { count: invoices.oldestPastDueDays })
          : null;
      items.push({
        key: "invoices-past-due",
        title: say(t, "needsAttention.invoicesPastDue", `${plural(invoices.pastDueCount, "invoice", "invoices")} past due`, {
          count: invoices.pastDueCount,
        }),
        detail:
          oldestWorkspace !== null && oldestDays !== null
            ? say(t, "needsAttention.oldest", `Oldest: ${oldestWorkspace} · ${oldestDays}`, {
                workspace: oldestWorkspace,
                days: oldestDays,
              })
            : outstandingAmountText(invoices, t),
        tag: say(t, "needsAttention.tagPastDue", "Past due"),
        tone: "danger",
        href: null,
      });
    } else if (invoices && invoices.count > 0) {
      const amount = outstandingAmountText(invoices, t);
      items.push({
        key: "invoices-open",
        title: say(t, "needsAttention.invoicesAwaiting", `${plural(invoices.count, "invoice", "invoices")} awaiting payment`, {
          count: invoices.count,
        }),
        detail: say(t, "needsAttention.noneOfPastDue", `${amount}, none past due`, { amount }),
        tag: say(t, "needsAttention.tagInvoices", "Invoices"),
        tone: "warning",
        href: null,
      });
    }
    if (snapshot.pastDue > 0) {
      items.push({
        key: "subscriptions-past-due",
        title: say(t, "needsAttention.subscriptionsPastDue", `${plural(snapshot.pastDue, "subscription", "subscriptions")} past due`, {
          count: snapshot.pastDue,
        }),
        detail: say(t, "needsAttention.subscriptionsPastDueDetail", "Payment failed or overdue on renewal"),
        tag: say(t, "needsAttention.tagPastDue", "Past due"),
        tone: "danger",
        href: null,
      });
    }
    if (snapshot.suspended > 0) {
      items.push({
        key: "subscriptions-suspended",
        title: say(
          t,
          "needsAttention.subscriptionsSuspended",
          `${plural(snapshot.suspended, "subscription", "subscriptions")} suspended`,
          { count: snapshot.suspended },
        ),
        detail: say(t, "needsAttention.subscriptionsSuspendedDetail", "AI services are paused until the subscription is resumed"),
        tag: say(t, "needsAttention.tagSuspended", "Suspended"),
        tone: "danger",
        href: links.subscriptions,
      });
    }
  } else {
    unavailable.push(say(t, "common.invoicesAndSubscriptions", "invoices and subscriptions"));
  }

  if (input.suspendedWorkspaces === undefined) {
    unavailable.push(say(t, "common.suspendedWorkspaces", "suspended workspaces"));
  } else if (input.suspendedWorkspaces > 0) {
    // The old Overview's banner, folded in. Its point still stands: nothing lifts a suspension on
    // its own, so it stays on this list until somebody acts.
    items.push({
      key: "workspaces-suspended",
      title: say(t, "needsAttention.workspacesSuspended", `${plural(input.suspendedWorkspaces, "workspace", "workspaces")} suspended`, {
        count: input.suspendedWorkspaces,
      }),
      detail: say(t, "needsAttention.workspacesSuspendedDetail", "Each stays closed until an admin reactivates it"),
      tag: say(t, "needsAttention.tagSuspended", "Suspended"),
      tone: "danger",
      href: links.suspendedWorkspaces,
    });
  }

  if (input.deadLetters === undefined) {
    unavailable.push(say(t, "common.eventOutbox", "event outbox"));
  } else if (input.deadLetters.length > 0) {
    const count = input.deadLetters.length;
    const newest = input.deadLetters[0];
    const title = input.deadLettersCapped
      ? say(t, "needsAttention.deadLetterEventsCapped", `${formatCount(count)}+ dead-letter events`, { count })
      : say(t, "needsAttention.deadLetterEvents", `${formatCount(count)} dead-letter ${count === 1 ? "event" : "events"}`, { count });
    const attempts = say(t, "needsAttention.attempts", plural(newest.attemptCount, "attempt", "attempts"), {
      count: newest.attemptCount,
    });
    items.push({
      key: "dead-letters",
      title,
      detail: say(t, "needsAttention.attemptsDetail", `${newest.eventType} · ${plural(newest.attemptCount, "attempt", "attempts")}`, {
        eventType: newest.eventType,
        attempts,
      }),
      tag: say(t, "needsAttention.tagOutbox", "Outbox"),
      tone: "warning",
      href: links.deadLetters,
    });
  }

  const highUsage = snapshot?.highUsageAlerts
    ? snapshot.highUsageAlerts.map((alert) => ({
        workspaceId: alert.workspaceId,
        workspaceName: alert.workspaceName,
        credits: alert.credits24h,
        reason: null as string | null,
      }))
    : input.usageAlerts?.map((alert) => ({
        workspaceId: alert.workspaceId,
        workspaceName: alert.workspaceName,
        credits: alert.consumedCreditsIn24h,
        reason: alert.reason ?? null,
      }));
  if (highUsage === undefined) {
    unavailable.push(say(t, "common.usageAlerts", "usage alerts"));
  } else {
    for (const alert of highUsage) {
      const workspace = workspaceLabel(alert.workspaceName, t);
      items.push({
        key: `usage-${alert.workspaceId}`,
        title: say(t, "needsAttention.highUsageTitle", `High usage: ${workspace}`, { workspace }),
        detail: [
          say(t, "needsAttention.highUsageCredits", `${formatCount(alert.credits)} credits in 24h`, { credits: formatCount(alert.credits) }),
          alert.reason,
        ]
          .filter(Boolean)
          .join(" · "),
        tag: say(t, "needsAttention.tagUsage", "Usage"),
        tone: "warning",
        href: links.workspace(alert.workspaceId),
      });
    }
  }

  if (input.newSalesLeads === undefined) {
    unavailable.push(say(t, "common.salesLeads", "sales leads"));
  } else if (input.newSalesLeads > 0) {
    items.push({
      key: "sales-leads",
      title: say(t, "needsAttention.newSalesLeads", `${plural(input.newSalesLeads, "new sales lead", "new sales leads")}`, {
        count: input.newSalesLeads,
      }),
      detail: say(t, "needsAttention.salesLeadsDetail", "Waiting for a reply"),
      tag: say(t, "needsAttention.tagLeads", "Leads"),
      tone: "success",
      href: links.newSalesLeads,
    });
  }

  const rank = { danger: 0, warning: 1, success: 2 } as const;
  items.sort((a, b) => rank[a.tone] - rank[b.tone]);
  return { items, unavailable };
}
