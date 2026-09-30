/**
 * WT-852 — a saved room edit is on the page the moment the save succeeds, not after F5.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { applyRoomSettingsPatch } from "../room-settings-patch.ts";

const room = {
  id: "room-1",
  title: "Meeting Daily",
  description: "Test",
  maxParticipants: 100,
  scheduledAt: "2026-09-27T13:40:00.000Z",
  sourceLanguage: "en",
  targetLanguages: ["en", "vi", "ja"],
  settings: { requiresApproval: true, autoShareRecord: true },
};

test("every edited field is applied", () => {
  const next = applyRoomSettingsPatch(room, {
    title: "Weekly sync",
    description: "Agenda: demo",
    scheduledAt: "2026-09-27T14:30:00.000Z",
    sourceLanguage: "vi",
    targetLanguages: ["vi", "en"],
  });
  assert.equal(next.title, "Weekly sync");
  assert.equal(next.description, "Agenda: demo");
  assert.equal(next.scheduledAt, "2026-09-27T14:30:00.000Z");
  assert.equal(next.sourceLanguage, "vi");
  assert.deepEqual(next.targetLanguages, ["vi", "en"]);
  assert.equal(next.id, "room-1");
});

test("the room it was given is not mutated", () => {
  applyRoomSettingsPatch(room, { title: "Changed" });
  assert.equal(room.title, "Meeting Daily");
});

test("fields the server ignores are ignored here too", () => {
  const next = applyRoomSettingsPatch(room, { title: "   ", targetLanguages: [] });
  assert.equal(next.title, "Meeting Daily");
  assert.deepEqual(next.targetLanguages, ["en", "vi", "ja"]);
});

test("an empty description clears the notes, as the server does", () => {
  assert.equal(applyRoomSettingsPatch(room, { description: "" }).description, "");
});

test("settings is a partial patch over the existing blob", () => {
  const next = applyRoomSettingsPatch(room, { settings: { autoShareRecord: false } });
  assert.deepEqual(next.settings, { requiresApproval: true, autoShareRecord: false });
});
