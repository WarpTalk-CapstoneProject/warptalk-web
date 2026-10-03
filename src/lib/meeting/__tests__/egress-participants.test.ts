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
  BRIDGE_STAND_IN_IDENTITY,
  MEET_AUDIO_TRACK_NAME,
  MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS,
  MEET_WINDOW_HOLD_LOOKBACK_MS,
  MEET_WINDOW_SNAPSHOT_INTERVAL_MS,
  MEET_WINDOW_SNAPSHOT_RING,
  MEET_WINDOW_TRACK_NAME,
  isBridgeRecording,
  isMeetAudioTrack,
  isMeetWindowTrack,
  isRecordableParticipant,
  isRecordedBridgeDub,
  meetWindowShowsPicture,
  meetWindowStage,
  pickHeldMeetFrame,
  meetWindowSlateAudioLine,
  resolveEgressAudioContext,
  resolveEgressDisplayName,
  resolveEgressLayout,
  shouldRecordAudio,
  shouldResubscribeMeetWindow,
} from "../egress-participants.ts";
import { BRIDGE_STAND_IN_USER_ID } from "../bridge-far-side-language.ts";

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

// ─────────────────────────────────────────────────────────────────────────────
// Production bridge recording, 03 Oct: 0–3.4 s and 0:34–3:14 were the native grid
// ("External Meeting" + the host, "Camera is off") instead of Google Meet.
// ─────────────────────────────────────────────────────────────────────────────

const HOST = "019ff9e1-e3e2-7024-99b7-6e37c6a18392";

test("the template's stand-in identity is the one the backend and the web client use", () => {
  assert.equal(BRIDGE_STAND_IN_IDENTITY, BRIDGE_STAND_IN_USER_ID);
});

test("a room with the bridge stand-in in it is a bridge recording, before any window is published", () => {
  // The recorder connects with the stand-in already there: this is what keeps 0–3.4 s off the grid.
  assert.equal(
    isBridgeRecording({ participantIdentities: [HOST, BRIDGE_STAND_IN_IDENTITY], meetWindowPublished: false }),
    true,
  );
  // A published Meet window says so too (only a bridge room's publisher ever names one).
  assert.equal(isBridgeRecording({ participantIdentities: [HOST], meetWindowPublished: true }), true);
  // A native meeting is neither.
  assert.equal(isBridgeRecording({ participantIdentities: [HOST, "huynh.thai.tu"], meetWindowPublished: false }), false);
  assert.equal(isBridgeRecording({ participantIdentities: new Map([[HOST, 1]]).keys(), meetWindowPublished: false }), false);
});

test("a bridge recording keeps the Meet stage with no Meet window subscribed", () => {
  // The bug: no window track -> grid. A bridge room's stage never becomes the grid.
  assert.equal(resolveEgressLayout([{ kind: "audio" }, { kind: "audio" }], { bridge: true }), "meet-window");
  assert.equal(resolveEgressLayout([], { bridge: true }), "meet-window");
  // A native meeting is untouched.
  assert.equal(resolveEgressLayout([{ kind: "audio" }, { kind: "video" }], { bridge: false }), "grid");
  assert.equal(resolveEgressLayout([{ kind: "video", meetWindow: true }], { bridge: false }), "meet-window");
});

test("the stage is the live window, else the held frame, else the slate — never tiles", () => {
  const live = { hasTrack: true, firstFrameSeen: true, muted: false, hasHeldFrame: false };
  assert.equal(meetWindowStage(live), "live");
  // The window was taken down (B18, a capture that ended, a dropped connection).
  assert.equal(meetWindowStage({ ...live, hasTrack: false, hasHeldFrame: true }), "held");
  assert.equal(meetWindowStage({ ...live, hasTrack: false, hasHeldFrame: false }), "slate");
  // Muted by the publisher, or a re-published window that has not decoded yet: hold, do not blank.
  assert.equal(meetWindowStage({ ...live, muted: true, hasHeldFrame: true }), "held");
  assert.equal(meetWindowStage({ ...live, firstFrameSeen: false, hasHeldFrame: true }), "held");
  // The first seconds: nothing of Meet seen yet.
  assert.equal(meetWindowStage({ hasTrack: true, firstFrameSeen: false, muted: false, hasHeldFrame: false }), "slate");
  assert.equal(meetWindowStage({ hasTrack: false, firstFrameSeen: false, muted: false, hasHeldFrame: false }), "slate");
});

test("the held frame predates the loss by the lookback, so another tab is never frozen on screen", () => {
  const at = (atMs: number) => ({ atMs });
  const lostAtMs = 100_000;
  const snapshots = [90_000, 94_000, 95_000, 96_000, 97_000, 98_000, 99_000].map(at);
  const { held, keep } = pickHeldMeetFrame(snapshots, lostAtMs);
  // 96 s is exactly the lookback before the loss; 97–99 s may already show the other tab.
  assert.equal(MEET_WINDOW_HOLD_LOOKBACK_MS, 4_000);
  assert.deepEqual(held, at(96_000));
  // The suspect ones are gone for good: a later loss can never hold them either.
  assert.deepEqual(keep.map((s) => s.atMs), [90_000, 94_000, 95_000, 96_000]);
  assert.deepEqual(pickHeldMeetFrame(keep, 200_000).held, at(96_000));
});

test("a picture that was live for less than the lookback holds nothing (the slate, or the previous frame)", () => {
  const { held, keep } = pickHeldMeetFrame([{ atMs: 98_500 }, { atMs: 99_500 }], 100_000);
  assert.equal(held, null);
  assert.deepEqual(keep, []);
  assert.deepEqual(pickHeldMeetFrame([], 100_000), { held: null, keep: [] });
});

test("the snapshot ring reaches back past the lookback", () => {
  assert.ok(MEET_WINDOW_SNAPSHOT_RING * MEET_WINDOW_SNAPSHOT_INTERVAL_MS > MEET_WINDOW_HOLD_LOOKBACK_MS + MEET_WINDOW_SNAPSHOT_INTERVAL_MS);
});

// Bridge recording AUDIO: the call itself (meet-audio) and its dubs.

const STAND_IN = BRIDGE_STAND_IN_IDENTITY;
const MEMBER = "019ff9e1-e3e2-7024-99b7-000000000002";
const DUB_FOR_FAR_SIDE = `ai-interpreter-vi-${STAND_IN}`;
const DUB_FOR_HOST = `ai-interpreter-en-${HOST}`;
const DUB_VOICE_VARIANT = `ai-interpreter-vi-voice-1a2b3c4d-${STAND_IN}`;

test("only the track published under the agreed name is the Meet call audio", () => {
  assert.equal(MEET_AUDIO_TRACK_NAME, "meet-audio");
  assert.equal(isMeetAudioTrack("meet-audio"), true);
  assert.equal(isMeetAudioTrack("meet-window"), false);
  assert.equal(isMeetAudioTrack(""), false);
  assert.equal(isMeetAudioTrack(undefined), false);
});

test("a room is a bridge when the stand-in, the Meet window or the Meet audio is in it", () => {
  assert.deepEqual(resolveEgressAudioContext([{ identity: HOST, trackNames: [""] }]), {
    bridge: false,
    meetAudio: false,
  });
  assert.equal(resolveEgressAudioContext([{ identity: STAND_IN, trackNames: [""] }]).bridge, true);
  assert.equal(
    resolveEgressAudioContext([{ identity: HOST, trackNames: ["", "meet-window"] }]).bridge,
    true,
  );
  assert.deepEqual(resolveEgressAudioContext([{ identity: HOST, trackNames: ["", "meet-audio"] }]), {
    bridge: true,
    meetAudio: true,
  });
});

test("a published meet-audio marks a bridge recording, through the same isBridgeRecording", () => {
  assert.equal(
    isBridgeRecording({ participantIdentities: [HOST], meetWindowPublished: false, meetAudioPublished: true }),
    true,
  );
});

test("the layout's latch carries into the audio: a bridge stays a bridge after the stand-in leaves", () => {
  // End of the call: the stand-in is gone and nothing names the Meet, but the file is still a
  // bridge recording, so its dubs are still mixed.
  assert.deepEqual(resolveEgressAudioContext([{ identity: HOST, trackNames: [""] }], { latched: true }), {
    bridge: true,
    meetAudio: false,
  });
});

test("a bot naming a track meet-audio does not take over the mix", () => {
  assert.deepEqual(
    resolveEgressAudioContext([{ identity: DUB_FOR_HOST, trackNames: ["meet-audio"] }]),
    { bridge: false, meetAudio: false },
  );
});

test("a native meeting records every person's audio and no dub, exactly as before", () => {
  const native = { bridge: false, meetAudio: false };
  assert.equal(shouldRecordAudio({ identity: HOST, trackName: "" }, native), true);
  assert.equal(shouldRecordAudio({ identity: MEMBER, trackName: "" }, native), true);
  assert.equal(shouldRecordAudio({ identity: DUB_FOR_HOST, trackName: "" }, native), false);
  assert.equal(shouldRecordAudio({ identity: "AIBot_room", trackName: "" }, native), false);
});

test("a bridge recording with meet-audio mixes the call once, plus each default dub", () => {
  const bridge = { bridge: true, meetAudio: true };
  assert.equal(shouldRecordAudio({ identity: HOST, trackName: "meet-audio" }, bridge), true);
  // Already inside meet-audio: the host's WarpTalk mic, the stand-in's capture, a member's mic.
  assert.equal(shouldRecordAudio({ identity: HOST, trackName: "" }, bridge), false);
  assert.equal(shouldRecordAudio({ identity: STAND_IN, trackName: "" }, bridge), false);
  assert.equal(shouldRecordAudio({ identity: MEMBER, trackName: "" }, bridge), false);
  // The translation is part of a bridge recording (product decision 2026-10-03).
  assert.equal(shouldRecordAudio({ identity: DUB_FOR_FAR_SIDE, trackName: "" }, bridge), true);
  assert.equal(shouldRecordAudio({ identity: DUB_FOR_HOST, trackName: "" }, bridge), true);
  // The same sentence again in a listener-picked voice would double the dub.
  assert.equal(shouldRecordAudio({ identity: DUB_VOICE_VARIANT, trackName: "" }, bridge), false);
  assert.equal(shouldRecordAudio({ identity: "AIBot_room", trackName: "" }, bridge), false);
});

test("a bridge recording without meet-audio (older client) keeps WarpTalk's tracks, and the dubs", () => {
  const bridge = { bridge: true, meetAudio: false };
  assert.equal(shouldRecordAudio({ identity: HOST, trackName: "" }, bridge), true);
  assert.equal(shouldRecordAudio({ identity: STAND_IN, trackName: "" }, bridge), true);
  assert.equal(shouldRecordAudio({ identity: DUB_FOR_FAR_SIDE, trackName: "" }, bridge), true);
});

test("only an interpreter's default track is a recorded bridge dub", () => {
  assert.equal(isRecordedBridgeDub(DUB_FOR_FAR_SIDE), true);
  assert.equal(isRecordedBridgeDub(DUB_VOICE_VARIANT), false);
  assert.equal(isRecordedBridgeDub(HOST), false);
  assert.equal(isRecordedBridgeDub("AIBot_room"), false);
  assert.equal(isRecordedBridgeDub(null), false);
});

test("the slate says which audio is being recorded, never more than that", () => {
  assert.equal(
    meetWindowSlateAudioLine({ meetAudio: true, otherAudio: true }),
    "The Google Meet call audio is being recorded.",
  );
  assert.match(meetWindowSlateAudioLine({ meetAudio: false, otherAudio: true }), /not the Meet call/);
  assert.equal(
    meetWindowSlateAudioLine({ meetAudio: false, otherAudio: false }),
    "No audio is reaching the recording yet.",
  );
  for (const line of [
    meetWindowSlateAudioLine({ meetAudio: false, otherAudio: true }),
    meetWindowSlateAudioLine({ meetAudio: false, otherAudio: false }),
  ]) {
    assert.doesNotMatch(line, /^Audio is being recorded/);
  }
});
