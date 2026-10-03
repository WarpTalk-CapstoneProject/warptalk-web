import assert from "node:assert/strict";
import test from "node:test";

import { MicGate, type GateableTrack } from "../mic-gate.ts";

/**
 * The half-duplex gate once left a microphone silent for the rest of a meeting: it disabled the
 * noise filter's output track, the user muted, the gate period ended without re-enabling it
 * ("their mute outranks ours"), and the user's unmute only ever re-enables the raw capture track.
 * These pin the rule that replaced it: the gate gives back exactly the objects it disabled.
 */

type FakeTrack = GateableTrack & { name: string };

const track = (name: string, enabled = true): FakeTrack => ({ name, enabled });

/** What HalfDuplexMic does each time it asserts the gate. */
function shut<T extends GateableTrack>(gate: MicGate<T>, current: T | null): void {
  if (gate.claim(current) && current) current.enabled = false;
}

/**
 * LiveKit's side of a microphone, as far as `enabled` goes (livekit-client 2.x LocalTrack):
 * mute and unmute flip the RAW track only; what is published is the processor's output when a
 * processor is attached, and the raw track otherwise.
 */
function liveKitMic(options: { processed: boolean }) {
  const raw = track("raw");
  const processed = options.processed ? track("processed") : null;
  const mic = {
    raw,
    processed,
    muted: false,
    get published(): FakeTrack {
      return processed ?? raw;
    },
    /** Whether anything other than silence leaves the machine. */
    get audible(): boolean {
      return raw.enabled && (processed?.enabled ?? true);
    },
    mute() {
      mic.muted = true;
      raw.enabled = false;
    },
    unmute() {
      mic.muted = false;
      raw.enabled = true;
    },
  };
  /** The predicate HalfDuplexMic passes: under a mute, only the processor's output is ours. */
  const gate = new MicGate<FakeTrack>((held) => mic.muted && held !== processed);
  return { mic, gate };
}

test("shutting disables the track and releasing re-enables it", () => {
  const gate = new MicGate();
  const mic = track("mic");

  shut(gate, mic);
  assert.equal(mic.enabled, false);
  assert.equal(gate.holding, true);
  assert.equal(gate.holds(mic), true);

  gate.release();
  assert.equal(mic.enabled, true);
  assert.equal(gate.holding, false);
});

test("WT-936: gate shut, user mutes, gate releases, user unmutes — the published track is live", () => {
  const { mic, gate } = liveKitMic({ processed: true });

  shut(gate, mic.published);
  assert.equal(mic.processed?.enabled, false);

  mic.mute();
  // Re-asserted while muted, as the speaking events keep doing.
  shut(gate, mic.published);
  gate.release();
  // Released regardless of the mute — and still silent, because the mute is on the raw track.
  assert.equal(mic.processed?.enabled, true);
  assert.equal(mic.audible, false);

  mic.unmute();
  assert.equal(mic.processed?.enabled, true);
  assert.equal(mic.audible, true);
});

test("no processor: a release under the user's mute does not un-mute them, and their unmute restores it", () => {
  const { mic, gate } = liveKitMic({ processed: false });

  shut(gate, mic.published);
  assert.equal(mic.raw.enabled, false);

  mic.mute();
  gate.release();
  // The gated track IS the muted track here; re-enabling it would publish a muted user.
  assert.equal(mic.raw.enabled, false);
  assert.equal(gate.holding, false);

  mic.unmute();
  assert.equal(mic.audible, true);
});

test("a track swapped while gated: the old one is restored and the new one gated", () => {
  const gate = new MicGate();
  const before = track("before");
  const after = track("after");

  shut(gate, before);
  shut(gate, after);

  assert.equal(before.enabled, true);
  assert.equal(after.enabled, false);
  assert.equal(gate.holds(before), false);
  assert.equal(gate.holds(after), true);

  gate.release();
  assert.equal(after.enabled, true);
});

test("a noise filter attaching mid-dub does not leave the raw track disabled behind it", () => {
  const raw = track("raw");
  const processed = track("processed");
  const gate = new MicGate<FakeTrack>();

  // No filter yet: the raw capture is what is published, and what is gated.
  shut(gate, raw);
  // The filter attaches; the published track is now its output, fed by the raw one.
  shut(gate, processed);
  assert.equal(raw.enabled, true);
  assert.equal(processed.enabled, false);

  gate.release();
  assert.equal(raw.enabled, true);
  assert.equal(processed.enabled, true);
});

test("the microphone disappearing while gated restores what was held", () => {
  const gate = new MicGate();
  const mic = track("mic");

  shut(gate, mic);
  shut(gate, null);

  assert.equal(mic.enabled, true);
  assert.equal(gate.holding, false);
});

test("release is idempotent", () => {
  const gate = new MicGate();
  const mic = track("mic");

  gate.release();
  shut(gate, mic);
  gate.release();
  assert.equal(mic.enabled, true);

  // Somebody else disables it afterwards; a second release must not undo that.
  mic.enabled = false;
  gate.release();
  gate.release();
  assert.equal(mic.enabled, false);
});

test("a track the gate never disabled is never enabled by it", () => {
  const gate = new MicGate();
  const muted = track("muted-by-user", false);

  shut(gate, muted);
  assert.equal(gate.holds(muted), false);
  shut(gate, muted);
  gate.release();
  assert.equal(muted.enabled, false);

  // Nor when the microphone moves on to another track.
  const other = track("other");
  shut(gate, muted);
  shut(gate, other);
  gate.release();
  assert.equal(muted.enabled, false);
  assert.equal(other.enabled, true);
});

test("the user unmuting inside a gate period: the gate is re-applied, then released properly", () => {
  const { mic, gate } = liveKitMic({ processed: false });

  shut(gate, mic.published);
  mic.mute();
  shut(gate, mic.published);
  mic.unmute();
  // LiveKit re-enabled the raw track under the gate; the next assertion takes it back.
  assert.equal(mic.raw.enabled, true);
  shut(gate, mic.published);
  assert.equal(mic.raw.enabled, false);

  gate.release();
  assert.equal(mic.audible, true);
  assert.equal(gate.holding, false);
});

test("re-asserting the gate on a track it already holds changes nothing", () => {
  const gate = new MicGate();
  const mic = track("mic");

  shut(gate, mic);
  assert.equal(gate.claim(mic), false);
  assert.equal(mic.enabled, false);
  assert.equal(gate.holds(mic), true);

  gate.release();
  assert.equal(mic.enabled, true);
});
