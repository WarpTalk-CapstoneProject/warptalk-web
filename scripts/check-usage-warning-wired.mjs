#!/usr/bin/env node
/**
 * WT-557 — the usage warning is actually reachable.
 *
 * This repo's recurring failure is not broken code, it is code wired to nothing: WT-515's paywall
 * sat finished on a branch for four days, the workspace glossary was built end to end behind a
 * page with no door, and the admin billing actions are still dead wires. A banner that renders
 * beautifully in a component nobody mounts is the same bug wearing a different hat, and it is
 * invisible to a unit test of the component.
 *
 * So this asserts the hops: layout → banner → decision module → the one top-up modal.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const layout = read("src/app/(app)/[workspaceSlug]/layout.tsx");
const banner = read("src/components/billing/usage-warning-banner.tsx");
const decision = read("src/lib/billing/usage-warning.ts");

// ── hop 1: the layout mounts it ──────────────────────────────────────────────

assert.match(
  layout,
  /import \{ UsageWarningBanner \}/,
  "The workspace layout must import the usage banner; a component nobody imports is not shipped.",
);
assert.match(
  layout,
  /<UsageWarningBanner\b/,
  "The workspace layout must RENDER the banner, not merely import it.",
);

// It belongs inside the paywall. A workspace that has not paid at all is shown the paywall and
// does not also need to hear that its credits are low — two alarms for one problem.
assert.match(
  layout,
  /<WorkspacePaywall[\s\S]{0,600}?<UsageWarningBanner[\s\S]{0,400}?<\/WorkspacePaywall>/,
  "The banner must render INSIDE the paywall, so an unpaid workspace sees one message and not two.",
);

// ── hop 2: the banner asks the tested rule, rather than inventing one ────────

assert.match(
  banner,
  /decideUsageWarning\(/,
  "The banner must take its decision from lib/billing/usage-warning, where the rules are tested.",
);
assert.doesNotMatch(
  banner,
  /percentRemaining\s*[<>]=?\s*\d/,
  "A threshold comparison inline in the component is a second, untested copy of the rule.",
);

// ── hop 3: it reuses the one top-up modal ───────────────────────────────────

assert.match(
  banner,
  /import \{ TopUpModal \}/,
  "Add credits must open the existing TopUpModal. A second copy is how the credit price was duplicated and overcharged by 2–2.5× last time.",
);
assert.doesNotMatch(
  banner,
  /VND_PER_CREDIT|createCheckoutSession/,
  "The banner must not price or charge anything itself — the server owns the price.",
);

// ── the rules that must not quietly change ──────────────────────────────────

assert.match(
  decision,
  /WARN_BELOW_FRACTION\s*=\s*0\.1\b/,
  "The warning threshold is 10% remaining (WT-557). Changing it is a product decision, not a refactor.",
);

// "No ceiling" must never render as 0%. A contract workspace that has never been metered has
// remaining + used = 0, and telling it that it has 0% left is an alarm nobody can clear.
assert.match(
  decision,
  /total\s*<=\s*0\)\s*return null/,
  "A workspace with no measurable ceiling must produce no warning, not a 0% one.",
);

// The percentage must floor. Rounding 4.9% up to 5% reports a rosier number than the truth about
// somebody's money.
assert.match(
  decision,
  /Math\.floor\(fraction \* 100\)/,
  "The remaining percentage must be floored, never rounded.",
);

console.log("Usage warning contract OK (3 hops + 3 rules checked)");
