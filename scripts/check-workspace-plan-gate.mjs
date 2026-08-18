#!/usr/bin/env node
/**
 * A workspace cannot be founded without a plan.
 *
 * This rule has been asked for, half-built, and lost once already. WT-491 shipped the half that
 * carried a guest's chosen plan through sign-up, and everyone read that as the gate — but the
 * create form still ran first and offered the plan grid AFTERWARDS, from inside the workspace it
 * had already created. Production therefore kept doing exactly what the ticket asked it to stop,
 * and nothing failed, because nothing was checking.
 *
 * The gate is spread across four files by necessity — an entry point, a redirect, a form, and a
 * charge — and any ONE of them reverting silently restores the old behaviour. So it is pinned
 * here rather than left to review.
 */

import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Source with `//` and block comments removed, for checks about code rather than prose. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const gateway = read("src/app/(app)/workspace/page.tsx");
const plansPage = read("src/app/(app)/workspace/plans/page.tsx");
const createPage = read("src/app/(app)/workspace/create/page.tsx");
const sidebar = read("src/components/layout/linear-sidebar.tsx");
const appLayout = read("src/app/(app)/layout.tsx");
const pricing = read("src/lib/billing/plan-pricing.ts");

const checks = [];

checks.push([
  "the gateway no longer opens the create form directly",
  !gateway.includes('router.push("/workspace/create")'),
]);

checks.push([
  "the gateway offers the plan grid as the way to create a workspace",
  gateway.includes('router.push("/workspace/plans")'),
]);

checks.push([
  "the Create card is presented as disabled, with the reason on it",
  gateway.includes('aria-disabled="true"') && /Choose a plan first/.test(gateway),
]);

checks.push([
  "joining still needs no plan — its card is untouched",
  gateway.includes('router.push("/workspace/join")'),
]);

checks.push([
  "a buyer arriving from the landing page with a plan is forwarded to the grid, not stranded",
  gateway.includes("/workspace/plans?") && gateway.includes("CHECKOUT_PLAN_PARAM"),
]);

checks.push([
  "the plan grid carries BOTH the plan and the billing cycle to the create form",
  /\/workspace\/create\?planSlug=\$\{encodeURIComponent\(planSlug\)\}&billingCycle=\$\{interval\}/.test(
    plansPage,
  ),
]);

checks.push([
  "the create form refuses to run without a plan, so the URL is not a way around the gate",
  /!checkoutPlanSlug[\s\S]{0,120}router\.replace\("\/workspace\/plans"\)/.test(createPage),
]);

checks.push([
  "creating opens checkout in the same action rather than leaving an unpaid workspace behind",
  createPage.includes("billingService.createCheckoutSession") &&
    createPage.includes("window.location.assign(checkoutUrl)"),
]);

checks.push([
  "a failed checkout does not strand the buyer on a form that already succeeded",
  createPage.includes("checkoutContinuationPath(selection.slug, checkoutPlanSlug)"),
]);

checks.push([
  "the amount charged comes from the shared pricing rule, not a second copy of it",
  createPage.includes("checkoutTotal(chosenPlan, billingInterval)") &&
    plansPage.includes("checkoutTotal(plan, interval)"),
]);

checks.push([
  "the yearly discount is defined once",
  /YEARLY_PRICE_MULTIPLIER = 0\.79/.test(pricing) &&
    // Comments stripped first: the plans page explains in prose why the constant left, and a
    // check that cannot tell an explanation from an implementation would forbid saying so.
    !/0\.79/.test(withoutComments(read("src/app/(app)/[workspaceSlug]/payment/plans/page.tsx"))),
]);

checks.push([
  "the sidebar's create entry goes through the gateway, not past it",
  !sidebar.includes('router.push("/workspace/create")'),
]);

checks.push([
  "the plan grid renders without the workspace chrome, like the rest of onboarding",
  appLayout.includes('pathname === "/workspace/plans"'),
]);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

const failures = checks.filter(([, passed]) => !passed);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
