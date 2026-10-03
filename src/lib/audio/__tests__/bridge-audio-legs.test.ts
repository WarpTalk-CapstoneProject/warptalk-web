/**
 * The outbound dub reaches the cable without taking the host's own audio there with it.
 *
 * THE BUG THIS GUARDS (production, 2026-10-03)
 *   "They hear my dub, I hear none of theirs." The host's dub was played into the virtual cable by
 *   an <audio> element with the cable as its sink. Chromium plays every remote WebRTC track in a
 *   page through one shared output, and `setSinkId` on any element playing such a track moves all
 *   of them — so the far side's dub, meant for the host's speakers, went into Meet's microphone.
 *
 *   What Chromium does with the sink cannot be tested here; it was measured on the desktop's own
 *   Electron. What CAN be held is the rule that follows from it: a remote track is never given a
 *   sink, it is kept decoding by a muted element, and WebAudio carries it to the device.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import { playRemoteTrackToDevice, playTrackToDevice } from "../bridge-audio-legs.ts";

// A bag of properties, not `typeof globalThis`: the stubs below stand in for three DOM classes and
// model only what the leg touches (the same reasoning as bridge-inbound-source.test.ts).
const globals = globalThis as unknown as Record<string, unknown>;

/** Everything the leg did, in order, across the element and the context. */
let steps: string[] = [];

class FakeStream {
  tracks: unknown[];
  constructor(tracks: unknown[]) {
    this.tracks = tracks;
  }
}

class FakeAudio {
  static made: FakeAudio[] = [];
  muted = false;
  autoplay = false;
  paused = true;
  srcObject: FakeStream | null = null;
  constructor() {
    FakeAudio.made.push(this);
  }
  async setSinkId(sinkId: string) {
    steps.push(`element.setSinkId:${sinkId}`);
  }
  async play() {
    this.paused = false;
    steps.push(`element.play:${this.muted ? "muted" : "audible"}`);
  }
  pause() {
    this.paused = true;
  }
}

class FakeContext {
  static made: FakeContext[] = [];
  /** What `setSinkId` rejects with, as Chromium does for a device that has gone. */
  static sinkError: Error | null = null;
  /** False: `resume()` never settles and the state stays "suspended", as when the browser refuses to start it. */
  static starts = true;

  state = "suspended";
  sink: unknown;
  closes = 0;
  destination = {};

  constructor(options?: { sinkId?: unknown }) {
    this.sink = options?.sinkId;
    steps.push(`context:${JSON.stringify(options?.sinkId)}`);
    FakeContext.made.push(this);
  }
  async setSinkId(sinkId: string) {
    steps.push(`context.setSinkId:${sinkId}`);
    if (FakeContext.sinkError) throw FakeContext.sinkError;
    this.sink = sinkId;
  }
  createMediaStreamSource(stream: FakeStream) {
    return {
      connect: (node: unknown) => {
        steps.push(`connect:${stream.tracks.length}track->${node === this.destination ? "destination" : "?"}@${String(this.sink)}`);
      },
    };
  }
  resume(): Promise<void> {
    if (!FakeContext.starts) return new Promise(() => {});
    this.state = "running";
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closes += 1;
    this.state = "closed";
    return Promise.resolve();
  }
}

const track = { kind: "audio" } as unknown as MediaStreamTrack;

beforeEach(() => {
  steps = [];
  FakeAudio.made = [];
  FakeContext.made = [];
  FakeContext.sinkError = null;
  FakeContext.starts = true;
  globals.Audio = FakeAudio;
  globals.MediaStream = FakeStream;
  globals.AudioContext = FakeContext;
});

afterEach(() => {
  globals.Audio = undefined;
  globals.MediaStream = undefined;
  globals.AudioContext = undefined;
});

test("a remote track is never given a sink: a muted element keeps it decoding and WebAudio carries it", async () => {
  await playRemoteTrackToDevice(track, "cable");

  assert.deepEqual(steps, [
    // Muted, so the host does not hear their own dub; playing, or WebAudio is handed silence.
    "element.play:muted",
    // On no device first, then the cable, and only then connected: never the default output.
    'context:{"type":"none"}',
    "context.setSinkId:cable",
    "connect:1track->destination@cable",
  ]);
  assert.equal(
    steps.some((step) => step.startsWith("element.setSinkId")),
    false,
    "setSinkId on an element playing a remote track moves every remote track in the page",
  );
  assert.equal(FakeAudio.made.length, 1);
  assert.equal(FakeAudio.made[0].srcObject?.tracks[0], track);
});

test("stop releases the element and the device, once", async () => {
  const playback = await playRemoteTrackToDevice(track, "cable");
  const [element] = FakeAudio.made;
  const [context] = FakeContext.made;

  playback.stop();
  playback.stop();

  assert.equal(element.paused, true);
  assert.equal(element.srcObject, null);
  // A context left open keeps the cable busy for the next leg; closed twice it would throw.
  assert.equal(context.closes, 1);
});

test("a device that has gone is an error the caller can show, and nothing is left open", async () => {
  FakeContext.sinkError = new Error("AudioContext.setSinkId(): failed: the device cable is not found.");

  await assert.rejects(playRemoteTrackToDevice(track, "cable"), /not found/);

  assert.equal(FakeAudio.made[0].paused, true);
  assert.equal(FakeAudio.made[0].srcObject, null);
  assert.equal(FakeContext.made[0].closes, 1);
  assert.equal(steps.some((step) => step.startsWith("connect")), false, "nothing may play before the device is set");
});

test("an output the browser will not start is reported instead of left silent", async (t) => {
  FakeContext.starts = false;
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const result = playRemoteTrackToDevice(track, "cable").then(
    () => null,
    (error: unknown) => error,
  );
  // Let the leg reach its wait on the context before the clock moves.
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(2_000);

  const error = await result;
  assert.ok(error instanceof Error);
  assert.match(error.message, /did not start/);
  assert.equal(FakeContext.made[0].closes, 1);
  assert.equal(FakeAudio.made[0].srcObject, null);
});

test("a browser that cannot choose an output for WebAudio is refused before anything is opened", async () => {
  globals.AudioContext = class {};

  await assert.rejects(playRemoteTrackToDevice(track, "cable"), /cannot choose an audio output device/);

  assert.equal(FakeAudio.made.length, 0);
});

test("the host's own microphone, a local track, still gets the cable as its element's sink", async () => {
  const element = (await playTrackToDevice(track, "cable")) as unknown as FakeAudio;

  assert.deepEqual(steps, ["element.setSinkId:cable", "element.play:audible"]);
  assert.equal(element.srcObject?.tracks[0], track);
  assert.equal(FakeContext.made.length, 0);
});

test("the dub is opened as a remote track and the raw microphone as a local one", () => {
  const read = (file: string) => readFileSync(new URL(`../../../components/rooms/live/${file}`, import.meta.url), "utf8");
  const dub = read("bridge-outbound-audio.tsx");
  const mic = read("bridge-outbound-mic.tsx");

  // The one word that decides it. Dropped, the dub goes back onto an element with the cable as
  // its sink, and the host goes back to hearing nothing.
  const dubCall = /export function BridgeOutboundAudio[\s\S]*?useTrackOnDevice\(([\s\S]*?)\);/.exec(dub);
  assert.ok(dubCall, "BridgeOutboundAudio no longer calls useTrackOnDevice — was it moved?");
  assert.match(dubCall[1], /"remote"/);
  assert.match(dub, /source === "remote"\s*\?\s*await playRemoteTrackToDevice\(/);

  const micCall = /export function BridgeOutboundMic[\s\S]*?useTrackOnDevice\(([\s\S]*?)\);/.exec(mic);
  assert.ok(micCall, "BridgeOutboundMic no longer calls useTrackOnDevice — was it moved?");
  assert.doesNotMatch(micCall[1], /"remote"/);
});
