/**
 * WT-853 — every subscription page describes a plan the same way. See plan-copy.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFeatureList, describePlan } from "../plan-copy.ts";
import type { PlanDto } from "../../../types/billing.ts";

const enterprise = {
  name: "Enterprise",
  description: "",
  creditsPerCycle: 700000,
  maxParticipants: 500,
  maxLanguages: 3,
  voiceCloneEnabled: true,
  features: "[]",
} as unknown as PlanDto;

test("the Enterprise benefits are the ones the Pricing and activation pages show", () => {
  assert.deepEqual(buildFeatureList(enterprise), [
    `${(700000).toLocaleString()} credits per cycle`,
    "Up to 500 participants per meeting",
    "Up to 3 languages simultaneously",
  ]);
});

test("admin-written features are appended, not substituted", () => {
  const plan = { ...enterprise, features: JSON.stringify(["Priority support"]) } as PlanDto;
  assert.equal(buildFeatureList(plan).at(-1), "Priority support");
  assert.equal(buildFeatureList(plan).length, 4);
});

test("a blank DB description falls back to the tier sentence, a written one wins", () => {
  assert.equal(
    describePlan(enterprise),
    "For operators using voice cloning and native-feeling interpretation at scale.",
  );
  assert.equal(describePlan({ name: "Enterprise", description: "  " }), describePlan(enterprise));
  assert.equal(describePlan({ name: "Enterprise", description: "Custom." }), "Custom.");
});

test("a translator is honoured, so the landing page stays localised", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    `${key}:${values?.count ?? ""}`;
  assert.deepEqual(buildFeatureList(enterprise, t).slice(1), [
    "featureParticipants:500",
    "featureLanguages:3",
  ]);
  assert.equal(describePlan(enterprise, t), "descriptionEnterprise:");
});
