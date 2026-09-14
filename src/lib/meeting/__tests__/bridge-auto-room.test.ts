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
    targetLanguages: ["vi"],
    externalProvider: "GOOGLE_MEET",
    externalMeetingUrl: "https://meet.google.com/jkq-yaax-phw",
  });
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
  assert.deepEqual(plan.request.targetLanguages, ["vi"]);
});

test("the user's own settings decide the defaults when the workspace allows them", () => {
  const plan = planBridgeAutoRoom({
    ...base,
    allowedLanguages: ["VI", "en", "ja"],
    settingsSpeak: "vi-VN",
    settingsListen: "ja",
  });
  assert.equal(plan.kind, "create");
  assert.equal(plan.request.sourceLanguage, "vi");
  assert.deepEqual(plan.request.targetLanguages, ["vi", "ja"]);
});
