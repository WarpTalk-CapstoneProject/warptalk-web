/**
 * The admin dashboards draw every chart with one primitive (src/components/admin/charts), and
 * every hover readout through one portalled tooltip.
 *
 * What this pins, and the defect each line stops from coming back:
 *   - No Recharts under the admin components. Its tooltips were rendered inside the card, where
 *     `overflow-hidden` cut them off, in a hardcoded navy (#0f172a) that ignored the theme.
 *   - No SVG `<title>` as a chart readout: a browser tooltip that is late, unstyled, and never
 *     shown on keyboard focus.
 *   - The chart tooltip is portalled to <body> and placed `fixed` with viewport clamping, so no
 *     ancestor can clip it; the text tooltip is Base UI's, also portalled.
 *   - The old hand-drawn chart module is gone, so a new chart cannot quietly use it.
 *   - Colours are tokens, defined for BOTH themes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./lib/strip-comments.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const adminSources = [
  ...walk("src/components/admin"),
  ...walk("src/app/(app)/admin"),
  "src/app/(internal)/billing/page.tsx",
  "src/app/(internal)/billing/workspace/[id]/page.tsx",
];
for (const rel of adminSources) {
  const source = stripComments(read(rel));
  assert.ok(!/from "recharts"/.test(source), `${rel} imports Recharts; use components/admin/charts`);
  assert.ok(!/<title>/.test(source), `${rel} uses an SVG <title> as a tooltip; use the shared tooltip`);
  assert.ok(!/#0f172a/i.test(source), `${rel} hardcodes the old navy tooltip colour`);
}

assert.ok(!exists("src/components/admin/insights/insights-charts.tsx"), "the old hand-drawn chart module stays deleted");

const tooltip = read("src/components/admin/charts/chart-tooltip.tsx");
assert.match(tooltip, /createPortal\([\s\S]*document\.body/, "the chart tooltip is portalled to <body>");
assert.match(tooltip, /\bfixed\b/, "…and positioned against the viewport");
assert.match(tooltip, /placeTooltip\(/, "…and flipped/clamped inside it");
assert.match(tooltip, /bg-popover/, "…and drawn from theme tokens");

const textTooltip = read("src/components/ui/tooltip.tsx");
assert.match(textTooltip, /TooltipPrimitive\.Portal/, "the text tooltip is portalled");
assert.match(textTooltip, /collisionPadding/, "…and avoids the viewport edges");

const chart = read("src/components/admin/charts/time-series-chart.tsx");
assert.match(chart, /valueRuns\(/, "a null breaks the line instead of drawing a 0");
assert.match(chart, /monotonePath\(/, "lines are monotone, never overshooting");
assert.match(chart, /niceScale\(/, "ticks are round numbers");
assert.match(chart, /<table className="sr-only">/, "every chart has a table view");

// Every admin dashboard chart goes through the primitive.
for (const rel of [
  "src/components/admin/insights/insights-dashboard.tsx",
  "src/components/admin/billing-growth-overview.tsx",
  "src/components/admin/UsageChart.tsx",
  "src/components/admin/FeatureBreakdownChart.tsx",
  "src/components/admin/TopWorkspacesChart.tsx",
  "src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx",
]) {
  assert.match(read(rel), /from "@\/components\/admin\/charts\//, `${rel} draws with components/admin/charts`);
}

// Future days stay blank: the dashboard tells the chart which gaps are still to come.
const dashboard = read("src/components/admin/insights/insights-dashboard.tsx");
assert.match(dashboard, /days\[index\]\?\.future \? "Still to come"/, "future days are described, not drawn as 0");

const css = read("src/app/globals.css");
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
const darkBlock = css.slice(css.indexOf(".dark {"));
for (const token of ["--viz-1", "--viz-2", "--viz-3", "--viz-4", "--viz-5"]) {
  assert.ok(rootBlock.includes(`${token}:`), `${token} is defined for light`);
  assert.ok(darkBlock.includes(`${token}:`), `${token} is defined for dark`);
}

// Profit and loss: provider and workspace colours follow the entity, never the rank.
assert.match(dashboard, /providerColors\(/, "provider series are coloured by provider identity");
assert.match(dashboard, /Colour follows the workspace/, "workspace series keep their colour when re-ranked");

console.log("Admin charts contract: PASS");
