import test from "node:test";
import assert from "node:assert/strict";

import { NO_CREATE_PERMISSION_REASON, planBridgeAutoRoom } from "../bridge-auto-room.ts";

const base = {
  meetCode: "jkq-yaax-phw",
  rooms: [],
  canCreateMeetings: true,
  allowedLanguages: [],
};

test("no room code means no room: a picture-in-picture sighting waits for the normal window", () => {
  assert.deepEqual(planBridgeAutoRoom({ ...base, meetCode: null }), { kind: "wait" });
  assert.deepEqual(planBridgeAutoRoom({ ...base, meetCode: "home" }), { kind: "wait" });
});

test("a joinable bridge room for the same call is reused instead of creating another", () => {
  const plan = planBridgeAutoRoom({
    ...base,
    rooms: [
      { id: "other", translationRoomType: "EXTERNAL_BRIDGE", externalMeetingUrl: "https://meet.google.com/abc-defg-hij", joinable: true },
      { id: "ended", translationRoomType: "EXTERNAL_BRIDGE", externalMeetingUrl: "https://meet.google.com/jkq-yaax-phw", joinable: false },
      { id: "event", translationRoomType: "EVENT", externalMeetingUrl: "https://meet.google.com/jkq-yaax-phw", joinable: true },
      { id: "mine", translationRoomType: "EXTERNAL_BRIDGE", externalMeetingUrl: "https://meet.google.com/jkq-yaax-phw?authuser=0", joinable: true },
    ],
  });
  assert.deepEqual(plan, { kind: "reuse", roomId: "mine" });
});

test("a member known not to create meetings is told why, and nothing is sent", () => {
  assert.deepEqual(planBridgeAutoRoom({ ...base, canCreateMeetings: false }), {
    kind: "refuse",
    reason: NO_CREATE_PERMISSION_REASON,
  });
});

test("an unknown permission is not a refusal", () => {
  assert.equal(planBridgeAutoRoom({ ...base, canCreateMeetings: null }).kind, "create");
});

test("the room is a Google Meet bridge room carrying the call's own link", () => {
  const plan = planBridgeAutoRoom({ ...base, settingsSpeak: "vi", settingsListen: "vi" });
  assert.equal(plan.kind, "create");
  assert.deepEqual(plan.request, {
    title: "Google Meet call",
    translationRoomType: "EXTERNAL_BRIDGE",
    sourceLanguage: "vi",
    // The far side first, and named: the server used to seed the stand-in from targetLanguages[0],
    // and this used to send ["vi"] — host and far side on one language, nothing ever translated.
    targetLanguages: ["en", "vi"],
    externalMeetingLanguage: "en",
    externalProvider: "GOOGLE_MEET",
    externalMeetingUrl: "https://meet.google.com/jkq-yaax-phw",
  });
  assert.equal(plan.translatable, true);
});

test("the far side never defaults to the host's own language", () => {
  for (const speak of ["vi", "en", "ja", "ko"]) {
    const plan = planBridgeAutoRoom({ ...base, settingsSpeak: speak });
    assert.equal(plan.kind, "create");
    assert.equal(plan.request.sourceLanguage, speak);
    assert.notEqual(plan.request.externalMeetingLanguage, speak, `host speaks ${speak}`);
    assert.equal(plan.request.targetLanguages[0], plan.request.externalMeetingLanguage);
  }
});

test("an unrestricted workspace defaults the far side to English, or Vietnamese for an English speaker", () => {
  const vi = planBridgeAutoRoom({ ...base, settingsSpeak: "vi-VN" });
  assert.equal(vi.kind, "create");
  assert.equal(vi.request.externalMeetingLanguage, "en");

  const en = planBridgeAutoRoom({ ...base, settingsSpeak: "en" });
  assert.equal(en.kind, "create");
  assert.equal(en.request.externalMeetingLanguage, "vi");
});

test("the user's listen setting is not taken as the far side's language", () => {
  // It says what THEY like to hear — in a bridge room, their own language — not what this call speaks.
  const plan = planBridgeAutoRoom({ ...base, settingsSpeak: "vi", settingsListen: "ja" });
  assert.equal(plan.kind, "create");
  assert.equal(plan.request.externalMeetingLanguage, "en");
});

test("languages never leave the workspace's list - the 403 this replaces", () => {
  const plan = planBridgeAutoRoom({
    ...base,
    allowedLanguages: ["vi", "ja"],
    settingsSpeak: "ko",
    settingsListen: "en",
    locales: ["fr-FR"],
  });
  assert.equal(plan.kind, "create");
  assert.equal(plan.request.sourceLanguage, "vi");
  // The first allowed language that is not the host's.
  assert.equal(plan.request.externalMeetingLanguage, "ja");
  assert.deepEqual(plan.request.targetLanguages, ["ja", "vi"]);
});

test("the user's own settings decide the host's language when the workspace allows it", () => {
  const plan = planBridgeAutoRoom({
    ...base,
    allowedLanguages: ["VI", "en", "ja"],
    settingsSpeak: "ja-JP",
    settingsListen: "vi",
  });
  assert.equal(plan.kind, "create");
  assert.equal(plan.request.sourceLanguage, "ja");
  assert.equal(plan.request.externalMeetingLanguage, "vi");
  assert.deepEqual(plan.request.targetLanguages, ["vi", "ja"]);
});

test("a one-language workspace still gets its room, marked as unable to translate", () => {
  const plan = planBridgeAutoRoom({ ...base, allowedLanguages: ["vi"], settingsSpeak: "en" });
  assert.equal(plan.kind, "create");
  assert.equal(plan.request.sourceLanguage, "vi");
  assert.equal(plan.request.externalMeetingLanguage, "vi");
  assert.deepEqual(plan.request.targetLanguages, ["vi"]);
  assert.equal(plan.translatable, false);
});
