/**
 * WT-862 — another participant's language change must land on their roster row, whatever casing
 * the hub event and the roster entry carry their id in. An update that matched nobody left the
 * badge on the join-time language with no error anywhere.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { sameUserId, useTranslationRoomStore } from "../translationRoom-store.ts";
import type { ParticipantInfoDto } from "../../types/realtime.ts";

const TUAN = "0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

const tuan: ParticipantInfoDto = {
  userId: TUAN,
  displayName: "Trần Mạnh Tuấn",
  speakLanguage: "en",
  listenLanguage: "en",
  isMuted: false,
  joinedAt: "2026-09-27T09:30:00Z",
};

const row = () => useTranslationRoomStore.getState().participants[0];

beforeEach(() => {
  useTranslationRoomStore.getState().setParticipants([tuan]);
});

test("a listen-language change updates that participant's row", () => {
  useTranslationRoomStore.getState().updateParticipantListenLanguage(TUAN, "ja");
  assert.equal(row().listenLanguage, "ja");
  assert.equal(row().speakLanguage, "en");
});

test("a speak-language change updates that participant's row", () => {
  useTranslationRoomStore.getState().updateParticipantSpeakLanguage(TUAN, "ja");
  assert.equal(row().speakLanguage, "ja");
});

test("the event's id casing does not decide whether the update lands", () => {
  useTranslationRoomStore.getState().updateParticipantListenLanguage(TUAN.toUpperCase(), "ja");
  assert.equal(row().listenLanguage, "ja");
  useTranslationRoomStore.getState().updateParticipantMute(TUAN.toUpperCase(), true);
  assert.equal(row().isMuted, true);
});

test("sameUserId: case-insensitive, and never true for a missing id", () => {
  assert.equal(sameUserId(TUAN, TUAN.toUpperCase()), true);
  assert.equal(sameUserId(TUAN, "someone-else"), false);
  assert.equal(sameUserId(undefined, undefined), false);
  assert.equal(sameUserId("", ""), false);
});
