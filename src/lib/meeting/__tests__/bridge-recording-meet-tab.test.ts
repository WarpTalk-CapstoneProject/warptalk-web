/**
 * B18 (PO 2026-10-02): the recording's Meet window video follows the Meet tab. Picture-in-Picture
 * or another tab takes the video down (audio continues); back on the tab, it is published again.
 * A desktop without the call-state sensor keeps the pre-B18 rule.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MEET_TAB_RETURN_HOLD_MS,
  describeMeetWindowCaptureFailure,
  mayCaptureMeetWindowAtStart,
  meetWindowOnTab,
  meetWindowTabReading,
  shouldPublishMeetWindow,
  shouldRepublishMeetWindow,
} from "../bridge-recording.ts";

const call = (phase: "lobby" | "in-call" | "left" | "unknown", via: "tab" | "pip" | null, meetCode: string | null = "abc-defg-hij") => ({
  phase,
  via,
  meetCode,
});

test("reading: only in-call on the tab is on-tab", () => {
  const read = (c: ReturnType<typeof call> | null) =>
    meetWindowTabReading({ sensorAvailable: true, call: c, roomMeetCode: "abc-defg-hij" });
  assert.equal(read(call("in-call", "tab")), "on-tab");
  assert.equal(read(call("in-call", "pip")), "off-tab");
  assert.equal(read(call("unknown", null)), "off-tab");
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
