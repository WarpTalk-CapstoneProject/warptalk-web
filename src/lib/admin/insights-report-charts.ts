/**
 * Draws a report chart to a PNG, in the browser, for the Word export.
 *
 * Plain canvas rather than the dashboard's SVG components: the document needs pixels, and rendering
 * the React charts off-screen just to rasterise them would drag the whole page into the export.
 * The geometry (`chartLayout`) is a pure function so the tests can check bar placement under node
 * without a canvas.
 */

import { compactNumber } from "./insights-metrics.ts";
import type { ReportChart } from "./insights-report.ts";

export const CHART_WIDTH = 1200;
const COLUMN_HEIGHT = 480;
const BAR_ROW = 56;

const INK = "#111214";
const MUTED = "#5E6470";
const GRID = "#E3E5E9";
const BAR = "#4F46E5";

export interface PlotBar {
  label: string;
  value: number | null;
  /** Pixels, in the canvas' coordinate system. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLayout {
  width: number;
  height: number;
  plot: { x: number; y: number; width: number; height: number };
  max: number;
  bars: PlotBar[];
}

/** A "nice" axis maximum: 1, 2, 2.5 or 5 times a power of ten that is >= the largest value. */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) if (step * base >= value) return step * base;
  return 10 * base;
}

/** Where every bar goes. A null value gets a zero-height bar: absent, not drawn as zero-high data. */
export function chartLayout(chart: Pick<ReportChart, "kind" | "points">): ChartLayout {
  const max = niceMax(Math.max(0, ...chart.points.map((p) => p.value ?? 0)));
  if (chart.kind === "columns") {
    const plot = { x: 110, y: 24, width: CHART_WIDTH - 110 - 24, height: COLUMN_HEIGHT - 24 - 70 };
    const slot = plot.width / Math.max(1, chart.points.length);
    const width = Math.max(2, slot * 0.7);
    const bars = chart.points.map((p, i) => {
      const height = p.value === null ? 0 : (p.value / max) * plot.height;
      return { label: p.label, value: p.value, x: plot.x + slot * i + (slot - width) / 2, y: plot.y + plot.height - height, width, height };
    });
    return { width: CHART_WIDTH, height: COLUMN_HEIGHT, plot, max, bars };
  }
  const height = Math.max(160, chart.points.length * BAR_ROW + 40);
  const plot = { x: 360, y: 16, width: CHART_WIDTH - 360 - 150, height: height - 32 };
  const bars = chart.points.map((p, i) => {
    const width = p.value === null ? 0 : (p.value / max) * plot.width;
    return { label: p.label, value: p.value, x: plot.x, y: plot.y + i * BAR_ROW + 10, width, height: BAR_ROW - 20 };
  });
  return { width: CHART_WIDTH, height, plot, max, bars };
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** PNG bytes for a chart; null where there is no canvas (server render) or nothing to draw. */
export async function renderChartPng(chart: ReportChart): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || chart.points.length === 0) return null;
  const layout = chartLayout(chart);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.font = "22px Calibri, Arial, sans-serif";
  const { plot } = layout;

  if (chart.kind === "columns") {
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const y = plot.y + plot.height - (plot.height * i) / 4;
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.width, y);
      ctx.stroke();
      ctx.fillStyle = MUTED;
      ctx.fillText(compactNumber((layout.max * i) / 4), plot.x - 12, y);
    }
    ctx.fillStyle = BAR;
    for (const bar of layout.bars) ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
    // Label every Nth day so the axis stays legible on a 30-day month.
    const every = Math.max(1, Math.ceil(layout.bars.length / 12));
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    layout.bars.forEach((bar, i) => {
      if (i % every === 0) ctx.fillText(bar.label, bar.x + bar.width / 2, plot.y + plot.height + 12);
    });
  } else {
    ctx.textBaseline = "middle";
    for (const bar of layout.bars) {
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.fillText(truncate(ctx, bar.label, plot.x - 24), plot.x - 14, bar.y + bar.height / 2);
      ctx.fillStyle = BAR;
      ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
      ctx.textAlign = "left";
      ctx.fillStyle = MUTED;
      ctx.fillText(bar.value === null ? "—" : compactNumber(bar.value), bar.x + bar.width + 12, bar.y + bar.height / 2);
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
