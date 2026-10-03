import assert from "node:assert/strict";
import test from "node:test";

import { BargeInDetector, combineRms, rms, type BargeInSample } from "../barge-in.ts";

/**
 * The half-duplex gate used to hold the microphone shut for the whole of every dub, so whatever a
 * listener said while one played was never sent. These pin the two halves of the replacement:
 * a listener talking over a dub gets the microphone back, and the dub coming back in through the
 * microphone does not.
 */

const TICK_MS = 50;

/** A dub's level over time: syllables and short gaps, like speech, never silent for long. */
function dubLevel(at: number): number {
  const phase = (at % 400) / 400;
  return phase < 0.7 ? 0.08 + 0.04 * Math.sin(phase * Math.PI * 4) : 0.015;
}

/** Deterministic jitter in [-1, 1], so the echo is not a perfect copy of the reference. */
function jitter(at: number): number {
  const x = Math.sin(at * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Runs `durationMs` of ticks from `from`, returning the last verdict and when it first opened. */
function run(
  detector: BargeInDetector,
  from: number,
  durationMs: number,
  sample: (at: number) => Omit<BargeInSample, "at">,
): { open: boolean; firstOpenAt: number | null; end: number } {
  let open = detector.open;
  let firstOpenAt: number | null = null;
  let at = from;
  for (; at < from + durationMs; at += TICK_MS) {
    open = detector.step({ at, ...sample(at) });
    if (open && firstOpenAt === null) firstOpenAt = at;
  }
  return { open, firstOpenAt, end: at };
}

/** Laptop speakers: the echo is the dub at a strong, slightly wobbly gain (post-AEC residual). */
const SPEAKER_COUPLING = 0.3;
const echoOnly = (at: number) => ({
  micRms: dubLevel(at) * SPEAKER_COUPLING * (1 + 0.35 * jitter(at)) + 0.001,
  referenceRms: dubLevel(at),
});

/** Speech at a normal distance from a laptop mic, after the browser's AGC. */
const VOICE_RMS = 0.12;

test("rms and combineRms measure what they say", () => {
  assert.equal(rms([]), 0);
  assert.ok(Math.abs(rms([0.5, -0.5, 0.5, -0.5]) - 0.5) < 1e-9);
  // Two equal sources are 3 dB louder, not twice as loud.
  assert.ok(Math.abs(combineRms([0.1, 0.1]) - 0.1 * Math.SQRT2) < 1e-9);
  assert.equal(combineRms([]), 0);
});

test("the dub's own echo never opens the gate, however long it plays", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  const result = run(detector, 0, 60_000, echoOnly);
  assert.equal(result.firstOpenAt, null);
  assert.ok(detector.coupling !== null, "a minute of dub is plenty to calibrate on");
});

test("a listener talking over the dub on speakers gets the microphone back within a breath", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  assert.equal(detector.open, false);

  const result = run(detector, 5_000, 2_000, (at) => ({
    micRms: echoOnly(at).micRms + VOICE_RMS,
    referenceRms: dubLevel(at),
  }));
  assert.equal(result.open, true);
  assert.ok(result.firstOpenAt !== null && result.firstOpenAt - 5_000 <= 250, `opened at ${result.firstOpenAt}`);
});

test("once they stop, the gate shuts again while the dub is still playing", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  run(detector, 5_000, 2_000, (at) => ({ micRms: echoOnly(at).micRms + VOICE_RMS, referenceRms: dubLevel(at) }));
  assert.equal(detector.open, true);

  // Still open shortly after: a pause between words is not the end of a reply.
  run(detector, 7_000, 400, echoOnly);
  assert.equal(detector.open, true);
  const after = run(detector, 7_400, 1_000, echoOnly);
  assert.equal(after.open, false);
});

test("headphones: almost no echo, so ordinary speech opens it at once", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 3_000, (at) => ({ micRms: 0.0015 * (1 + 0.3 * jitter(at)), referenceRms: dubLevel(at) }));
  assert.ok((detector.coupling ?? 1) < 0.05);

  const quietVoice = 0.03; // well below the speakers case — a headset user speaking softly
  const result = run(detector, 3_000, 1_000, (at) => ({ micRms: quietVoice, referenceRms: dubLevel(at) }));
  assert.ok(result.firstOpenAt !== null && result.firstOpenAt - 3_000 <= 250);
});

test("speech no louder than the echo itself does not open it — that is still the echo's call", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  const result = run(detector, 5_000, 3_000, (at) => ({
    micRms: echoOnly(at).micRms + dubLevel(at) * SPEAKER_COUPLING,
    referenceRms: dubLevel(at),
  }));
  assert.equal(result.firstOpenAt, null);
});

test("nothing opens before the echo path has been measured", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  // Loud speech from the very first tick: there is no evidence yet of how loud the echo is.
  const result = run(detector, 0, 1_000, (at) => ({ micRms: VOICE_RMS, referenceRms: dubLevel(at) }));
  assert.equal(result.firstOpenAt, null);
  assert.equal(detector.coupling, null);
});

test("a single loud tick is not a barge-in", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  const result = run(detector, 5_000, 1_000, (at) => ({
    micRms: at === 5_500 ? 0.5 : echoOnly(at).micRms,
    referenceRms: dubLevel(at),
  }));
  assert.equal(result.firstOpenAt, null);
});

test("a reference that hears nothing while a dub is sounding keeps the gate shut", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  detector.endDub();

  // Next dub: the analyser on its track reads silence (e.g. not attached yet). The echo is real,
  // and with a silent reference the predicted echo is zero — so without the staleness rule the
  // echo itself would clear the speech floor and open the gate.
  detector.startDub(10_000, false);
  const result = run(detector, 10_000, 3_000, (at) => ({ micRms: dubLevel(at) * SPEAKER_COUPLING, referenceRms: 0 }));
  assert.equal(result.firstOpenAt, null);
});

test("a listener already mid-sentence when a late dub arrives keeps the microphone", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  detector.endDub();

  detector.startDub(10_000, true);
  assert.equal(detector.open, true);
  const talking = run(detector, 10_000, 2_000, (at) => ({ micRms: echoOnly(at).micRms + VOICE_RMS, referenceRms: dubLevel(at) }));
  assert.equal(talking.open, true);
  // And it is still a barge-in, not a bypass: once they finish, the gate shuts on the echo.
  const finished = run(detector, 12_000, 1_500, echoOnly);
  assert.equal(finished.open, false);
});

test("mid-sentence before calibration: a short grace, then the gate's old behaviour", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, true);
  assert.equal(detector.open, true);
  const result = run(detector, 0, 1_000, (at) => ({ micRms: VOICE_RMS, referenceRms: dubLevel(at) }));
  assert.equal(result.open, false);
});

test("calibration belongs to the echo path, so a new device starts over", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  assert.ok(detector.coupling !== null);
  detector.endDub();
  assert.ok(detector.coupling !== null, "ending one dub does not forget the room");
  detector.reset();
  assert.equal(detector.coupling, null);
});

test("talking during part of the calibration does not lock the listener out", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  // A third of the calibration time the listener is talking (and gated, so it is learned from).
  run(detector, 0, 6_000, (at) => ({
    micRms: echoOnly(at).micRms + (at % 3_000 < 1_000 ? VOICE_RMS : 0),
    referenceRms: dubLevel(at),
  }));
  detector.endDub();
  detector.startDub(10_000, false);
  run(detector, 10_000, 1_000, echoOnly);
  const result = run(detector, 11_000, 1_000, (at) => ({ micRms: echoOnly(at).micRms + VOICE_RMS, referenceRms: dubLevel(at) }));
  assert.equal(result.open, true);
});

test("a long reply over a long dub is not learned as echo and cut off halfway", () => {
  const detector = new BargeInDetector();
  detector.startDub(0, false);
  run(detector, 0, 5_000, echoOnly);
  // Twenty seconds of talking over the dub. Learning from these frames would teach the detector
  // that the listener's own voice is what the echo sounds like, and shut them out mid-reply.
  const result = run(detector, 5_000, 20_000, (at) => ({ micRms: echoOnly(at).micRms + VOICE_RMS, referenceRms: dubLevel(at) }));
  assert.equal(result.open, true);
  assert.ok((detector.coupling ?? 1) < 0.6, `coupling drifted to ${detector.coupling}`);
});
