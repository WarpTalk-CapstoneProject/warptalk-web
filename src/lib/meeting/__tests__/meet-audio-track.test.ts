/**
 * The Google Meet call's sound for a bridge recording: when it is published, and when this user's
 * own voice is in it. Production 2026-10-03: 222 s of digital silence while the user talked in
 * Meet, because the recording heard only their WarpTalk microphone, which was muted.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { rmsToDbfs } from "../barge-in.ts";
import {
  INITIAL_FAR_SPEECH,
  createLatestRequest,
  meetAudioPublicationStatus,
  settleLatest,
  settleWithin,
  MEET_AUDIO_DUCK_GAIN,
  MEET_AUDIO_FAR_SPEECH_HANG_MS,
  farSpeechActive,
  meetAudioLocalVoiceOn,
  meetAudioMicGain,
  meetAudioMicrophoneCandidates,
  reduceFarSpeech,
  shouldReopenMeetAudioMic,
  meetAudioMicrophoneConstraints,
  shouldPublishMeetAudio,
} from "../meet-audio-track.ts";

const base = { isBridgeRoom: true, inboundOpen: true, recording: true, starting: false };

test("published for a running or starting bridge recording while this window captures the call", () => {
  assert.equal(shouldPublishMeetAudio(base), true);
  assert.equal(shouldPublishMeetAudio({ ...base, recording: false, starting: true }), true);
});

test("not published outside a bridge, without the inbound leg, or with nothing recording", () => {
  assert.equal(shouldPublishMeetAudio({ ...base, isBridgeRoom: false }), false);
  assert.equal(shouldPublishMeetAudio({ ...base, inboundOpen: false }), false);
  assert.equal(shouldPublishMeetAudio({ ...base, recording: false }), false);
});

test("Meet unmuted puts the voice in, whatever the WarpTalk microphone is doing", () => {
  // The production file: Meet's button on, the WarpTalk mic muted.
  assert.equal(
    meetAudioLocalVoiceOn({ believed: "in-call", meetMuted: false, warptalkMicrophoneEnabled: false }),
    true,
  );
});

test("Meet muted keeps the voice out: nobody in the call heard it", () => {
  assert.equal(
    meetAudioLocalVoiceOn({ believed: "in-call", meetMuted: true, warptalkMicrophoneEnabled: true }),
    false,
  );
});

test("not in the call (lobby, left) keeps the voice out", () => {
  for (const believed of ["lobby", "left"] as const) {
    assert.equal(
      meetAudioLocalVoiceOn({ believed, meetMuted: false, warptalkMicrophoneEnabled: true }),
      false,
    );
  }
});

test("a Meet that cannot be read follows the WarpTalk microphone (the popup's chip)", () => {
  for (const believed of [null, "in-call"] as const) {
    assert.equal(
      meetAudioLocalVoiceOn({ believed, meetMuted: null, warptalkMicrophoneEnabled: true }),
      true,
    );
    assert.equal(
      meetAudioLocalVoiceOn({ believed, meetMuted: null, warptalkMicrophoneEnabled: false }),
      false,
    );
  }
});

test("the recording's microphone copy uses the meeting's device, with echo cancellation on", () => {
  assert.deepEqual(meetAudioMicrophoneConstraints("headset-abc"), {
    deviceId: { ideal: "headset-abc" },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
  assert.equal("deviceId" in meetAudioMicrophoneConstraints(""), false);
});

// Echo: on laptop speakers the mic copy hears Meet's far side, which this window cannot cancel.

test("the far side is sounding from its first loud sample until the hang runs out", () => {
  let state = reduceFarSpeech(INITIAL_FAR_SPEECH, { dbfs: rmsToDbfs(0), nowMs: 0 });
  assert.equal(farSpeechActive(state, 0), false, "digital silence on the loopback is not speech");
  state = reduceFarSpeech(state, { dbfs: -30, nowMs: 1_000 });
  assert.equal(farSpeechActive(state, 1_000), true);
  // Quiet again: still ducked through the room's tail.
  state = reduceFarSpeech(state, { dbfs: -80, nowMs: 1_200 });
  assert.equal(farSpeechActive(state, 1_000 + MEET_AUDIO_FAR_SPEECH_HANG_MS), true);
  assert.equal(farSpeechActive(state, 1_001 + MEET_AUDIO_FAR_SPEECH_HANG_MS), false);
});

test("the user alone is at full level; under the far side ducked, not cut (double talk)", () => {
  assert.equal(meetAudioMicGain({ localVoiceOn: true, farSpeechActive: false }), 1);
  assert.equal(meetAudioMicGain({ localVoiceOn: true, farSpeechActive: true }), MEET_AUDIO_DUCK_GAIN);
  assert.ok(MEET_AUDIO_DUCK_GAIN > 0 && MEET_AUDIO_DUCK_GAIN < 0.25);
  // Meet not sending the user: silent whatever the far side does.
  assert.equal(meetAudioMicGain({ localVoiceOn: false, farSpeechActive: false }), 0);
  assert.equal(meetAudioMicGain({ localVoiceOn: false, farSpeechActive: true }), 0);
});

test("rmsToDbfs: full scale is 0 dBFS, silence passes no threshold", () => {
  assert.equal(rmsToDbfs(1), 0);
  assert.equal(Math.round(rmsToDbfs(0.01)), -40);
  assert.equal(rmsToDbfs(0), Number.NEGATIVE_INFINITY);
});

// The microphone copy coming back: device switch, unplug.

test("an ended microphone copy is reopened, at most three times a minute", () => {
  let recent: number[] = [];
  for (const at of [0, 10_000, 20_000]) {
    const answer = shouldReopenMeetAudioMic(recent, at);
    assert.equal(answer.reopen, true);
    recent = answer.recent;
  }
  assert.equal(shouldReopenMeetAudioMic(recent, 30_000).reopen, false);
  // A minute after the first, one slot is free again.
  assert.equal(shouldReopenMeetAudioMic(recent, 60_001).reopen, true);
});

test("the microphone copy tries the meeting's device, then the default", () => {
  assert.deepEqual(meetAudioMicrophoneCandidates("headset-abc"), ["headset-abc", ""]);
  assert.deepEqual(meetAudioMicrophoneCandidates(""), [""]);
  assert.deepEqual(meetAudioMicrophoneCandidates("default"), [""]);
});

// Review round 2: only the latest mic open wins; a gone publication is not "published".

test("only the latest microphone request wins; an older one landing late is discarded", () => {
  const requests = createLatestRequest();
  const unplugReopen = requests.begin();
  const deviceSwitch = requests.begin();
  assert.equal(requests.isLatest(unplugReopen), false);
  assert.equal(requests.isLatest(deviceSwitch), true);
});

test("settleWithin reports ok, error and timeout, and never throws", async () => {
  assert.deepEqual(await settleWithin(Promise.resolve(), 50), { outcome: "ok" });
  const failed = await settleWithin(Promise.reject(new Error("no grant")), 50);
  assert.equal(failed.outcome, "error");
  assert.deepEqual(await settleWithin(new Promise(() => {}), 5), { outcome: "timeout" });
});

test("lifecycle: present, republishing (keep the track), lost (tear down), none", () => {
  const base = { hasMix: true, publicationPresent: true, roomConnected: true, liveKitRepublishing: false };
  assert.equal(meetAudioPublicationStatus({ ...base, hasMix: false }), "none");
  assert.equal(meetAudioPublicationStatus(base), "present");
  // LiveKit's republishAllTracks: unpublished for a moment, the same track about to come back.
  assert.equal(meetAudioPublicationStatus({ ...base, publicationPresent: false, liveKitRepublishing: true }), "republishing");
  // Reconnecting: not connected, so not lost either.
  assert.equal(meetAudioPublicationStatus({ ...base, publicationPresent: false, roomConnected: false }), "republishing");
  assert.equal(meetAudioPublicationStatus({ ...base, publicationPresent: false }), "lost");
});

test("settleLatest returns the result of the newest request, waiting for one issued meanwhile", async () => {
  let resolveNewer: (value: string) => void = () => {};
  const older = Promise.resolve("old: no microphone");
  const newer = new Promise<string>((resolve) => (resolveNewer = resolve));
  let latest: Promise<string> = older;
  const settled = settleLatest(() => latest);
  latest = newer; // a newer open superseded it before it settled
  resolveNewer("new: microphone open");
  assert.equal(await settled, "new: microphone open");
  assert.equal(await settleLatest(() => older), "old: no microphone");
});
