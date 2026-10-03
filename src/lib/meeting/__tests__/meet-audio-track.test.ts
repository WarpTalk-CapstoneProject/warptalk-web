/**
 * The Google Meet call's sound for a bridge recording: when it is published, and when this user's
 * own voice is in it. Production 2026-10-03: 222 s of digital silence while the user talked in
 * Meet, because the recording heard only their WarpTalk microphone, which was muted.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  meetAudioLocalVoiceOn,
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
