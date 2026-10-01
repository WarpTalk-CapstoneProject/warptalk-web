import { formatDurationMs } from "@/lib/workspace/insights/tools-metrics";

/**
 * Locale-aware formatting for the Tools tab. Day keys are calendar dates (YYYY-MM-DD in the page's
 * time zone), so they are labelled as UTC dates: the key is the day, no instant is re-bucketed.
 */

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function keyDate(key: string): Date | null {
  const match = DAY_KEY.exec(key);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

export function toolsFormatters(locale: string, timeZone: string) {
  const count = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const dayLabel = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const dayTitle = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone });

  return {
    count: (value: number) => count.format(value),
    /** 0–100 → "96%". */
    percent: (value: number) => `${percent.format(value)}%`,
    dayLabel: (key: string) => {
      const date = keyDate(key);
      return date ? dayLabel.format(date) : key;
    },
    dayTitle: (key: string) => {
      const date = keyDate(key);
      return date ? dayTitle.format(date) : key;
    },
    dateTime: (iso: string) => {
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? dateTime.format(new Date(ms)) : iso;
    },
    /** A calendar date in the page's zone: "Oct 1, 2026". */
    date: (value: Date | string) => {
      const ms = value instanceof Date ? value.getTime() : Date.parse(value);
      return Number.isFinite(ms) ? date.format(new Date(ms)) : String(value);
    },
    /** A median call time: "850 ms", "1.2 s"; "—" when not measured. */
    duration: (ms: number | null | undefined) => formatDurationMs(ms, locale) ?? "—",
    /** "4 min ago", measured against `nowMs` (passed in so rendering stays pure). */
    ago: (iso: string, nowMs: number) => {
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) return iso;
      const seconds = Math.round((ms - nowMs) / 1000);
      const abs = Math.abs(seconds);
      if (abs < 60) return relative.format(0, "minute");
      if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
      if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
      if (abs < 30 * 86_400) return relative.format(Math.round(seconds / 86_400), "day");
      return dateTime.format(new Date(ms));
    },
  };
}

export type ToolsFormatters = ReturnType<typeof toolsFormatters>;
