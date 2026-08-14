"use client";

/**
 * How this cycle's credits were actually spent, day by day.
 *
 * WHAT IT REPLACES
 *   `UsageChart` — consumed vs topped-up per MONTH of a calendar year. On a monthly plan that is
 *   a single bar for the cycle you are in, which is why the billing page could show a workspace
 *   its own spending and still not explain it. A month's credits usually go on a handful of days,
 *   and the month bar is exactly the wrong resolution to see that.
 *
 * THE DASHED LINE IS THE ARGUMENT
 *   Bars alone are heights. The pace line is the rate at which the allowance lasts precisely to
 *   renewal, so a bar above it is a day that outran the plan and a run of bars below it is a cycle
 *   that will not be spent. Without the line an owner has to hold "1,400,000 over 30 days" in
 *   their head and divide, which nobody does.
 *
 * COLOURS COME FROM THE PALETTE
 *   The admin charts hardcode `#3b82f6` and a `#0f172a` tooltip, which is why they render as a
 *   different product in dark mode. Every colour here is a CSS variable, so the chart follows the
 *   theme like the rest of the page.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CycleActivity } from "@/lib/billing/cycle-activity";

interface Point {
  label: string;
  fullLabel: string;
  consumed: number;
  toppedUp: number;
  overPace: boolean;
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

export function CycleSpendChart({ activity }: { activity: CycleActivity }) {
  const dayFormat = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
  const pace = activity.evenPacePerBucket;

  const data: Point[] = activity.buckets.map((bucket) => ({
    label: dayFormat.format(bucket.start),
    fullLabel:
      activity.bucketSize === "week"
        ? `Week of ${dayFormat.format(bucket.start)}`
        : dayFormat.format(bucket.start),
    consumed: bucket.consumed,
    toppedUp: bucket.toppedUp,
    overPace: pace !== null && bucket.consumed > pace,
  }));

  if (activity.totalConsumed === 0) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-1 text-center">
        <p className="text-[13px] text-ink">No credits spent yet this cycle.</p>
        <p className="text-[12px] text-ink-muted">
          Spending appears here per {activity.bucketSize} as meetings are translated.
        </p>
      </div>
    );
  }

  // A tick per bar is unreadable at 30 bars in a narrow column. Recharts' own thinning drops
  // labels unpredictably as the container resizes; a fixed stride keeps the first and last
  // labelled and the spacing even.
  const stride = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={stride - 1}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            dy={6}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={48}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "var(--foreground)",
              boxShadow: "0 8px 20px rgba(15,15,15,0.06)",
            }}
            labelFormatter={(_label, payload) =>
              (payload?.[0]?.payload as Point | undefined)?.fullLabel ?? ""
            }
            formatter={(value, name) => [
              `${Number(value ?? 0).toLocaleString()} credits`,
              name === "consumed" ? "Spent" : "Added",
            ]}
          />
          {pace !== null ? (
            <ReferenceLine
              y={pace}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: `Even pace · ${compact(pace)}/${activity.bucketSize}`,
                position: "insideTopLeft",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
          ) : null}
          {/* No entry animation. Recharts animates bars up from zero on mount, and when that
              animation does not run to completion — a tab that mounts hidden, a reduced-motion
              setting, a re-render mid-flight — the bars stay at their starting height and the
              chart renders as an empty grid with a pace line across it. An empty chart is
              indistinguishable from a workspace that spent nothing, which is the one reading this
              must never produce. */}
          <Bar
            dataKey="consumed"
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
            isAnimationActive={false}
          >
            {data.map((point, index) => (
              <Cell
                key={index}
                // Amber is reserved for the buckets that outran the plan. Colouring every bar
                // would make a normal cycle look like a warning, which is how a chart stops being
                // read at all.
                fill={point.overPace ? "var(--color-amber-500, #f59e0b)" : "var(--primary)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
