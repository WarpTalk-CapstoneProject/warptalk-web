"use client";

/**
 * Credits consumed and topped up, by month, for one year.
 *
 * The dashboard used to render `components/admin/UsageChart` here. That component is built for
 * the platform admin: hardcoded slate hex values that ignore the workspace theme, a year picker
 * and a month/quarter/year grouping control, a legend, and — because every failure from the
 * usage API was a 400 — a permanent "Failed to load chart data" on any workspace without a
 * subscription. Four controls above a chart nobody could read.
 *
 * This draws the same server data in the workspace's own tokens, with no controls: the current
 * year, consumed against topped up. A year of monthly bars is the shape that answers "is this
 * workspace's usage growing", which is the only trend question a twelve-point series can honestly
 * answer.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthlyUsagePoint } from "@/types/billing";

/**
 * Theme variables, and only ones that are actually declared on `:root`.
 *
 * `--ink-subtle` is NOT: the ink scale is a Tailwind `@theme` token (`--color-ink-subtle`) that
 * exists for the class `text-ink-subtle` and never reaches the custom-property table these SVG
 * attributes read from. `fill="var(--ink-subtle)"` therefore resolved to nothing and the axis
 * labels rendered black on a black chart — present in the DOM, invisible on screen.
 */
const CONSUMED = "var(--primary)";
const TOPPED_UP = "var(--hairline-tertiary)";
const AXIS = "var(--muted-foreground)";
const GRID = "var(--hairline)";

export function UsageTrend({
  year,
  monthlyData,
  emptyMessage,
}: {
  year: number;
  monthlyData: MonthlyUsagePoint[];
  /** Shown instead of the axes when there is nothing to plot — an empty grid is not a chart. */
  emptyMessage?: string;
}) {
  const data = monthlyData.map((point) => ({
    label: point.monthName.slice(0, 3),
    consumed: point.consumedCredits,
    toppedUp: point.topUpCredits,
  }));
  const hasAnything = data.some((point) => point.consumed > 0 || point.toppedUp > 0);

  if (!hasAnything) {
    return (
      <p className="flex h-[220px] items-center justify-center text-[12px] text-ink-muted">
        {emptyMessage ?? `No credits used or added in ${year}.`}
      </p>
    );
  }

  return (
    <>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3}>
            <CartesianGrid strokeDasharray="2 3" vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: AXIS }}
              dy={6}
            />
            {/* No `width` and no negative left margin. Both together made recharts lay the axis
                out in a strip narrower than its own labels, and it dropped every tick text
                silently — the gridlines drew, the numbers beside them did not. */}
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: AXIS }}
              tickFormatter={(value: number) =>
                value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`
              }
            />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TrendTooltip />} />
            {/* isAnimationActive={false} is load-bearing, not a preference. recharts 3.8's bar
                grow-in never finishes under this React version: the bars are laid out against the
                animation's starting scale and stay there, so a 14,200-credit month drew as three
                pixels beside a Y axis that correctly read 20k. Verified against the same chart
                with animation off — the heights then match the values exactly.

                It is also the right default for a panel somebody opens to read a number. */}
            <Bar
              dataKey="consumed"
              fill={CONSUMED}
              radius={[2, 2, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
            <Bar
              dataKey="toppedUp"
              fill={TOPPED_UP}
              radius={[2, 2, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* A recharts <Legend> adds 20px of padding and its own font stack to say two words. */}
      <div className="mt-2 flex items-center gap-4 text-[12px] text-ink-muted">
        <Key color={CONSUMED} label="Consumed" />
        <Key color={TOPPED_UP} label="Topped up" />
      </div>
    </>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  const consumed = payload.find((entry) => entry.dataKey === "consumed")?.value ?? 0;
  const toppedUp = payload.find((entry) => entry.dataKey === "toppedUp")?.value ?? 0;

  return (
    <div className="rounded-lg border border-border bg-surface-1 px-2.5 py-2 text-[12px] shadow-linear">
      <p className="font-medium text-ink">{label}</p>
      <p className="mt-1 text-ink-muted">
        <span className="tabular-nums text-ink">{consumed.toLocaleString()}</span> consumed
      </p>
      <p className="text-ink-muted">
        <span className="tabular-nums text-ink">{toppedUp.toLocaleString()}</span> topped up
      </p>
    </div>
  );
}
