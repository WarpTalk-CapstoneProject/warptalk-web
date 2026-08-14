#!/usr/bin/env node
/**
 * The workspace dashboard must scroll, not squeeze — and its chart must always be drawn.
 *
 * WHAT HAPPENED
 *   The dashboard passed `flex flex-col gap-4` to <WorkspaceBody>. WorkspaceBody is `flex-1`
 *   inside a `h-full` page, so it has a DEFINITE height and an `overflow-auto` of its own. Making
 *   it a flex column turned every panel into a flex item with the default `flex-shrink: 1`, and
 *   per CSS Flexbox §4.5 a flex item whose computed overflow is not `visible` has an automatic
 *   minimum size of ZERO. So instead of the body scrolling, the panels were compressed — and
 *   exactly the two children carrying `overflow-hidden` collapsed: DashboardHero flattened into a
 *   strip of its own gradient, and the chart row into a sliver that clipped "Credit usage" to
 *   "Cre…". Every other panel kept its height, which is why the screenshot read as a weird overlap
 *   rather than as a layout that had given up.
 *
 *   It is a nasty one because it is invisible on a tall viewport: the panels only shrink once the
 *   content exceeds the body's height. It reproduces by making the window shorter, which is why it
 *   arrived as a "responsive" report.
 *
 * THE RULES
 *   1. WorkspaceBody is never handed a flex/grid layout class. Block children cannot shrink.
 *   2. The usage chart is rendered for a workspace with no plan too. UsageTrend draws axes, a grid
 *      and a flat baseline for an all-zero series and puts the message on top of them; swapping
 *      the whole panel for one sentence leaves a hole where the chart is and moves the panel the
 *      moment the first credit is spent.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const DASHBOARD = "src/app/(app)/[workspaceSlug]/dashboard/page.tsx";
const TREND = "src/app/(app)/[workspaceSlug]/dashboard/components/usage-trend.tsx";

const failures = [];

const dashboard = read(DASHBOARD);

// ---- Rule 1: WorkspaceBody must not become a flex or grid container ------------------------
// Matches the className string on any <WorkspaceBody ...> in this file.
for (const match of dashboard.matchAll(
  /<WorkspaceBody[^>]*className=\{?"([^"]*)"/g,
)) {
  const classes = match[1].split(/\s+/);
  const layout = classes.filter((c) =>
    /^(flex|grid|inline-flex|inline-grid)$/.test(c),
  );
  if (layout.length > 0) {
    failures.push(
      `${DASHBOARD}: <WorkspaceBody> is given "${layout.join(" ")}". Its children then shrink ` +
        `instead of scrolling, and any panel with overflow-hidden collapses to nothing ` +
        `(CSS Flexbox §4.5). Use space-y-* and let the body scroll.`,
    );
  }
}

// ---- Rule 2: the chart is drawn even when the workspace has no plan ------------------------
// The no-plan case is a 404 from the usage endpoint. If the error branch swallows every status,
// the chart disappears for exactly the workspaces that have never seen it.
if (!/getErrorStatus\(trendQuery\.error\)\s*!==\s*404/.test(dashboard)) {
  failures.push(
    `${DASHBOARD}: the usage-trend error branch must exclude 404. A workspace with no plan 404s ` +
      `here, and that is an EMPTY chart, not a missing one — render <UsageTrend> with ` +
      `emptyMessage instead of replacing the panel with a sentence.`,
  );
}

if (!/<UsageTrend[\s\S]{0,400}?emptyMessage=/.test(dashboard)) {
  failures.push(
    `${DASHBOARD}: <UsageTrend> is never passed emptyMessage, so the "no plan yet" copy has ` +
      `nowhere to appear over the empty chart.`,
  );
}

const trend = read(TREND);
if (!/emptyMessage\?:/.test(trend)) {
  failures.push(
    `${TREND}: UsageTrend must keep its optional emptyMessage prop — the dashboard relies on it ` +
      `to draw an empty chart rather than hide the panel.`,
  );
}

// The chart must keep a fixed drawing height; a percentage height inside a collapsed parent is
// how it silently became 0px tall in the first place.
if (!/h-\[220px\]/.test(trend)) {
  failures.push(
    `${TREND}: the chart container must keep an explicit height (h-[220px]). ` +
      `ResponsiveContainer resolves height:100% against its parent and renders nothing when that ` +
      `parent has collapsed.`,
  );
}

if (failures.length > 0) {
  console.error("dashboard-panels contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("dashboard-panels contract OK");
