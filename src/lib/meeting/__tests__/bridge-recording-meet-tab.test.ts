/**
 * B18 (PO 2026-10-02): the recording's Meet window video follows the Meet tab. Picture-in-Picture
 * or another tab takes the video down (audio continues); back on the tab, it is published again.
 * A desktop without the call-state sensor keeps the pre-B18 rule.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BRIDGE_PUBLISH_IN_FLIGHT,
  MEET_TAB_RETURN_HOLD_MS,
  MEET_WINDOW_RECOVERY_DELAYS_MS,
  MEET_WINDOW_SUPERVISE_INTERVAL_MS,
  classifySupervisedPublish,
  describeMeetWindowCaptureFailure,
  mayCaptureMeetWindowAtStart,
  meetWindowOnTab,
  meetWindowRecoveryDelayMs,
  meetWindowTabReading,
  nextSupervisedPublishDelayMs,
  shouldPublishMeetWindow,
  shouldRepublishMeetWindow,
  shouldSuperviseMeetWindow,
} from "../bridge-recording.ts";

const call = (phase: "lobby" | "in-call" | "left" | "unknown", via: "tab" | "pip" | null, meetCode: string | null = "abc-defg-hij") => ({
  phase,
  via,
  meetCode,
});

test("reading: only in-call (or unreadable) on the tab is on-tab", () => {
  const read = (c: ReturnType<typeof call> | null) =>
    meetWindowTabReading({ sensorAvailable: true, call: c, roomMeetCode: "abc-defg-hij" });
  assert.equal(read(call("in-call", "tab")), "on-tab");
  assert.equal(read(call("in-call", "pip")), "off-tab");
  // A tab switch (no Meet surface at all) or a failed probe: off.
  assert.equal(read(call("unknown", null)), "off-tab");
  assert.equal(read(call("unknown", "pip")), "off-tab");
  assert.equal(read(call("lobby", "tab")), "off-tab");
  assert.equal(read(call("left", "tab")), "off-tab");
  // No reading yet from a desktop that has the sensor: fail closed.
  assert.equal(read(null), "off-tab");
});

test("reading: another call's reading is off-tab; a missing code on either side is trusted", () => {
  assert.equal(
    meetWindowTabReading({ sensorAvailable: true, call: call("in-call", "tab", "zzz-zzzz-zzz"), roomMeetCode: "abc-defg-hij" }),
    "off-tab",
  );
  assert.equal(
    meetWindowTabReading({ sensorAvailable: true, call: call("in-call", "tab", "ABC-DEFG-HIJ"), roomMeetCode: "abc-defg-hij" }),
    "on-tab",
  );
  assert.equal(meetWindowTabReading({ sensorAvailable: true, call: call("in-call", "tab", null), roomMeetCode: "abc-defg-hij" }), "on-tab");
  assert.equal(meetWindowTabReading({ sensorAvailable: true, call: call("in-call", "tab"), roomMeetCode: null }), "on-tab");
});

test("reading: no sensor (older desktop) is null whatever it is given", () => {
  assert.equal(meetWindowTabReading({ sensorAvailable: false, call: call("in-call", "pip"), roomMeetCode: null }), null);
  assert.equal(meetWindowTabReading({ sensorAvailable: false, call: null, roomMeetCode: null }), null);
});

test("on-tab counts only once settled; off-tab at once; no sensor stays null", () => {
  assert.equal(meetWindowOnTab("on-tab", true), true);
  assert.equal(meetWindowOnTab("on-tab", false), false);
  assert.equal(meetWindowOnTab("off-tab", true), false);
  assert.equal(meetWindowOnTab(null, true), null);
  assert.equal(meetWindowOnTab(null, false), null);
  assert.ok(MEET_TAB_RETURN_HOLD_MS >= 500 && MEET_TAB_RETURN_HOLD_MS <= 3_000);
});

const base = { isBridgeRoom: true, inboundOpen: true, recording: true, starting: false };

test("publish: off the tab the video goes down; null keeps the old rule", () => {
  assert.equal(shouldPublishMeetWindow({ ...base, meetOnTab: false }), false);
  assert.equal(shouldPublishMeetWindow({ ...base, meetOnTab: true }), true);
  assert.equal(shouldPublishMeetWindow({ ...base, meetOnTab: null }), true);
  assert.equal(shouldPublishMeetWindow(base), true);
  // On the tab changes nothing about the other conditions.
  assert.equal(shouldPublishMeetWindow({ ...base, recording: false, meetOnTab: true }), false);
  assert.equal(shouldPublishMeetWindow({ ...base, inboundOpen: false, meetOnTab: true }), false);
});

test("republish: only with the sensor, back on the tab, once the recording is on", () => {
  assert.equal(shouldRepublishMeetWindow({ ...base, meetOnTab: true }), true);
  assert.equal(shouldRepublishMeetWindow({ ...base, meetOnTab: false }), false);
  // Older desktop: never re-published, as before B18.
  assert.equal(shouldRepublishMeetWindow({ ...base, meetOnTab: null }), false);
  // The start chain publishes the first picture itself.
  assert.equal(shouldRepublishMeetWindow({ ...base, starting: true, meetOnTab: true }), false);
  assert.equal(shouldRepublishMeetWindow({ ...base, recording: false, meetOnTab: true }), false);
  assert.equal(shouldRepublishMeetWindow({ ...base, inboundOpen: false, meetOnTab: true }), false);
  assert.equal(shouldRepublishMeetWindow({ ...base, isBridgeRoom: false, meetOnTab: true }), false);
});

test("a PiP -> tab -> PiP sequence: down, (held) up, down", () => {
  const onTab = (c: ReturnType<typeof call>, settled: boolean) =>
    meetWindowOnTab(meetWindowTabReading({ sensorAvailable: true, call: c, roomMeetCode: "abc-defg-hij" }), settled);
  const pip = onTab(call("in-call", "pip"), true);
  assert.equal(shouldPublishMeetWindow({ ...base, meetOnTab: pip }), false);
  const backNotHeld = onTab(call("in-call", "tab"), false);
  assert.equal(shouldRepublishMeetWindow({ ...base, meetOnTab: backNotHeld }), false);
  const backHeld = onTab(call("in-call", "tab"), true);
  assert.equal(shouldRepublishMeetWindow({ ...base, meetOnTab: backHeld }), true);
  const pipAgain = onTab(call("in-call", "pip"), true);
  assert.equal(shouldPublishMeetWindow({ ...base, meetOnTab: pipAgain }), false);
});

test("start: audio-only when off the tab, the window otherwise (or with no sensor)", () => {
  assert.equal(mayCaptureMeetWindowAtStart(false), false);
  assert.equal(mayCaptureMeetWindowAtStart(true), true);
  assert.equal(mayCaptureMeetWindowAtStart(null), true);
});

test("the desktop's meet-not-on-tab refusal reads as a log line", () => {
  assert.match(describeMeetWindowCaptureFailure({ ok: false, reason: "meet-not-on-tab" }), /not on its tab/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Production bridge recording, 03 Oct: the window went down at 0:34 with Meet plainly on its tab,
// and never came back for 2.5 minutes.
// ─────────────────────────────────────────────────────────────────────────────

test("reading: Meet on its tab with buttons the desktop could not read stays on-tab", () => {
  // classifyMeetSurface's empty-tree / listing-truncated / controls-unrecognised: the active tab IS
  // meet.google.com/<this code>, so the window shows Meet. Taking the picture down for it is the bug.
  const read = (c: ReturnType<typeof call>) =>
    meetWindowTabReading({ sensorAvailable: true, call: c, roomMeetCode: "abc-defg-hij" });
  assert.equal(read(call("unknown", "tab")), "on-tab");
  // ...but only for this room's call.
  assert.equal(read(call("unknown", "tab", "zzz-zzzz-zzz")), "off-tab");
  // A flap in-call -> unknown (on the tab) -> in-call never takes the picture down.
  for (const c of [call("in-call", "tab"), call("unknown", "tab"), call("in-call", "tab")]) {
    assert.equal(shouldPublishMeetWindow({ ...base, meetOnTab: meetWindowOnTab(read(c), true) }), true);
  }
});

test("supervise: whenever a running recording wants the picture, with or without the tab sensor", () => {
  assert.equal(shouldSuperviseMeetWindow({ ...base, meetOnTab: true }), true);
  // An older desktop (no sensor) used to never re-publish after a drop.
  assert.equal(shouldSuperviseMeetWindow({ ...base, meetOnTab: null }), true);
  // B18 still wins: off the tab nothing is brought back.
  assert.equal(shouldSuperviseMeetWindow({ ...base, meetOnTab: false }), false);
  // The start chain publishes the first picture itself; nothing is kept up without a recording.
  assert.equal(shouldSuperviseMeetWindow({ ...base, starting: true, meetOnTab: true }), false);
  assert.equal(shouldSuperviseMeetWindow({ ...base, recording: false, meetOnTab: true }), false);
  assert.equal(shouldSuperviseMeetWindow({ ...base, inboundOpen: false, meetOnTab: true }), false);
  assert.equal(shouldSuperviseMeetWindow({ ...base, isBridgeRoom: false, meetOnTab: true }), false);
});

test("supervise: a dropped window is retried with a bounded back-off", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 50].map(meetWindowRecoveryDelayMs),
    [2_000, 4_000, 8_000, 15_000, 15_000, 15_000],
  );
  assert.equal(meetWindowRecoveryDelayMs(0), MEET_WINDOW_RECOVERY_DELAYS_MS[0]);
  // Never longer than 15 s without a picture once the desktop can give one again.
  assert.ok(Math.max(...MEET_WINDOW_RECOVERY_DELAYS_MS) <= 15_000);
  assert.ok(MEET_WINDOW_SUPERVISE_INTERVAL_MS <= 5_000);
});

test("supervise: an attempt already in flight is pending, never a failure that backs off", () => {
  assert.equal(classifySupervisedPublish("published"), "up");
  assert.equal(classifySupervisedPublish(BRIDGE_PUBLISH_IN_FLIGHT), "pending");
  assert.equal(classifySupervisedPublish("the meeting is not connected"), "failed");
  assert.equal(classifySupervisedPublish("no-publisher"), "failed");
});

test("supervise: the steady interval while up, the shared back-off after failures (window and audio)", () => {
  assert.equal(nextSupervisedPublishDelayMs(0), MEET_WINDOW_SUPERVISE_INTERVAL_MS);
  assert.deepEqual(
    [1, 2, 3, 4, 9].map(nextSupervisedPublishDelayMs),
    [2_000, 4_000, 8_000, 15_000, 15_000],
  );
});
