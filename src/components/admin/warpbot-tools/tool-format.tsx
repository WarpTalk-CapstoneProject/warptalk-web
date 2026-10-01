"use client";

/**
 * What both tabs of the admin WarpBot tools page share: number formats, a tool's display name,
 * the source chip and the health badge. Colours are tokens only.
 */

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { humaniseToolName, WARPBOT_TOOL_COPY } from "@/lib/assistant/warpbot-tools-catalog";
import type { ToolHealth } from "@/lib/admin/warpbot-tools-usage";
import { cn } from "@/lib/utils";
import type { ToolCallSource } from "@/types/admin-warpbot-tools";

const LOCALE = "en-US";
const countFormatter = new Intl.NumberFormat(LOCALE);
const DATE_FORMATTER = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric" });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatCount = (value: number) => countFormatter.format(value);

/** A fraction as "96.4%"; null as "—". */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  const percent = rate * 100;
  return `${percent >= 99.95 || percent === 0 ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

/** "820 ms", "1.4 s"; null as "—". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export function formatDate(iso: string | null | undefined): string {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? DATE_FORMATTER.format(new Date(time)) : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? DATE_TIME_FORMATTER.format(new Date(time)) : "—";
}

/** The three sources as the server spells them, each with its chart colour. */
export const SOURCE_KEYS = ["builtin", "web_search", "plugin"] as const;
export type KnownSource = (typeof SOURCE_KEYS)[number];

export const SOURCE_COLORS: Record<KnownSource, string> = {
  builtin: "var(--viz-1)",
  web_search: "var(--viz-2)",
  plugin: "var(--viz-3)",
};

export function knownSource(source: ToolCallSource | string): KnownSource {
  return source === "plugin" || source === "web_search" ? source : "builtin";
}

/** Built-in tools take their copy name; web search its own word; a plugin tool its function name. */
export function toolDisplayName(
  row: { tool: string; source: ToolCallSource | string },
  webSearchLabel: string,
): string {
  const source = knownSource(row.source);
  if (source === "web_search") return webSearchLabel;
  if (source === "builtin") {
    return Object.prototype.hasOwnProperty.call(WARPBOT_TOOL_COPY, row.tool)
      ? WARPBOT_TOOL_COPY[row.tool].displayName
      : humaniseToolName(row.tool);
  }
  return row.tool;
}

export function SourceChip({ source }: { source: ToolCallSource | string }) {
  const t = useTranslations("adminPlugins.warpbotTools.source");
  const known = knownSource(source);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
      <i aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: SOURCE_COLORS[known] }} />
      {t(known === "web_search" ? "webSearch" : known)}
    </span>
  );
}

const HEALTH_CLASS: Record<ToolHealth, string> = {
  healthy: "bg-success/15 text-success",
  degraded: "bg-warning/15 text-warning",
  failing: "bg-destructive/10 text-destructive",
  notEnoughCalls: "border border-hairline bg-surface-2 text-ink-muted",
};

export function HealthBadge({ health }: { health: ToolHealth }) {
  const t = useTranslations("adminPlugins.warpbotTools.health");
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold", HEALTH_CLASS[health])}>
      {t(health)}
    </span>
  );
}

export type StatusTone = "on" | "off" | "unknown";

const STATUS_CLASS: Record<StatusTone, string> = {
  on: "bg-success/15 text-success",
  off: "border border-hairline bg-surface-2 text-ink-muted",
  unknown: "bg-warning/15 text-warning",
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold", STATUS_CLASS[tone])}>
      {children}
    </span>
  );
}

/** A titled, bordered card that holds one chart or list (the insights page's panel). */
export function UsagePanel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-hairline bg-surface-1 p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {aside ? <div className="text-[11px] text-ink-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}
