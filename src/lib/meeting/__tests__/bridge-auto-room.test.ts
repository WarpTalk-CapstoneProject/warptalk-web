import test from "node:test";
import assert from "node:assert/strict";

import { planBridgeClaim } from "../bridge-auto-room.ts";

// W4b part 1: a Google Meet call is CLAIMED (POST /translation-rooms/bridge/claim), never created
// by the client. The language planning is the claim body.

const base = {
  meetCode: "jkq-yaax-phw",
  allowedLanguages: [],
};

function claim(input: Parameters<typeof planBridgeClaim>[0]) {
  const plan = planBridgeClaim(input);
  assert.equal(plan.kind, "claim");
  if (plan.kind !== "claim") throw new Error("unreachable");
  return plan;
}

test("no room code means no claim: a picture-in-picture sighting waits for the normal window", () => {
  assert.deepEqual(planBridgeClaim({ ...base, meetCode: null }), { kind: "wait" });
  assert.deepEqual(planBridgeClaim({ ...base, meetCode: "home" }), { kind: "wait" });
});

test("the claim names the call by its bare lower-case code", () => {
  const plan = claim({ ...base, meetCode: "  JKQ-YAAX-PHW " });
  assert.equal(plan.body.meetCode, "jkq-yaax-phw");
});

test("the claim body is the planned languages, far side first and named", () => {
  const plan = claim({ ...base, settingsSpeak: "vi", settingsListen: "vi" });
  assert.deepEqual(plan.body, {
    meetCode: "jkq-yaax-phw",
    sourceLanguage: "vi",
    // The far side first, and named: the server used to seed the stand-in from targetLanguages[0],
    // and this used to send ["vi"] — host and far side on one language, nothing ever translated.
    targetLanguages: ["en", "vi"],
    externalMeetingLanguage: "en",
  });
  assert.equal(plan.translatable, true);
});

test("the far side never defaults to the host's own language", () => {
  for (const speak of ["vi", "en", "ja", "ko"]) {
    const plan = claim({ ...base, settingsSpeak: speak });
    assert.equal(plan.body.sourceLanguage, speak);
    assert.notEqual(plan.body.externalMeetingLanguage, speak, `host speaks ${speak}`);
    assert.equal(plan.body.targetLanguages[0], plan.body.externalMeetingLanguage);
  }
});

test("an unrestricted workspace defaults the far side to English, or Vietnamese for an English speaker", () => {
  assert.equal(claim({ ...base, settingsSpeak: "vi-VN" }).body.externalMeetingLanguage, "en");
  assert.equal(claim({ ...base, settingsSpeak: "en" }).body.externalMeetingLanguage, "vi");
});

test("the user's listen setting is not taken as the far side's language", () => {
  // It says what THEY like to hear — in a bridge room, their own language — not what this call speaks.
  const plan = claim({ ...base, settingsSpeak: "vi", settingsListen: "ja" });
  assert.equal(plan.body.externalMeetingLanguage, "en");
});

test("languages never leave the workspace's list - the 403 this replaces", () => {
  const plan = claim({
    ...base,
    allowedLanguages: ["vi", "ja"],
    settingsSpeak: "ko",
    settingsListen: "en",
    locales: ["fr-FR"],
  });
  assert.equal(plan.body.sourceLanguage, "vi");
  // The first allowed language that is not the host's.
  assert.equal(plan.body.externalMeetingLanguage, "ja");
  assert.deepEqual(plan.body.targetLanguages, ["ja", "vi"]);
});

test("the user's own settings decide the host's language when the workspace allows it", () => {
  const plan = claim({
    ...base,
    allowedLanguages: ["VI", "en", "ja"],
    settingsSpeak: "ja-JP",
    settingsListen: "vi",
  });
  assert.equal(plan.body.sourceLanguage, "ja");
  assert.equal(plan.body.externalMeetingLanguage, "vi");
  assert.deepEqual(plan.body.targetLanguages, ["vi", "ja"]);
});

test("a one-language workspace still claims, marked as unable to translate", () => {
  const plan = claim({ ...base, allowedLanguages: ["vi"], settingsSpeak: "en" });
  assert.equal(plan.body.sourceLanguage, "vi");
  assert.equal(plan.body.externalMeetingLanguage, "vi");
  assert.deepEqual(plan.body.targetLanguages, ["vi"]);
  assert.equal(plan.translatable, false);
});
