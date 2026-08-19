"use client";

/**
 * The cycle's spending as a burn-up: credits spent, cumulative, read against the credits
 * available to spend.
 *
 * WHY THIS REPLACED THE BAR CHART ON USAGE
 *   `CycleSpendChart` answers "which day was expensive", and it still does on the preview
 *   screen. It cannot answer the question Usage is opened with — "when does this start costing
 *   extra" — and on real data it stops answering anything: the demo workspace put 2,100,998 of
 *   its 2,106,183 credits through one day, which renders as one bar, six bars of zero height,
 *   and an even-pace line flat on the axis. Cumulative absorbs that day as a step.
 *
 * HAND-DRAWN, NOT RECHARTS
 *   Three of the four things this chart must do are outside what the library gives for free: a
 *   step line for a ceiling that moves on top-ups, a dashed continuation past today that is
 *   visibly a forecast, and a hover panel that refuses to print a forecast beyond where the
 *   forecast is drawn. Recharts would supply the axes and then need overriding for all of it —
 *   including the mount animation `CycleSpendChart` had to disable, which leaves an empty grid
 *   whenever the animation does not run to completion.
 *
 * THE CEILING IS NOT A WALL
 *   Crossing it starts overage billing; it does not stop the workspace. So the spend line is
 *   drawn straight through it, the band above it is shaded as the overage it will be invoiced
 *   as, and nothing on this chart says "runs out".
 */

import { useMemo, useRef, useState } from "react";

import type { CycleBurnUp } from "@/lib/billing/cycle-burnup";

const W = 740;
const H = 250;
const PAD = { top: 16, right: 16, bottom: 30, left: 58 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function whole(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/**
 * A top of scale that divides into four readable gridlines.
 *
 * Scaling the peak by a flat factor gives axis labels like "805k" and "402k", which are exact and
 * unreadable — nobody carries a mental scale in 402,500s. Rounding the STEP up to a familiar
 * number puts the labels back on a scale a reader already has.
 */
function niceAxisMax(peak: number): number {
  const rawStep = (peak * 1.1) / 4;
  if (!(rawStep > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 4 ? 4 : normalised <= 5 ? 5 : 10) *
    magnitude;
  return step * 4;
}

/**
 * Monotone cubic (Fritsch–Carlson).
 *
 * A cumulative series never goes down, and the usual Catmull-Rom smoothing does not know that:
 * on a day that carries most of a cycle's spend it overshoots the step and dips the curve below
 * its previous value on the way in — drawing credits that were never spent, and a day of
 * negative spending that cannot exist.
 */
function monotonePath(points: [number, number][]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;

  const h: number[] = [];
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    h.push(points[i + 1][0] - points[i][0]);
    secants.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  }

  const slopes: number[] = [secants[0]];
  for (let i = 1; i < n - 1; i += 1) {
    slopes.push(secants[i - 1] * secants[i] <= 0 ? 0 : (secants[i - 1] + secants[i]) / 2);
  }
  slopes.push(secants[n - 2]);

  for (let i = 0; i < n - 1; i += 1) {
    if (secants[i] === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const a = slopes[i] / secants[i];
    const b = slopes[i + 1] / secants[i];
    const t = Math.hypot(a, b);
    if (t > 3) {
      slopes[i] = (3 / t) * a * secants[i];
      slopes[i + 1] = (3 / t) * b * secants[i];
    }
  }

  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const c1x = points[i][0] + h[i] / 3;
    const c1y = points[i][1] + (slopes[i] * h[i]) / 3;
    const c2x = points[i + 1][0] - h[i] / 3;
    const c2y = points[i + 1][1] - (slopes[i + 1] * h[i]) / 3;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)},${c2x.toFixed(1)} ${c2y.toFixed(1)},${points[i + 1][0].toFixed(1)} ${points[i + 1][1].toFixed(1)}`;
  }
  return d;
}

/** A step line: the ceiling holds its value until a transaction moves it. */
function stepPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += `H${points[i][0].toFixed(1)}V${points[i][1].toFixed(1)}`;
  }
  return d;
}

interface Reading {
  index: number;
  label: string;
  spent: number;
  spentInBucket: number | null;
  available: number;
  vsPace: number;
  projected: boolean;
  /** Past where the forecast is drawn — nothing to say, and the panel says that instead. */
  beyond: boolean;
}

export function CreditBurnUpChart({ burnUp }: { burnUp: CycleBurnUp }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const bucketDays = burnUp.bucketSize === "week" ? 7 : 1;
  const todayIndex = burnUp.points.length - 1;
  const lastIndex = Math.max(1, burnUp.bucketsInCycle - 1);

  const geometry = useMemo(() => {
    const peak = Math.max(
      burnUp.available,
      burnUp.spent,
      ...burnUp.points.map((p) => Math.max(p.available, p.spent)),
      1,
    );
    // Headroom, so the ceiling is never welded to the top edge and the overage band has room to
    // show above it.
    const yMax = niceAxisMax(peak);

    const x = (index: number) => PAD.left + (IW * index) / lastIndex;
    const y = (value: number) => PAD.top + IH - (IH * Math.min(value, yMax)) / yMax;

    return { yMax, x, y };
  }, [burnUp, lastIndex]);

  const { yMax, x, y } = geometry;

  const spentPoints = burnUp.points.map(
    (p, i) => [x(i), y(p.spent)] as [number, number],
  );
  const ceilingPoints = burnUp.points.map(
    (p, i) => [x(i), y(p.available)] as [number, number],
  );
  // The ceiling runs to the end of the cycle: it is what the workspace HAS, not what it has used,
  // so it is known for days that have not happened.
  ceilingPoints.push([x(lastIndex), y(burnUp.available)]);

  const overageBand = (() => {
    const over = burnUp.points
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.spent > p.available);
    if (over.length < 2) return null;
    const top = over.map(({ p, i }) => `${x(i).toFixed(1)} ${y(p.spent).toFixed(1)}`);
    const bottom = over
      .slice()
      .reverse()
      .map(({ p, i }) => `${x(i).toFixed(1)} ${y(p.available).toFixed(1)}`);
    return `M${top.concat(bottom).join("L")}Z`;
  })();

  const label = (index: number) => {
    const date = new Date(burnUp.points[0].start.getTime());
    date.setDate(date.getDate() + index * bucketDays);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  };

  // The forecast stops where the dashed line stops. Extrapolating past it would print numbers the
  // chart never draws, and past the day the allowance is gone what happens next depends on
  // decisions nobody has made.
  const forecastEnd = burnUp.overageAt !== null && !burnUp.overageIsMeasured
    ? Math.min(lastIndex, Math.ceil(burnUp.overageAt))
    : todayIndex;

  const projectedAt = (index: number) => {
    if (index <= todayIndex) return burnUp.points[index].spent;
    const rate = burnUp.perBucket ?? 0;
    return burnUp.spent + rate * (index - todayIndex);
  };

  // Plain computation, not a memo: it is four arithmetic operations, and memoising it would
  // need `label` and `projectedAt` in a dependency array where they are re-created every render.
  const reading: Reading | null = ((): Reading | null => {
    if (hovered === null) return null;
    const index = Math.max(0, Math.min(lastIndex, hovered));
    const beyond = index > forecastEnd;
    const projected = index > todayIndex;
    const spent = beyond ? 0 : projectedAt(index);
    const available =
      index <= todayIndex ? burnUp.points[index].available : burnUp.available;
    const pace = (burnUp.available * index) / lastIndex;

    return {
      index,
      label: label(index),
      spent,
      spentInBucket: beyond || index === 0 ? null : spent - projectedAt(index - 1),
      available,
      vsPace: spent - pace,
      projected,
      beyond,
    };
  })();

  function indexFromClientX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * W;
    return Math.round(((viewX - PAD.left) / IW) * lastIndex);
  }

  const bucketWord = burnUp.bucketSize === "week" ? "week" : "day";
  const paceText =
    burnUp.available > 0
      ? `Even pace · ${compact(burnUp.available / burnUp.bucketsInCycle)}/${bucketWord}`
      : "Even pace";

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        role="img"
        aria-label={`Credits spent this cycle: ${whole(burnUp.spent)} of ${whole(burnUp.available)} available`}
        tabIndex={0}
        onPointerMove={(event) => setHovered(indexFromClientX(event.clientX))}
        onPointerDown={(event) => setHovered(indexFromClientX(event.clientX))}
        onPointerLeave={() => setHovered(null)}
        onFocus={() => setHovered((value) => (value === null ? todayIndex : value))}
        onBlur={() => setHovered(null)}
        onKeyDown={(event) => {
          const from = hovered === null ? todayIndex : hovered;
          if (event.key === "ArrowLeft") setHovered(Math.max(0, from - 1));
          else if (event.key === "ArrowRight") setHovered(Math.min(lastIndex, from + 1));
          else if (event.key === "Home") setHovered(0);
          else if (event.key === "End") setHovered(lastIndex);
          else if (event.key === "Escape") setHovered(null);
          else return;
          event.preventDefault();
        }}
      >
        <defs>
          <pattern
            id="burnup-future"
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-hairline" strokeWidth="3" />
          </pattern>
          <linearGradient id="burnup-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((step) => {
          const value = (yMax * step) / 4;
          return (
            <g key={step}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-hairline"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 10}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-ink-subtle text-[11px] font-medium"
              >
                {compact(value)}
              </text>
            </g>
          );
        })}

        {todayIndex < lastIndex ? (
          <rect
            x={x(todayIndex)}
            y={PAD.top}
            width={W - PAD.right - x(todayIndex)}
            height={IH}
            fill="url(#burnup-future)"
          />
        ) : null}

        {/* The pace that spends the AVAILABLE credits exactly to renewal — not the plan's grant.
            A workspace that topped up has raised the rate it can afford, and a line drawn to the
            grant would keep telling it it is overspending money it has already bought. */}
        <path
          d={`M${x(0)} ${y(0)}L${x(lastIndex)} ${y(burnUp.available)}`}
          className="stroke-[var(--primary)] opacity-50"
          strokeWidth="1.5"
          strokeDasharray="3 4"
          fill="none"
        />

        <path d={stepPath(ceilingPoints)} className="stroke-ink-subtle" strokeWidth="1.75" fill="none" />

        <path
          d={`${monotonePath(spentPoints)}L${spentPoints[spentPoints.length - 1][0].toFixed(1)} ${y(0)}L${x(0)} ${y(0)}Z`}
          fill="url(#burnup-fill)"
        />

        {overageBand ? <path d={overageBand} className="fill-destructive opacity-20" /> : null}

        <path
          d={monotonePath(spentPoints)}
          className="stroke-[var(--primary)]"
          strokeWidth="2.25"
          strokeLinecap="round"
          fill="none"
        />

        {forecastEnd > todayIndex ? (
          <path
            d={`M${x(todayIndex)} ${y(burnUp.spent)}L${x(forecastEnd)} ${y(projectedAt(forecastEnd))}`}
            className="stroke-[var(--primary)] opacity-70"
            strokeWidth="2"
            strokeDasharray="5 5"
            fill="none"
          />
        ) : null}

        <circle
          cx={x(todayIndex)}
          cy={y(burnUp.spent)}
          r="4"
          className="fill-[var(--primary)]"
        />

        {burnUp.overageAt !== null ? (
          <g>
            <line
              x1={x(burnUp.overageAt)}
              x2={x(burnUp.overageAt)}
              y1={y(burnUp.available)}
              y2={PAD.top + IH}
              className="stroke-destructive opacity-80"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <circle
              cx={x(burnUp.overageAt)}
              cy={y(burnUp.available)}
              r="4.5"
              className="fill-destructive"
            />
          </g>
        ) : null}

        {todayIndex < lastIndex ? (
          <g>
            <line
              x1={x(todayIndex)}
              x2={x(todayIndex)}
              y1={PAD.top}
              y2={PAD.top + IH}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={x(todayIndex) - 6}
              y={PAD.top + 11}
              textAnchor="end"
              className="fill-ink-subtle text-[10px] font-semibold tracking-wider"
            >
              TODAY
            </text>
          </g>
        ) : null}

        {[0, Math.round(lastIndex / 3), Math.round((lastIndex * 2) / 3), lastIndex].map(
          (index, position) => (
            <text
              key={index}
              x={x(index)}
              y={H - 10}
              textAnchor={position === 0 ? "start" : position === 3 ? "end" : "middle"}
              className="fill-ink-subtle text-[11px] font-medium"
            >
              {label(index)}
            </text>
          ),
        )}

        {reading ? (
          <g pointerEvents="none">
            <line
              x1={x(reading.index)}
              x2={x(reading.index)}
              y1={PAD.top}
              y2={PAD.top + IH}
              className="stroke-border"
              strokeWidth="1"
            />
            <circle
              cx={x(reading.index)}
              cy={y(reading.available)}
              r="3.5"
              className="fill-ink-subtle"
            />
            {reading.beyond ? null : (
              <circle
                cx={x(reading.index)}
                cy={y(reading.spent)}
                r="5"
                strokeWidth="2"
                className={
                  reading.projected
                    ? "fill-surface-1 stroke-[var(--primary)]"
                    : "fill-[var(--primary)] stroke-surface-1"
                }
              />
            )}
          </g>
        ) : null}
      </svg>

      {reading ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-[186px] rounded-[8px] border border-border bg-surface-1 px-3 py-2.5"
          style={{
            left: `min(calc(100% - 194px), max(0px, ${(x(reading.index) / W) * 100}% + 14px))`,
            // Flipped to the half of the plot the line is not in, so the panel never covers the
            // point being read.
            top: y(reading.spent) < PAD.top + IH / 2 ? "auto" : "6px",
            bottom: y(reading.spent) < PAD.top + IH / 2 ? "30px" : "auto",
          }}
        >
          <p className="text-[11px] font-semibold text-ink">
            {reading.label}
            {reading.projected && !reading.beyond ? (
              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                projected
              </span>
            ) : null}
          </p>

          {reading.beyond ? (
            <p className="mt-1.5 text-[11.5px] text-ink-muted">Not forecast this far ahead.</p>
          ) : (
            <>
              <div className="mt-1.5 flex items-baseline justify-between gap-4">
                <span className="text-[11.5px] text-ink-muted">Spent</span>
                <b className="text-[11.5px] font-semibold tabular-nums text-ink">
                  {whole(reading.spent)}
                </b>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-4">
                <span className="text-[11.5px] text-ink-muted">
                  {burnUp.bucketSize === "week" ? "That week" : "That day"}
                </span>
                <b className="text-[11.5px] font-semibold tabular-nums text-ink">
                  {reading.spentInBucket === null ? "—" : whole(reading.spentInBucket)}
                </b>
              </div>
            </>
          )}

          <div className="-mx-3 mt-2 h-px bg-hairline" />

          <div className="mt-2 flex items-baseline justify-between gap-4">
            <span className="text-[11.5px] text-ink-muted">Available</span>
            <b className="text-[11.5px] font-semibold tabular-nums text-ink">
              {whole(reading.available)}
            </b>
          </div>
          {reading.beyond ? null : (
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <span className="text-[11.5px] text-ink-muted">vs even pace</span>
              <b
                className={`text-[11.5px] font-semibold tabular-nums ${
                  reading.vsPace > 0 ? "text-destructive" : "text-emerald-600"
                }`}
              >
                {reading.vsPace > 0 ? "+" : "−"}
                {whole(Math.abs(reading.vsPace))}
              </b>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <Key swatch={<span className="h-0 w-3.5 border-t-2 border-ink-subtle" />} text="Credits available" />
        <Key
          swatch={<span className="size-2.5 rounded-[2px] bg-[var(--primary)]" />}
          text="Spent, cumulative"
        />
        <Key
          swatch={<span className="h-0 w-3.5 border-t-2 border-dashed border-[var(--primary)]" />}
          text={paceText}
        />
        {todayIndex < lastIndex ? (
          <Key swatch={<span className="size-2.5 rounded-[2px] bg-hairline" />} text="Not yet spent" />
        ) : null}
      </div>
    </div>
  );
}

function Key({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-ink-muted">
      {swatch}
      {text}
    </span>
  );
}
