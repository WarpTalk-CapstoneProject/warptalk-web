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

export function workspaceLabel(name: string | null | undefined): string {
  return name?.trim() || UNKNOWN_WORKSPACE;
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

export function deltaText(delta: InsightsDelta): string {
  switch (delta.kind) {
    case "none":
      return "no figure last period";
    case "flat":
      return "no change";
    case "fromZero":
      return `${delta.direction === "up" ? "▲" : "▼"} from 0`;
    case "change":
      return `${delta.direction === "up" ? "▲" : "▼"} ${delta.percent.toFixed(1)}%`;
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
): string {
  return joinNotes(
    snapshot.revenueToday === null && !snapshot.revenueTodayNote ? "today cannot be totalled" : snapshot.revenueTodayNote,
    `yesterday ${formatInsightValue(snapshot.revenueYesterday, "money")}`,
    snapshot.revenueYesterdayNote ? `yesterday ${snapshot.revenueYesterdayNote}` : null,
  ) as string;
}

export function mrrSub(snapshot: Pick<BillingSnapshotDto, "mrr" | "mrrNote">): string {
  return snapshot.mrrNote?.trim() || (snapshot.mrr === null ? "Cannot be totalled in VND" : "Monthly recurring revenue");
}

export function churnSub(churn: BillingSnapshotDto["churnRateMonth"]): string {
  return joinNotes(
    `${formatCount(churn.cancelled)} cancelled / ${formatCount(churn.atMonthStart)} at month start`,
    churn.rate === null ? "no rate without paying subscriptions at month start" : null,
  ) as string;
}

export function outstandingSub(invoices: BillingSnapshotDto["outstandingInvoices"]): string {
  return joinNotes(
    `${formatCount(invoices.count)} ${invoices.count === 1 ? "invoice" : "invoices"}`,
    `${formatCount(invoices.pastDueCount)} past due`,
    invoices.amountNote ?? (invoices.amount === null ? "amount cannot be totalled in VND" : null),
  ) as string;
}

/** "N,NNN ₫ outstanding", or what is known when the amount could not be totalled. */
function outstandingAmountText(invoices: BillingSnapshotDto["outstandingInvoices"]): string {
  return invoices.amount === null
    ? `Amount not totalled${invoices.amountNote ? ` (${invoices.amountNote})` : ""}`
    : `${formatInsightValue(invoices.amount, "money")} outstanding`;
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

export function periodCardView(spec: PeriodCardSpec, sources: PeriodSources): PeriodCardView {
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
      note: NOT_AVAILABLE_NOTE,
    };
  }
  const delta = computeDelta(metric.value, metric.previous);
  let note = metric.note;
  if (spec.id === "payments") {
    const failed = findMetric(source, "failedPayments");
    if (failed?.value != null) {
      const failedNote = `${formatCount(failed.value)} failed`;
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
export function assembleNeedsAttention(input: AttentionInputs): AttentionResult {
  const items: AttentionItem[] = [];
  const unavailable: string[] = [];
  const { snapshot, links } = input;

  // Monitoring that could not be read is not an outage — it is a source we could not ask.
  if (!input.health || !input.health.monitoringAvailable) {
    unavailable.push("system health");
  } else {
    const down = input.health.targets.filter((target) => !target.isUp);
    if (down.length > 0) {
      items.push({
        key: "targets-down",
        title: `${plural(down.length, "service", "services")} not answering`,
        detail: down.slice(0, 3).map((target) => target.job).join(", ") + (down.length > 3 ? ", …" : ""),
        tag: "Health",
        tone: "danger",
        href: links.health,
      });
    }
    for (const alert of input.health.alerts.filter((a) => a.state.toLowerCase() === "firing")) {
      items.push({
        key: `alert-${alert.name}`,
        title: `Alert firing: ${alert.name}`,
        detail: alert.summary ?? `Severity ${alert.severity}`,
        tag: "Health",
        tone: alert.severity.toLowerCase() === "critical" ? "danger" : "warning",
        href: links.health,
      });
    }
  }

  if (snapshot) {
    const invoices = snapshot.outstandingInvoices;
    if (invoices && invoices.pastDueCount > 0) {
      // A past-due invoice always belongs to a workspace; a null name means it could not be looked up.
      const oldest = invoices.oldestPastDueDays != null
        ? [workspaceLabel(invoices.oldestPastDueWorkspace), plural(invoices.oldestPastDueDays, "day", "days")]
        : [];
      items.push({
        key: "invoices-past-due",
        title: `${plural(invoices.pastDueCount, "invoice", "invoices")} past due`,
        detail: oldest.length ? `Oldest: ${oldest.join(" · ")}` : outstandingAmountText(invoices),
        tag: "Past due",
        tone: "danger",
        href: null,
      });
    } else if (invoices && invoices.count > 0) {
      items.push({
        key: "invoices-open",
        title: `${plural(invoices.count, "invoice", "invoices")} awaiting payment`,
        detail: `${outstandingAmountText(invoices)}, none past due`,
        tag: "Invoices",
        tone: "warning",
        href: null,
      });
    }
    if (snapshot.pastDue > 0) {
      items.push({
        key: "subscriptions-past-due",
        title: `${plural(snapshot.pastDue, "subscription", "subscriptions")} past due`,
        detail: "Payment failed or overdue on renewal",
        tag: "Past due",
        tone: "danger",
        href: null,
      });
    }
    if (snapshot.suspended > 0) {
      items.push({
        key: "subscriptions-suspended",
        title: `${plural(snapshot.suspended, "subscription", "subscriptions")} suspended`,
        detail: "AI services are paused until the subscription is resumed",
        tag: "Suspended",
        tone: "danger",
        href: links.subscriptions,
      });
    }
  } else {
    unavailable.push("invoices and subscriptions");
  }

  if (input.suspendedWorkspaces === undefined) {
    unavailable.push("suspended workspaces");
  } else if (input.suspendedWorkspaces > 0) {
    // The old Overview's banner, folded in. Its point still stands: nothing lifts a suspension on
    // its own, so it stays on this list until somebody acts.
    items.push({
      key: "workspaces-suspended",
      title: `${plural(input.suspendedWorkspaces, "workspace", "workspaces")} suspended`,
      detail: "Each stays closed until an admin reactivates it",
      tag: "Suspended",
      tone: "danger",
      href: links.suspendedWorkspaces,
    });
  }

  if (input.deadLetters === undefined) {
    unavailable.push("event outbox");
  } else if (input.deadLetters.length > 0) {
    const count = input.deadLetters.length;
    const newest = input.deadLetters[0];
    items.push({
      key: "dead-letters",
      title: `${input.deadLettersCapped ? `${formatCount(count)}+` : formatCount(count)} dead-letter ${count === 1 && !input.deadLettersCapped ? "event" : "events"}`,
      detail: `${newest.eventType} · ${plural(newest.attemptCount, "attempt", "attempts")}`,
      tag: "Outbox",
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
    unavailable.push("usage alerts");
  } else {
    for (const alert of highUsage) {
      items.push({
        key: `usage-${alert.workspaceId}`,
        title: `High usage: ${workspaceLabel(alert.workspaceName)}`,
        detail: [`${formatCount(alert.credits)} credits in 24h`, alert.reason].filter(Boolean).join(" · "),
        tag: "Usage",
        tone: "warning",
        href: links.workspace(alert.workspaceId),
      });
    }
  }

  if (input.newSalesLeads === undefined) {
    unavailable.push("sales leads");
  } else if (input.newSalesLeads > 0) {
    items.push({
      key: "sales-leads",
      title: `${plural(input.newSalesLeads, "new sales lead", "new sales leads")}`,
      detail: "Waiting for a reply",
      tag: "Leads",
      tone: "success",
      href: links.newSalesLeads,
    });
  }

  const rank = { danger: 0, warning: 1, success: 2 } as const;
  items.sort((a, b) => rank[a.tone] - rank[b.tone]);
  return { items, unavailable };
}
