import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INBOUND_NO_SIGNAL_TITLE,
  LISTENING_HOLD_MS,
  NO_SIGNAL_AFTER_OPEN_MS,
  classifyLevel,
  createInboundHealthState,
  inboundNoSignalHint,
  reduceInboundHealth,
  type InboundCapturePath,
  type InboundHealthState,
  type InboundLevelSample,
} from "../bridge-inbound-health.ts";

const ZERO: InboundLevelSample = { rmsDbfs: -Infinity, peakAbs: 0, allZero: true };
const QUIET: InboundLevelSample = { rmsDbfs: -80, peakAbs: 0.0002, allZero: false };
const SPEECH: InboundLevelSample = { rmsDbfs: -25, peakAbs: 0.3, allZero: false };

/** Feeds `sample` every 250 ms from `fromMs` up to and including `toMs`, like the probe does. */
function run(
  state: InboundHealthState,
  sample: InboundLevelSample,
  fromMs: number,
  toMs: number,
  path: InboundCapturePath = "device",
): InboundHealthState {
  let next = state;
  for (let now = fromMs; now <= toMs; now += 250) {
    next = reduceInboundHealth(next, sample, now, { path });
  }
  return next;
}

test("exact zeros are digital zero; a noise floor is quiet, not zero; speech is signal", () => {
  assert.equal(classifyLevel(ZERO), "digital-zero");
  // Belt and braces: a zero peak is zero even if the caller forgot the flag.
  assert.equal(classifyLevel({ rmsDbfs: -Infinity, peakAbs: 0, allZero: false }), "digital-zero");
  assert.equal(classifyLevel(QUIET), "quiet");
  assert.equal(classifyLevel({ rmsDbfs: -60, peakAbs: 0.01, allZero: false }), "signal");
  assert.equal(classifyLevel(SPEECH), "signal");
});

test("a device capture that has carried only zeros is unknown until 50 s, then no-signal", () => {
  let state = createInboundHealthState();
  state = run(state, ZERO, 0, NO_SIGNAL_AFTER_OPEN_MS - 250);
  assert.equal(state.health, "unknown");
  state = reduceInboundHealth(state, ZERO, NO_SIGNAL_AFTER_OPEN_MS, { path: "device" });
  assert.equal(state.health, "no-signal");
});

test("a noise floor alone is proof the cable carries: quiet never becomes no-signal", () => {
  let state = createInboundHealthState();
  state = run(state, QUIET, 0, 10 * 60_000);
  assert.equal(state.health, "quiet");
});

test("speech is listening, held briefly across pauses, then quiet", () => {
  let state = createInboundHealthState();
  state = reduceInboundHealth(state, SPEECH, 1_000, { path: "device" });
  assert.equal(state.health, "listening");
  state = reduceInboundHealth(state, QUIET, 1_000 + LISTENING_HOLD_MS - 250, { path: "device" });
  assert.equal(state.health, "listening");
  state = reduceInboundHealth(state, QUIET, 1_000 + LISTENING_HOLD_MS, { path: "device" });
  assert.equal(state.health, "quiet");
});

test("after signal was heard, zeros alone never warn: a healthy cable in a silent call is all zeros", () => {
  let state = createInboundHealthState();
  state = reduceInboundHealth(state, SPEECH, 0, { path: "device" });
  state = run(state, ZERO, 1_000, 30 * 60_000);
  assert.equal(state.health, "quiet");
});

test("the grace period starts at the first sample, not when the capture opened", () => {
  // The probe reports nothing while its AudioContext is suspended, so a capture whose first sample
  // arrives two minutes after open must still get the full grace from that sample.
  let state = createInboundHealthState();
  const firstSample = 2 * 60_000;
  state = run(state, ZERO, firstSample, firstSample + NO_SIGNAL_AFTER_OPEN_MS - 250);
  assert.equal(state.health, "unknown");
  state = reduceInboundHealth(state, ZERO, firstSample + NO_SIGNAL_AFTER_OPEN_MS, { path: "device" });
  assert.equal(state.health, "no-signal");
});

test("no-signal clears as soon as sound arrives", () => {
  let state = createInboundHealthState();
  state = run(state, ZERO, 0, NO_SIGNAL_AFTER_OPEN_MS);
  assert.equal(state.health, "no-signal");
  state = reduceInboundHealth(state, SPEECH, NO_SIGNAL_AFTER_OPEN_MS + 250, { path: "device" });
  assert.equal(state.health, "listening");
});

test("the loopback path never reports no-signal: its zeros are silence", () => {
  let state = createInboundHealthState();
  state = run(state, ZERO, 0, NO_SIGNAL_AFTER_OPEN_MS - 250, "loopback");
  assert.equal(state.health, "unknown");
  state = run(state, ZERO, NO_SIGNAL_AFTER_OPEN_MS, 20 * 60_000, "loopback");
  assert.equal(state.health, "quiet");

  state = reduceInboundHealth(state, SPEECH, 20 * 60_000 + 250, { path: "loopback" });
  assert.equal(state.health, "listening");
  state = run(state, ZERO, 20 * 60_000 + 500, 40 * 60_000, "loopback");
  assert.equal(state.health, "quiet");
});

test("the reducer does not mutate the state it is given", () => {
  const state = createInboundHealthState();
  const snapshot = { ...state };
  reduceInboundHealth(state, SPEECH, 100, { path: "device" });
  assert.deepEqual(state, snapshot);
});

test("the no-signal hint names Meet's speaker, and the format fix only where the cable has two ends", () => {
  const windows = inboundNoSignalHint({
    meetSpeaker: "Hi-Fi Cable Input",
    inboundCapture: "Hi-Fi Cable Output",
    platform: "windows",
  });
  assert.match(windows, /^If someone is talking in Meet, /);
  assert.match(windows, /Speakers are set to “Hi-Fi Cable Input”/);
  assert.match(windows, /Hi-Fi Cable Input and Hi-Fi Cable Output the same format \(24-bit, 48000 Hz\)/);

  const mac = inboundNoSignalHint({
    meetSpeaker: "WarpTalk Speaker",
    inboundCapture: "WarpTalk Speaker",
    platform: "macos",
  });
  assert.match(mac, /WarpTalk Speaker/);
  assert.doesNotMatch(mac, /format/);
});

test("the no-signal title says \"yet\": it is shown before anything was heard, never as a fault", () => {
  assert.equal(INBOUND_NO_SIGNAL_TITLE, "No sound from Meet yet");
});
