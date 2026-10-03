/**
 * The microphone self-heal (field evidence 2026-10-03: the host's mic was gone from the wire after
 * a LiveKit full reconnect, and nothing noticed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INITIAL_MIC_HEAL,
  MIC_FAULT_CONFIRM_MS,
  checkMicHealth,
  detectMicFault,
  micDeviceLogLine,
  micHealAction,
  micHealBackoffMs,
  micHealOutcomeLine,
  micHealSettled,
  type LocalMicObservation,
} from "../mic-self-heal.ts";

const healthy = { trackSid: "TR_1", muted: false, hasTrack: true, trackEnded: false };
const on = (publication: LocalMicObservation["publication"]): LocalMicObservation => ({
  connected: true,
  intent: true,
  publication,
});

test("each kind of broken publication is named, in order", () => {
  assert.equal(detectMicFault(on(healthy)), null);
  assert.equal(detectMicFault(on(null)), "missing");
  assert.equal(detectMicFault(on({ ...healthy, hasTrack: false })), "no-track");
  assert.equal(detectMicFault(on({ ...healthy, trackEnded: true, trackSid: "" })), "track-ended");
  assert.equal(detectMicFault(on({ ...healthy, trackSid: "" })), "no-server-sid");
  assert.equal(detectMicFault(on({ ...healthy, trackSid: undefined })), "no-server-sid");
  assert.equal(detectMicFault(on({ ...healthy, muted: true })), "muted");
});

test("never acts against an intent that is off or unknown, nor while not connected", () => {
  assert.equal(detectMicFault({ connected: true, intent: false, publication: null }), null);
  assert.equal(detectMicFault({ connected: true, intent: false, publication: { ...healthy, muted: true } }), null);
  assert.equal(detectMicFault({ connected: true, intent: null, publication: null }), null);
  assert.equal(detectMicFault({ connected: false, intent: true, publication: null }), null);
});

test("a missing or muted mic is enabled; a dead or unacknowledged one is re-published", () => {
  assert.equal(micHealAction("missing"), "enable");
  assert.equal(micHealAction("muted"), "enable");
  assert.equal(micHealAction("no-track"), "republish");
  assert.equal(micHealAction("track-ended"), "republish");
  assert.equal(micHealAction("no-server-sid"), "republish");
});

test("a fault is acted on only once it has lasted the confirmation window", () => {
  const first = checkMicHealth(INITIAL_MIC_HEAL, on(null), 1_000, false);
  assert.equal(first.heal, null, "never on first sight");
  assert.equal(first.newlySuspected, "missing");
  const early = checkMicHealth(first.state, on(null), 1_000 + MIC_FAULT_CONFIRM_MS - 1, false);
  assert.equal(early.heal, null);
  assert.equal(early.newlySuspected, null, "logged once, not on every check");
  const due = checkMicHealth(early.state, on(null), 1_000 + MIC_FAULT_CONFIRM_MS, false);
  assert.equal(due.heal, "missing");
});

test("a transient clears without a heal, and a different fault restarts the window", () => {
  const first = checkMicHealth(INITIAL_MIC_HEAL, on(null), 0, false);
  const gone = checkMicHealth(first.state, on(healthy), 1_000, false);
  assert.equal(gone.heal, null);
  assert.equal(gone.cleared, "missing");
  assert.equal(gone.state.suspect, null);

  const other = checkMicHealth(first.state, on({ ...healthy, muted: true }), MIC_FAULT_CONFIRM_MS, false);
  assert.equal(other.heal, null, "a new fault is not confirmed by the old one's age");
  assert.equal(other.newlySuspected, "muted");
});

test("never a second heal while one is in flight", () => {
  const first = checkMicHealth(INITIAL_MIC_HEAL, on(null), 0, false);
  const busy = checkMicHealth(first.state, on(null), MIC_FAULT_CONFIRM_MS, true);
  assert.equal(busy.heal, null);
});

test("failed heals back off and a success resets everything", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(micHealBackoffMs), [5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  const confirmed = checkMicHealth(
    checkMicHealth(INITIAL_MIC_HEAL, on(null), 0, false).state,
    on(null),
    MIC_FAULT_CONFIRM_MS,
    false,
  );
  const failed = micHealSettled(confirmed.state, false, 10_000);
  assert.equal(failed.failures, 1);
  assert.equal(checkMicHealth(failed, on(null), 14_999, false).heal, null, "backing off");
  assert.equal(checkMicHealth(failed, on(null), 15_000, false).heal, "missing");
  assert.deepEqual(micHealSettled(failed, true, 15_500), INITIAL_MIC_HEAL);
});

test("the outcome line says when the next try is", () => {
  assert.match(
    micHealOutcomeLine({ ok: false, fault: "missing", detail: "NotReadableError", failures: 2 }),
    /^\[bridge\] .*NotReadableError; next try in 10 s$/,
  );
  assert.match(micHealOutcomeLine({ ok: true, fault: "muted", detail: "TR_2", failures: 0 }), /back on the wire \(TR_2\)/);
});

test("the device line is said once per change, and flags a virtual cable", () => {
  assert.equal(micDeviceLogLine("Mic A", "Mic A"), null);
  assert.equal(micDeviceLogLine(null, null), null);
  assert.equal(micDeviceLogLine(null, "Mic A"), '[bridge] WarpTalk mic is recording "Mic A"');
  assert.match(micDeviceLogLine("Mic A", "CABLE Output (VB-Audio Virtual Cable)") ?? "", /virtual cable/);
  assert.match(micDeviceLogLine("Mic A", null) ?? "", /no device/);
});
