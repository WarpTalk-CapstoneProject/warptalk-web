/**
 * Who the recording template subscribes to.
 *
 * Getting this wrong in either direction is bad in a different way. Letting a bot through puts the
 * translation soup back into the file, which is the bug. Excluding a human loses them from the
 * record of a meeting they spoke at — silently, because nobody watches a recording to check who is
 * missing from it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS,
  MEET_WINDOW_TRACK_NAME,
  isMeetWindowTrack,
  isRecordableParticipant,
  meetWindowShowsPicture,
  resolveEgressDisplayName,
  resolveEgressLayout,
  shouldResubscribeMeetWindow,
} from "../egress-participants.ts";

test("a person is recorded", () => {
  assert.equal(isRecordableParticipant("019ff9e1-e3e2-7024-99b7-6e37c6a18392"), true);
  assert.equal(isRecordableParticipant("huynh.thai.tu"), true);
});

test("every shape of interpreter identity is excluded", () => {
  // The formats tts_worker/livekit_publisher.py emits: with and without a voice key.
  assert.equal(isRecordableParticipant("ai-interpreter-en-019ff9e1-e3e2-7024"), false);
  assert.equal(isRecordableParticipant("ai-interpreter-vi-voice-1a2b3c4d-019ff9e1"), false);
});

test("the STT ingest bot is excluded too", () => {
  // It publishes nothing, but a composite template still lays out a tile for every participant it
  // subscribes to, and an empty tile in a recording is a person who was not there.
  assert.equal(isRecordableParticipant("AIBot_room-abc"), false);
});

test("a human whose name merely contains a prefix is still recorded", () => {
  assert.equal(isRecordableParticipant("someone-ai-interpreter-fan"), true);
  assert.equal(isRecordableParticipant("not-AIBot_anything"), true);
});

test("matching is case-sensitive, because both prefixes are machine-produced", () => {
  // Neither producer emits these, so accepting them would be inventing a rule nothing relies on.
  assert.equal(isRecordableParticipant("AI-INTERPRETER-en-1"), true);
  assert.equal(isRecordableParticipant("aibot_room"), true);
});

test("an absent identity is not a person to record", () => {
  assert.equal(isRecordableParticipant(null), false);
  assert.equal(isRecordableParticipant(undefined), false);
  assert.equal(isRecordableParticipant(""), false);
});

test("resolveEgressDisplayName prints the LiveKit name when there is one", () => {
  assert.equal(resolveEgressDisplayName("Thanh Ha", "019ff9e1-e3e2-7024"), "Thanh Ha");
});

test("resolveEgressDisplayName falls back to identity when the name is blank", () => {
  // Mirrors the fallback meeting-stage.tsx already uses for the live UI:
  // `trackRef.participant.name || identity || fallbackName`.
  assert.equal(resolveEgressDisplayName("", "019ff9e1-e3e2-7024"), "019ff9e1-e3e2-7024");
  assert.equal(resolveEgressDisplayName("   ", "019ff9e1-e3e2-7024"), "019ff9e1-e3e2-7024");
  assert.equal(resolveEgressDisplayName(null, "019ff9e1-e3e2-7024"), "019ff9e1-e3e2-7024");
  assert.equal(resolveEgressDisplayName(undefined, "019ff9e1-e3e2-7024"), "019ff9e1-e3e2-7024");
});

test("resolveEgressDisplayName never returns an empty label", () => {
  assert.equal(resolveEgressDisplayName(null, null), "Participant");
  assert.equal(resolveEgressDisplayName("", ""), "Participant");
  assert.equal(resolveEgressDisplayName(undefined, undefined), "Participant");
});

// WT-910: a bridge recording shows the Google Meet window, full frame.

test("only the track published under the agreed name is the Meet window", () => {
  assert.equal(MEET_WINDOW_TRACK_NAME, "meet-window");
  assert.equal(isMeetWindowTrack("meet-window"), true);
  // An ordinary screen share, a camera, a nameless track: recorded as they always were.
  assert.equal(isMeetWindowTrack("screen_share"), false);
  assert.equal(isMeetWindowTrack("Meet-Window"), false);
  assert.equal(isMeetWindowTrack(""), false);
  assert.equal(isMeetWindowTrack(undefined), false);
  assert.equal(isMeetWindowTrack(null), false);
});

test("the frame is the Meet window only while its video is subscribed", () => {
  assert.equal(resolveEgressLayout([]), "grid");
  assert.equal(resolveEgressLayout([{ kind: "audio" }, { kind: "video" }]), "grid");
  assert.equal(
    resolveEgressLayout([{ kind: "audio" }, { kind: "video", meetWindow: true }]),
    "meet-window",
  );
  // A flag on an audio tile is not a picture.
  assert.equal(resolveEgressLayout([{ kind: "audio", meetWindow: true }]), "grid");
});

// ─────────────────────────────────────────────────────────────────────────────
// WT-910 follow-up: the first bridge recording was 3:25 of black over real audio.
// ─────────────────────────────────────────────────────────────────────────────

test("the Meet window shows only once it has decoded a frame, and not while muted", () => {
  assert.equal(meetWindowShowsPicture({ firstFrameSeen: false, muted: false }), false);
  assert.equal(meetWindowShowsPicture({ firstFrameSeen: true, muted: false }), true);
  assert.equal(meetWindowShowsPicture({ firstFrameSeen: true, muted: true }), false);
});

test("a subscription that never produced a frame is renewed once, after the timeout", () => {
  const base = { firstFrameSeen: false, subscribedAtMs: 0, alreadyRetried: false };
  assert.equal(shouldResubscribeMeetWindow({ ...base, nowMs: MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS - 1 }), false);
  assert.equal(shouldResubscribeMeetWindow({ ...base, nowMs: MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS }), true);
  // Once per publication: a loop of resubscriptions would be churn, not recovery.
  assert.equal(
    shouldResubscribeMeetWindow({ ...base, alreadyRetried: true, nowMs: 60_000 }),
    false,
  );
  // A picture that arrived is never renewed.
  assert.equal(
    shouldResubscribeMeetWindow({ ...base, firstFrameSeen: true, nowMs: 60_000 }),
    false,
  );
});
