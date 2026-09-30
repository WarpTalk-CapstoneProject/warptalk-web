// WT-853 — the Enterprise card said different things on the three pages that sell it.
//
// Pricing and the activation page built their benefit list from buildFeatureList; Billing → Plans
// wrote its own ("Voice Cloning Enabled", "Web access for up to N members") and printed the raw
// DB description. Every page that renders a plan card now takes both from lib/billing/plan-copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const PLAN_PAGES = [
  "src/app/page.tsx",
  "src/components/workspace/workspace-activation-landing.tsx",
  "src/app/(app)/[workspaceSlug]/payment/plans/page.tsx",
  "src/app/(app)/workspace/plans/page.tsx",
  "src/app/workspace/payment/plans/page.tsx",
];

for (const path of PLAN_PAGES) {
  const source = read(path);
  assert.match(source, /buildFeatureList\(plan/, `${path} must list plan benefits with buildFeatureList`);
  assert.match(source, /describePlan\(plan/, `${path} must describe a plan with describePlan`);
  assert.doesNotMatch(
    source,
    /Voice Cloning Enabled|No Voice Cloning|Web access for up to|JSON\.parse\(plan\.features/,
    `${path} must not build its own plan benefit list (WT-853)`,
  );
  assert.doesNotMatch(
    source,
    /\{plan\.description\}|plan\.description \|\|/,
    `${path} must not choose between the DB description and the tier sentence itself`,
  );
}

console.log(`PASS ${PLAN_PAGES.length} plan pages read their card copy from one source (WT-853)`);
