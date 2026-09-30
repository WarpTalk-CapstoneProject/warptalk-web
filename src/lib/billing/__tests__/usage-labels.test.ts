// Which service a billed name belongs to.
//
// The Usage page joins two server vocabularies — the charge type inside a settlement's
// description, and the breakdown endpoint's usage type — onto one row per service. If a spelling
// maps to nothing, or two spellings of the same work map to different rows, the chart and the
// cards disagree while both look correct. And a name nobody mapped must still appear.

import assert from "node:assert/strict";
import test from "node:test";

import {
  chargeTypeFromDescription,
  usageServiceOf,
  usageTypeLabel,
} from "../usage-labels.ts";

test("the live settlement charge types each land on a named service", () => {
  // warptalk-ai billing_worker/worker.py passes these as BOTH charge_type and usage_type.
  assert.deepEqual(usageServiceOf("TRANSLATION"), {
    key: "translation",
    label: "Live translation",
    known: true,
  });
  assert.equal(usageServiceOf("AUDIO_DUBBING_STANDARD").key, "dubbing");
  assert.equal(usageServiceOf("AUDIO_DUBBING_VOICE_CLONE").key, "clone_dubbing");
});

test("charge types that were billed before 10 Aug, or only priced, still have a service", () => {
  assert.equal(usageServiceOf("STT").key, "transcription");
  assert.equal(usageServiceOf("AI_ASSISTANT").key, "assistant");
  assert.equal(usageServiceOf("AI_SUMMARY").key, "summary");
  assert.equal(usageServiceOf("VOICE_CLONE_ENROLLMENT").key, "voice_cloning");
});

test("the older lower-case usage types fold onto the same services", () => {
  assert.equal(usageServiceOf("voice_translation").key, usageServiceOf("TRANSLATION").key);
  assert.equal(usageServiceOf("text_to_speech").key, usageServiceOf("AUDIO_DUBBING_STANDARD").key);
  assert.equal(usageServiceOf("speech_to_text").key, usageServiceOf("STT").key);
  assert.equal(usageServiceOf("chat").key, usageServiceOf("AI_ASSISTANT").key);
  assert.equal(usageServiceOf("meeting_summary").key, usageServiceOf("AI_SUMMARY").key);
});

test("an unknown name is kept under its own name rather than dropped or merged", () => {
  const service = usageServiceOf("HOLOGRAM_RENDERING");
  assert.equal(service.known, false);
  assert.equal(service.label, "HOLOGRAM RENDERING");
  assert.equal(service.key, "raw:hologram_rendering");
  assert.notEqual(service.key, usageServiceOf("OTHER_THING").key);
});

test("an empty name is labelled, not blank", () => {
  assert.equal(usageServiceOf(null).label, "Other usage");
  assert.equal(usageServiceOf("  ").label, "Other usage");
});

test("labels are short enough for a card title", () => {
  for (const name of ["TRANSLATION", "text_to_speech", "AUDIO_DUBBING_VOICE_CLONE", "voice_cloning"]) {
    assert.ok(usageTypeLabel(name).length <= 22, `${name} → ${usageTypeLabel(name)}`);
  }
});

test("the charge type is read back out of the settlement description", () => {
  // 017-add-just-entered-overage-to-settlement.sql: CONCAT('Aggregated ', p_charge_type)
  assert.equal(chargeTypeFromDescription("Aggregated TRANSLATION"), "TRANSLATION");
  assert.equal(
    chargeTypeFromDescription("Aggregated AUDIO_DUBBING_VOICE_CLONE"),
    "AUDIO_DUBBING_VOICE_CLONE",
  );
  assert.equal(chargeTypeFromDescription("Top-up via Stripe"), null);
  assert.equal(chargeTypeFromDescription(undefined), null);
  assert.equal(chargeTypeFromDescription("Aggregated "), null);
});
