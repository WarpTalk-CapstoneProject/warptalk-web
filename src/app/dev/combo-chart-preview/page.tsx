"use client";

/**
 * `TimeSeriesChart variant="combo"` against fixtures: the only place to look at two-axis charts
 * without a live workspace. Theme comes from the app (toggle it as usual); /dev is 404 in production.
 *
 * Three cases: credits as columns with meetings as a line (the telemetry dashboard's case, where a
 * shared axis flattened the line); the same with gaps (a null breaks the line and draws no column,
 * it is never a 0); and outcome columns stacked with a success rate in % on the right axis.
 */

import { TimeSeriesChart } from "@/components/admin/charts/time-series-chart";

const DAYS = 30;
const LABELS = Array.from({ length: DAYS }, (_, i) => `Sep ${i + 1}`);
const TITLES = Array.from({ length: DAYS }, (_, i) => `Sep ${i + 1}, 2026`);

const CREDITS = LABELS.map((_, i) => (i % 7 === 5 || i % 7 === 6 ? 0 : Math.round(900 + 7800 * Math.abs(Math.sin(i * 0.9)))));
const MEETINGS = LABELS.map((_, i) => (i % 7 === 5 || i % 7 === 6 ? 0 : 1 + (i % 4)));

const GAP_CREDITS = CREDITS.map((v, i) => (i >= 12 && i <= 15 ? null : i > 24 ? null : v));
const GAP_MEETINGS = MEETINGS.map((v, i) => (i >= 12 && i <= 15 ? null : i > 24 ? null : v));

const OK = LABELS.map((_, i) => 3 + (i % 5));
const PARTIAL = LABELS.map((_, i) => i % 3);
const FAILED = LABELS.map((_, i) => (i % 6 === 0 ? 2 : 0));
const RATE = LABELS.map((_, i) => {
  const total = OK[i] + PARTIAL[i] + FAILED[i];
  return total === 0 ? null : Math.round((OK[i] / total) * 100);
});

const number = (v: number) => new Intl.NumberFormat("en-US").format(v);
const percent = (v: number) => `${v}%`;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface-1 p-4">
      <h2 className="mb-3 text-sm font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function ComboChartPreviewPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-ink">Combo chart preview</h1>

      <Card title="Credits (columns, left) and meetings (line, right)">
        <TimeSeriesChart
          variant="combo"
          labels={LABELS}
          titles={TITLES}
          height={240}
          ariaLabel="Daily credits and meetings"
          formatValue={number}
          integerRight
          series={[
            { key: "credits", label: "Credits", values: CREDITS },
            { key: "meetings", label: "Meetings", values: MEETINGS, formatValue: (v) => `${v} meetings` },
          ]}
        />
      </Card>

      <Card title="Gaps: days still to come and a missing stretch break the line and draw no column">
        <TimeSeriesChart
          variant="combo"
          labels={LABELS}
          titles={TITLES}
          height={240}
          ariaLabel="Daily credits and meetings with gaps"
          formatValue={number}
          integerRight
          describeGap={(i) => (i > 24 ? "Still to come" : "No figure")}
          tooltipFooter={(i) => (GAP_CREDITS[i] === null ? null : "Footer line")}
          series={[
            { key: "credits", label: "Credits", values: GAP_CREDITS },
            { key: "meetings", label: "Meetings", values: GAP_MEETINGS },
          ]}
        />
      </Card>

      <Card title="Outcomes stacked (left) with success rate in % (line, right)">
        <TimeSeriesChart
          variant="combo"
          stacked
          labels={LABELS}
          titles={TITLES}
          height={240}
          ariaLabel="Meeting outcomes and success rate"
          formatValue={number}
          integer
          formatAxisRight={percent}
          tooltipFooter={(i) => `${OK[i] + PARTIAL[i] + FAILED[i]} total`}
          series={[
            { key: "ok", label: "Succeeded", values: OK, kind: "bar", axis: "left" },
            { key: "partial", label: "Partial", values: PARTIAL, kind: "bar", axis: "left" },
            { key: "failed", label: "Failed", values: FAILED, kind: "bar", axis: "left" },
            { key: "rate", label: "Success rate", values: RATE, kind: "line", axis: "right", formatValue: percent },
          ]}
        />
      </Card>
    </main>
  );
}
