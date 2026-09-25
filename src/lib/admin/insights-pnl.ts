/**
 * The profit-and-loss section of Insights: what it derives from the server's figures, kept out of the
 * components so it can be tested under node --test.
 *
 * Two figures are combined across sources here, both of the same period and time zone:
 *   cost per meeting-hour = AI provider cost (billing P&L) ÷ hours translated (translation-room)
 * Everything else is the server's own number. The null rule holds: a figure that cannot be computed is
 * null with a reason, never 0.
 */

import type {
  FxRateStatusDto,
  InsightsMetric,
  MeetingsInsightsDto,
  PnlPeriodDto,
  ProfitAndLossDto,
} from "../../types/admin-insights.ts";
import { computeDelta, deltaTone, findMetric, formatInsightValue, type DeltaTone, type InsightsDelta } from "./insights-metrics.ts";

// ── providers ────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  cartesia: "Cartesia",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  google: "Google",
  unknown: "Unattributed",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Colour follows the provider, never its rank: a period where Cartesia costs more than OpenAI must not
 * swap their colours. Known providers have fixed slots; anything else takes the next free slot in
 * name order, so the same data always paints the same way.
 */
const FIXED_PROVIDER_SLOTS: Record<string, number> = { openai: 1, cartesia: 2 };
const SLOTS = 5;

export function providerColors(providers: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  const used = new Set<number>();
  for (const provider of providers) {
    const slot = FIXED_PROVIDER_SLOTS[provider];
    if (slot) {
      colors[provider] = `var(--viz-${slot})`;
      used.add(slot);
    }
  }
  let next = 1;
  for (const provider of [...providers].sort()) {
    if (colors[provider]) continue;
    while (used.has(next) && next <= SLOTS) next++;
    colors[provider] = next <= SLOTS ? `var(--viz-${next})` : "var(--usage-service-other)";
    used.add(next);
  }
  return colors;
}

export type CostCurrency = "VND" | "USD";

/**
 * One series per provider over the period's days, largest total cost first. A day's VND figure is null
 * when that day had no USD→VND rate — a gap, not a 0.
 */
export function providerCostSeries(
  days: PnlPeriodDto[],
  currency: CostCurrency,
): { key: string; label: string; values: (number | null)[]; total: number }[] {
  const providers = [...new Set(days.flatMap((day) => day.providers.map((p) => p.provider)))];
  return providers
    .map((provider) => {
      const values = days.map((day) => {
        const row = day.providers.find((p) => p.provider === provider);
        if (!row) return 0;
        return currency === "USD" ? row.costUsd : row.costVnd;
      });
      return {
        key: provider,
        label: providerLabel(provider),
        values,
        total: values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      };
    })
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

// ── derived metric ───────────────────────────────────────────────────────────

export interface DerivedFigure {
  value: number | null;
  note: string | null;
}

/** AI cost ÷ hours translated, in VND per hour. */
export function costPerMeetingHour(aiCost: number | null | undefined, hours: number | null | undefined): DerivedFigure {
  if (aiCost === null || aiCost === undefined) return { value: null, note: "AI provider cost is unavailable" };
  if (hours === null || hours === undefined) return { value: null, note: "hours translated are unavailable" };
  if (hours <= 0) return { value: null, note: "no meeting hours in the period" };
  return { value: Math.round(aiCost / hours), note: "AI provider cost ÷ hours translated" };
}

/** Per local day, joined on the day key both servers bucket by (the same tz). */
export function costPerMeetingHourByDay(days: PnlPeriodDto[], meetingsByDay: MeetingsInsightsDto["meetingsByDay"] | undefined): (number | null)[] {
  const hours = new Map((meetingsByDay ?? []).map((row) => [row.date, row.hours]));
  return days.map((day) => costPerMeetingHour(day.aiCost, hours.get(day.key)).value);
}

// ── cards ────────────────────────────────────────────────────────────────────

export interface PnlCardView {
  id: string;
  label: string;
  value: string;
  previous: string;
  delta: InsightsDelta;
  deltaTone: DeltaTone;
  tone: "success" | "warning" | "danger" | "neutral";
  note: string | null;
  available: boolean;
}

const PNL_CARDS: { id: string; label: string }[] = [
  { id: "revenue", label: "Revenue" },
  { id: "aiProviderCost", label: "AI provider cost" },
  { id: "grossMargin", label: "Gross margin" },
  { id: "grossMarginPercent", label: "Gross margin %" },
  { id: "arpa", label: "Revenue per active workspace" },
  { id: "costPerMeetingHour", label: "AI cost per meeting-hour" },
];

function toneOf(id: string, value: number | null): PnlCardView["tone"] {
  if (value === null) return "neutral";
  if (id === "revenue") return "success";
  if (id === "aiProviderCost" || id === "costPerMeetingHour") return "warning";
  if (id === "grossMargin" || id === "grossMarginPercent") return value < 0 ? "danger" : "success";
  return "neutral";
}

function view(id: string, label: string, metric: InsightsMetric | null): PnlCardView {
  if (!metric) {
    return {
      id, label, value: "—", previous: "—", delta: { kind: "none" }, deltaTone: "neutral", tone: "neutral",
      note: "Not available yet", available: false,
    };
  }
  const delta = computeDelta(metric.value, metric.previous);
  return {
    id,
    label,
    value: formatInsightValue(metric.value, metric.unit),
    previous: formatInsightValue(metric.previous, metric.unit),
    delta,
    deltaTone: deltaTone(delta, metric.higherIsBetter),
    tone: toneOf(id, metric.value),
    note: metric.note,
    available: true,
  };
}

/**
 * The six P&L cards. Cost per meeting-hour is derived here from two sources of the same period and
 * tz; it is "unavailable" when either source is, and null with a reason when either figure is.
 */
export function pnlCards(pnl: ProfitAndLossDto | undefined, meetings: MeetingsInsightsDto | undefined): PnlCardView[] {
  return PNL_CARDS.map(({ id, label }) => {
    if (id !== "costPerMeetingHour") return view(id, label, findMetric(pnl, id));
    const cost = findMetric(pnl, "aiProviderCost");
    const hours = findMetric(meetings, "hoursTranslated");
    if (!cost || !hours) return view(id, label, null);
    const current = costPerMeetingHour(cost.value, hours.value);
    const previous = costPerMeetingHour(cost.previous, hours.previous);
    return view(id, label, {
      id,
      value: current.value,
      previous: previous.value,
      unit: "money",
      higherIsBetter: false,
      note: current.value === null ? current.note : "AI provider cost ÷ hours translated",
    });
  });
}

// ── FX ───────────────────────────────────────────────────────────────────────

export interface FxLineView {
  rate: string;
  source: string;
  asOf: string | null;
  tone: "neutral" | "warning";
  warning: string | null;
}

const vndPerUsd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "25,989.9 VND/USD · Stripe FX quote · as of Sep 24, 10:00". Amber, with the server's warning, when stale. */
export function fxLineView(fx: FxRateStatusDto | null | undefined, formatInstant: (iso: string) => string): FxLineView | null {
  if (!fx) return null;
  return {
    rate: fx.rate === null ? "No rate" : `${vndPerUsd.format(fx.rate)} VND/USD`,
    source: fx.mode === "manual" ? "Manual override" : fx.sourceLabel.charAt(0).toUpperCase() + fx.sourceLabel.slice(1),
    asOf: fx.asOf ? formatInstant(fx.asOf) : null,
    tone: fx.stale || fx.rate === null ? "warning" : "neutral",
    warning: fx.warning,
  };
}
