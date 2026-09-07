#!/usr/bin/env node
/**
 * A workspace with no plan lands on a page, not inside the product.
 *
 * WHY THIS IS PINNED
 *   This rule has now been implemented three times and been wrong twice, in the same direction
 *   each time. WT-515 stopped the features working and left the buyer standing in the app.
 *   WT-570 redirected them to `/{slug}/payment/plans` — which lives in the `(app)` route group,
 *   so the redirect drew the entire portal around the paywall: sidebar, workspace tabs, header,
 *   chatbot, every destination present and every one of them bouncing straight back. Both times
 *   the report from the owner was the same sentence: I am in the portal with the features locked.
 *
 *   The reason it keeps coming back is that the rule is spread across four files that each look
 *   correct alone — a decision module, a redirect, a route matcher, and the shell that decides
 *   whether to draw the chrome. Any ONE of them reverting restores the old behaviour, and none of
 *   them fails when it does. So the hops are asserted here rather than left to review.
 *
 * THE RULE
 *   blocked → /{slug}/activate → rendered with no portal around it → names the workspace, lists
 *   the plans, takes the payment.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Source with `//` and block comments removed, for checks about code rather than prose. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const routes = read("src/lib/workspace/workspace-routes.ts");
const rule = read("src/lib/billing/workspace-paywall.ts");
const gate = read("src/components/workspace/workspace-paywall.tsx");
const appShell = read("src/app/(app)/layout.tsx");
const landing = read("src/app/(app)/[workspaceSlug]/activate/page.tsx");
const card = read("src/components/workspace/workspace-activation-landing.tsx");

// ── hop 1: one path, named once ─────────────────────────────────────────────

assert.match(
  routes,
  /export function workspaceActivationPath\(/,
  "The landing's path must be defined in workspace-routes, so the redirect, the exemption and the shell cannot each spell it differently.",
);
assert.match(
  withoutComments(rule),
  /paywallRedirectPath[\s\S]{0,200}workspaceActivationPath\(workspaceSlug\)/,
  "The paywall must redirect to workspaceActivationPath, not to a literal it maintains itself.",
);

// ── hop 2: the redirect target is the one route left open ───────────────────

assert.match(
  withoutComments(rule),
  /OPEN_SEGMENTS = \["activate"\]/,
  "The activation landing must be the exempt segment. If the redirect target is not exempt, the hold loops forever.",
);
assert.doesNotMatch(
  withoutComments(rule),
  /"payment"/,
  'Do not re-open `payment`. `/{slug}/payment/plans` is the plan-MANAGEMENT screen for a workspace that already pays, and it renders inside the portal — holding an unpaid buyer there is the bug this landing replaced.',
);

// ── hop 3: the shell draws no portal around it ──────────────────────────────

assert.match(
  appShell,
  /isWorkspaceActivationPath/,
  "The app shell must ask isWorkspaceActivationPath, or the sidebar comes back around the paywall.",
);
assert.match(
  withoutComments(appShell),
  /const isOnboardingRoute =[\s\S]{0,400}?isWorkspaceActivationPath\(pathname\)/,
  "The activation landing must join the chrome-less branch the onboarding routes use — that branch is what returns bare children.",
);

// ── hop 4: the gate sends EVERYBODY there, whatever their role ──────────────

assert.match(
  withoutComments(gate),
  /decision\.kind === "blocked"[\s\S]{0,200}router\.replace\(paywallRedirectPath\(workspaceSlug\)\)/,
  "A blocked workspace must be redirected to the landing.",
);
assert.doesNotMatch(
  withoutComments(gate),
  /role === "owner"|canBuy/,
  'The gate must not branch on role any more. WT-570 sent buyers to a checkout and everyone else to a dead-end sentence that never named the workspace; the landing answers both, because it is the page holding the name and the plans.',
);

// ── hop 5: the landing is a landing — name, plans, and a real charge ────────

assert.match(
  landing,
  /activeWorkspaceName/,
  "The landing must read the workspace's own name from the store. Not naming the workspace was half of what made the old screen read as a punishment.",
);
assert.match(
  card,
  /\{workspaceName\} is ready/,
  "The name must reach the page itself, not merely be fetched.",
);
assert.match(
  card,
  /Only an owner or admin of \{workspaceName\} can activate a plan/,
  "A member must be told why the workspace is closed and who can open it — WT-570's dead-end sentence named neither the workspace nor the price.",
);
assert.match(
  landing,
  /billingService\.getPlans\(\)/,
  "The landing must list the plans. A paywall that only says no is the screen this replaced.",
);
assert.match(
  landing,
  /billingService\.createCheckoutSession\(/,
  "The landing must take the payment itself — it is the only route an unpaid workspace can reach, so a link to a checkout elsewhere would point at a blocked page.",
);

// The pricing rule is shared, not copied. Three screens now quote a price and hand an amount to
// Stripe; a second copy of the arithmetic is how the quote and the charge drift apart.
assert.match(
  landing,
  /checkoutTotal\(plan, interval\)/,
  "The charged amount must come from the shared pricing rule (lib/billing/plan-pricing).",
);
assert.match(
  card,
  /monthlyDisplayPrice\(plan, interval\)/,
  "The quoted price must come from the same rule as the charge, or the two drift apart.",
);
for (const [name, source] of [["the page", landing], ["the card", card]]) {
  assert.doesNotMatch(
    withoutComments(source),
    /0\.79/,
    `The yearly discount is defined once, in plan-pricing. A copy in ${name} would let the quote and the charge disagree.`,
  );
}
assert.match(
  landing,
  /checkoutCurrency\(plan\)/,
  'WT-518: the plan decides its own denomination. A literal "vnd" here charges a USD plan in VND while every screen quotes USD.',
);

// WT-370 — never bill a USER ID as a workspace. A well-formed Guid that is not a workspace passes
// every validation downstream and fails on the foreign key after the card has been charged.
assert.doesNotMatch(
  withoutComments(landing),
  /workspaceId:\s*\w+\s*(\|\||\?\?)\s*user/,
  "The checkout must refuse without a real workspace id rather than falling back to the user's.",
);

// ── hop 6: the picture stays previewable ───────────────────────────────────

// The split exists so every state can be looked at without an unpaid workspace to hand — the
// same reason usage-warning-card is separate from its banner. A page that swallows the component
// back into itself is a page nobody can review again.
assert.doesNotMatch(
  card,
  /useQuery|useWorkspaceStore|useAuthStore|useRouter/,
  "The landing component must take props only. A store or a query in it is what makes a state unreachable in the preview.",
);
read("src/app/dev/workspace-activation-preview/page.tsx");

console.log("Unpaid-workspace landing contract OK (6 hops checked)");
