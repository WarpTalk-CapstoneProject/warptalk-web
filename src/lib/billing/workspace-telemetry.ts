import { formatMoney } from "../format/currency.ts";

export type SupportedCurrency = "VND" | "USD" | "EUR" | "JPY" | "GBP" | string;

export interface CurrencyRateConfig {
  currency: SupportedCurrency;
  ratePerCredit: number;
  isCustom?: boolean;
}

/**
 * Platform default rates derived from Admin Master pricing config:
 * Default base: 1 credit = 100 VND.
 * Default FX rate: 1 USD ≈ 25,641 VND -> 1 credit ≈ $0.0039 USD.
 */
export const ADMIN_MASTER_DEFAULT_RATES: Record<string, number> = {
  USD: 0.0039, // $0.0039 per credit (~100 VND / 25,641)
  VND: 100,    // 1 credit = 100 VND
  EUR: 0.0036, // €0.0036 per credit
  JPY: 0.58,   // ¥0.58 per credit
  GBP: 0.0031, // £0.0031 per credit
};

export const DEFAULT_FX_RATE_USD_VND = 25641; // 1 USD ≈ 25,641 VND

export const DEFAULT_CURRENCY_CONFIG: CurrencyRateConfig = {
  currency: "USD",
  ratePerCredit: ADMIN_MASTER_DEFAULT_RATES.USD,
  isCustom: false,
};

export type TelemetryTimeframe = "day" | "month" | "quarter";

export interface TelemetryBucket {
  key: string;       // ISO or identifier (e.g. "2026-09-22", "2026-09", "2026-Q3")
  label: string;     // Short display label (e.g. "Sep 22", "Sep", "Q3")
  title?: string;    // Full tooltip title (e.g. "Tuesday, Sep 22, 2026")
  credits: number;
  cost: number;
  currency: string;
  meetings: number;
}

export interface MeetingEconomicsSummary {
  totalCredits: number;
  totalCost: number;
  completedMeetingsCount: number;
  avgCreditsPerMeeting: number;
  avgCostPerMeeting: number;
  activeMembersCount: number;
  currency: string;
}

/**
 * Formats a credit count alongside its fiat equivalent, with dual-currency conversion (USD <-> VND).
 * Example: `5,500 cr (≈ 21.45 USD · 550,000 VND)`
 */
export function formatCreditWithFiat(
  credits: number,
  config: CurrencyRateConfig = DEFAULT_CURRENCY_CONFIG,
  fxRateUsdVnd: number = DEFAULT_FX_RATE_USD_VND,
): string {
  const formattedCredits = `${credits.toLocaleString()} cr`;
  const cost = credits * config.ratePerCredit;
  const formattedCost = formatMoney(cost, config.currency);

  // Dual conversion for USD / VND context
  if (config.currency === "USD") {
    const vndEquivalent = Math.round(cost * fxRateUsdVnd);
    return `${formattedCredits} (≈ ${formattedCost} · ${formatMoney(vndEquivalent, "VND")})`;
  }
  if (config.currency === "VND") {
    const usdEquivalent = cost / fxRateUsdVnd;
    return `${formattedCredits} (≈ ${formattedCost} · ${formatMoney(usdEquivalent, "USD")})`;
  }

  return `${formattedCredits} (≈ ${formattedCost})`;
}

/**
 * Calculates meeting unit economics (average burn per meeting).
 */
export function calculateMeetingEconomics(
  totalCreditsConsumed: number,
  completedMeetingsCount: number,
  activeMembersCount: number,
  config: CurrencyRateConfig = DEFAULT_CURRENCY_CONFIG,
): MeetingEconomicsSummary {
  const safeMeetingCount = Math.max(0, completedMeetingsCount);
  const totalCost = totalCreditsConsumed * config.ratePerCredit;

  const avgCreditsPerMeeting =
    safeMeetingCount > 0 ? Math.round(totalCreditsConsumed / safeMeetingCount) : 0;
  const avgCostPerMeeting = avgCreditsPerMeeting * config.ratePerCredit;

  return {
    totalCredits: totalCreditsConsumed,
    totalCost,
    completedMeetingsCount: safeMeetingCount,
    avgCreditsPerMeeting,
    avgCostPerMeeting,
    activeMembersCount: Math.max(0, activeMembersCount),
    currency: config.currency,
  };
}

/**
 * Generates aggregated buckets for Day, Month, or Quarter based on the chosen currency config.
 */
export function aggregateTelemetryBuckets(
  timeframe: TelemetryTimeframe,
  rawDays: { date: string; credits: number; meetings: number }[],
  config: CurrencyRateConfig = DEFAULT_CURRENCY_CONFIG,
): TelemetryBucket[] {
  if (timeframe === "day") {
    return rawDays.map((d) => ({
      key: d.date,
      label: formatShortDate(d.date),
      title: d.date,
      credits: d.credits,
      cost: d.credits * config.ratePerCredit,
      currency: config.currency,
      meetings: d.meetings,
    }));
  }

  if (timeframe === "month") {
    const map = new Map<string, { credits: number; meetings: number }>();
    for (const d of rawDays) {
      const monthKey = d.date.substring(0, 7); // "YYYY-MM"
      const current = map.get(monthKey) ?? { credits: 0, meetings: 0 };
      current.credits += d.credits;
      current.meetings += d.meetings;
      map.set(monthKey, current);
    }
    return Array.from(map.entries()).map(([key, val]) => ({
      key,
      label: formatMonthLabel(key),
      title: key,
      credits: val.credits,
      cost: val.credits * config.ratePerCredit,
      currency: config.currency,
      meetings: val.meetings,
    }));
  }

  // Quarter aggregation
  const map = new Map<string, { credits: number; meetings: number }>();
  for (const d of rawDays) {
    const [yearStr, monthStr] = d.date.split("-");
    const month = parseInt(monthStr, 10);
    const quarter = Math.ceil(month / 3);
    const qKey = `${yearStr}-Q${quarter}`;
    const current = map.get(qKey) ?? { credits: 0, meetings: 0 };
    current.credits += d.credits;
    current.meetings += d.meetings;
    map.set(qKey, current);
  }
  return Array.from(map.entries()).map(([key, val]) => ({
    key,
    label: key.replace(/^\d+-/, ""),
    title: key,
    credits: val.credits,
    cost: val.credits * config.ratePerCredit,
    currency: config.currency,
    meetings: val.meetings,
  }));
}

function formatShortDate(isoDate: string): string {
  try {
    const parts = isoDate.split("-");
    if (parts.length < 3) return isoDate;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  } catch {
    return isoDate;
  }
}

function formatMonthLabel(yearMonth: string): string {
  try {
    const [year, month] = yearMonth.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  } catch {
    return yearMonth;
  }
}
