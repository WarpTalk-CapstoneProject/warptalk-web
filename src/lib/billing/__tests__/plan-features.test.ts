import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parsePlanFeatures, planHighlights, serializePlanFeatures } from "../plan-features.ts";

// Verbatim shape of production's contract plans (3 Oct 2026).
const CONTRACT = JSON.stringify({
  billing_model: "contract_template",
  overage_policy: "invoice_after_cap",
  external_integrations: { google_meet: true },
  voice_clone_limit_mins: -1,
  supported_external_platforms: ["google_meet"],
});

describe("plan features as controls", () => {
  test("the production contract object reads as three controls", () => {
    const features = parsePlanFeatures(CONTRACT);
    assert.equal(features.googleMeet, true);
    assert.equal(features.contractBilling, true);
    assert.equal(features.voiceCloneLimitMins, -1);
    assert.deepEqual(features.highlights, []);
    assert.deepEqual(features.rest, {});
  });

  test("an untouched round trip writes back exactly what was stored", () => {
    assert.deepEqual(JSON.parse(serializePlanFeatures(parsePlanFeatures(CONTRACT))), JSON.parse(CONTRACT));
    assert.equal(serializePlanFeatures(parsePlanFeatures("{}")), "{}");
  });

  test("a key the form does not know is never dropped", () => {
    const stored = JSON.stringify({ sso: { saml: true }, external_integrations: { teams: true, google_meet: true } });
    const out = JSON.parse(serializePlanFeatures({ ...parsePlanFeatures(stored), googleMeet: false }));
    assert.deepEqual(out.sso, { saml: true });
    assert.deepEqual(out.external_integrations, { teams: true });
    assert.equal(out.supported_external_platforms, undefined);
  });

  test("unticking contract billing removes both of its keys", () => {
    const out = JSON.parse(serializePlanFeatures({ ...parsePlanFeatures(CONTRACT), contractBilling: false }));
    assert.equal(out.billing_model, undefined);
    assert.equal(out.overage_policy, undefined);
  });

  test("highlights are trimmed, deduplicated, and read back for the pricing page", () => {
    const json = serializePlanFeatures({
      ...parsePlanFeatures("{}"),
      highlights: ["Custom glossary", " Custom glossary ", "", "Priority support"],
    });
    assert.deepEqual(planHighlights(json), ["Custom glossary", "Priority support"]);
  });

  test("a legacy array is read as highlights; garbage reads as nothing", () => {
    assert.deepEqual(planHighlights(JSON.stringify(["A", "B"])), ["A", "B"]);
    assert.deepEqual(parsePlanFeatures("not json").highlights, []);
    assert.deepEqual(parsePlanFeatures(null).rest, {});
  });
});
