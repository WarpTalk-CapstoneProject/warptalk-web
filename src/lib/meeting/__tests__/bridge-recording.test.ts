/**
 * Recording a bridged Meet call by default (WT-910): when it starts, and when it must not.
 *
 * The expensive mistakes are all "started again": after the host stopped it by hand, after the
 * inbound leg reconnected, on a re-render. And the one in the other direction — recording a room
 * where nobody was shown the checkbox.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bridgeAutoRecordingDecision,
  bridgeRecordingChannelName,
  bridgeRecordingChipView,
  buildBridgeRecordingSnapshot,
  describeMeetWindowCaptureFailure,
  nextBridgeRecordChoice,
  parseBridgeRecordingMessage,
  resolveBridgeRecordingIntent,
  shouldPublishMeetWindow,
  shouldShowRecordingStartNotice,
  type BridgeAutoRecordingInput,
} from "../bridge-recording.ts";

const ROOM = "room-1";
const OTHER = "room-2";

function input(over: Partial<BridgeAutoRecordingInput> = {}): BridgeAutoRecordingInput {
  return {
    roomId: ROOM,
    isBridgeRoom: true,
    inboundOpen: true,
    canControl: true,
    choice: { roomId: ROOM, record: true, token: 1 },
    recording: false,
    starting: false,
    handledToken: null,
    ...over,
  };
}

test("capture open, box checked, may control, nothing recording: start", () => {
  assert.deepEqual(bridgeAutoRecordingDecision(input()), { type: "start", token: 1, attempt: 1 });
});

test("a native meeting is never recorded for you", () => {
  assert.deepEqual(bridgeAutoRecordingDecision(input({ isBridgeRoom: false })), {
    type: "none",
    reason: "not-bridge",
  });
});

test("no answer means no recording: default-on is the checkbox's default, not a licence", () => {
  assert.deepEqual(bridgeAutoRecordingDecision(input({ choice: null })), {
    type: "none",
    reason: "no-choice",
  });
  // Another room's answer is not this room's answer.
  assert.deepEqual(
    bridgeAutoRecordingDecision(input({ choice: { roomId: OTHER, record: true, token: 1 } })),
    { type: "none", reason: "no-choice" },
  );
});

test("opting out is honoured", () => {
  assert.deepEqual(
    bridgeAutoRecordingDecision(input({ choice: { roomId: ROOM, record: false, token: 1 } })),
    { type: "none", reason: "opted-out" },
  );
});

test("a member who cannot control the bridge does not start it", () => {
  assert.deepEqual(bridgeAutoRecordingDecision(input({ canControl: false })), {
    type: "none",
    reason: "cannot-control",
  });
});

test("it waits for capture, not for translation", () => {
  assert.deepEqual(bridgeAutoRecordingDecision(input({ inboundOpen: false })), {
    type: "none",
    reason: "capture-not-open",
  });
});

test("it does not start twice: in flight, already recording", () => {
  assert.equal(bridgeAutoRecordingDecision(input({ starting: true })).type, "none");
  assert.deepEqual(bridgeAutoRecordingDecision(input({ recording: true })), {
    type: "none",
    reason: "already-recording",
  });
});

test("stopped by hand, it stays stopped: re-renders and reconnects of the leg change nothing", () => {
  const handled = { roomId: ROOM, token: 1 };
  // The host stopped it: recording is false again, capture still open.
  assert.deepEqual(bridgeAutoRecordingDecision(input({ handledToken: handled })), {
    type: "none",
    reason: "already-handled",
  });
  // The inbound leg dropped and came back.
  assert.equal(
    bridgeAutoRecordingDecision(input({ handledToken: handled, inboundOpen: false })).type,
    "none",
  );
  assert.equal(
    bridgeAutoRecordingDecision(input({ handledToken: handled, inboundOpen: true })).type,
    "none",
  );
});

test("answering the question again, box checked, is asking again", () => {
  const first = nextBridgeRecordChoice(null, { roomId: ROOM, record: true });
  assert.deepEqual(first, { roomId: ROOM, record: true, token: 1 });
  const second = nextBridgeRecordChoice(first, { roomId: ROOM, record: true });
  assert.equal(second.token, 2);
  assert.deepEqual(
    bridgeAutoRecordingDecision(input({ choice: second, handledToken: { roomId: ROOM, token: 1 } })),
    { type: "start", token: 2, attempt: 1 },
  );
});

test("a handled token from another room does not count here, and a new room counts from one", () => {
  assert.deepEqual(
    bridgeAutoRecordingDecision(input({ handledToken: { roomId: OTHER, token: 9 } })),
    { type: "start", token: 1, attempt: 1 },
  );
  const previous = { roomId: OTHER, record: true, token: 7 };
  assert.deepEqual(nextBridgeRecordChoice(previous, { roomId: ROOM, record: false }), {
    roomId: ROOM,
    record: false,
    token: 1,
  });
});

test("the Meet window is on the wire only while it is being recorded and captured", () => {
  const on = { isBridgeRoom: true, inboundOpen: true, recording: true, starting: false };
  assert.equal(shouldPublishMeetWindow(on), true);
  // Published before the start lands, so the first frame of the file has the picture.
  assert.equal(shouldPublishMeetWindow({ ...on, recording: false, starting: true }), true);
  // Stopped by hand: no reason to keep sending a screen.
  assert.equal(shouldPublishMeetWindow({ ...on, recording: false }), false);
  // The leg closed for good.
  assert.equal(shouldPublishMeetWindow({ ...on, inboundOpen: false }), false);
  assert.equal(shouldPublishMeetWindow({ ...on, isBridgeRoom: false }), false);
});

test("every refusal of the window capture has words for the log", () => {
  for (const reason of [
    "meet-sighting-missing",
    "meet-window-not-found",
    "unsupported-platform",
    "not-main-window",
    "consent-required",
  ] as const) {
    assert.ok(describeMeetWindowCaptureFailure({ ok: false, reason }).length > 0);
  }
  for (const reason of ["no-desktop-method", "capture-failed", "publish-failed"] as const) {
    assert.ok(describeMeetWindowCaptureFailure(reason).length > 0);
  }
});

// ── relay ────────────────────────────────────────────────────────────────────

test("the channel is per room", () => {
  assert.notEqual(bridgeRecordingChannelName(ROOM), bridgeRecordingChannelName(OTHER));
});

test("well-formed messages parse to fresh objects with only the known fields", () => {
  const snapshot = parseBridgeRecordingMessage({
    v: 1,
    kind: "snapshot",
    roomId: ROOM,
    recording: true,
    canStop: false,
    extra: "dropped",
  });
  assert.deepEqual(snapshot, { v: 1, kind: "snapshot", roomId: ROOM, recording: true, canStop: false });
  assert.deepEqual(parseBridgeRecordingMessage({ v: 1, kind: "hello", roomId: ROOM }), {
    v: 1,
    kind: "hello",
    roomId: ROOM,
  });
  assert.deepEqual(parseBridgeRecordingMessage({ v: 1, kind: "stop", roomId: ROOM, x: 1 }), {
    v: 1,
    kind: "stop",
    roomId: ROOM,
  });
  assert.deepEqual(
    parseBridgeRecordingMessage(buildBridgeRecordingSnapshot({ roomId: ROOM, recording: false, canStop: true })),
    { v: 1, kind: "snapshot", roomId: ROOM, recording: false, canStop: true },
  );
});

test("anything else on the channel is ignored, and never throws", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("boom");
      },
    },
  );
  for (const bad of [
    null,
    undefined,
    "stop",
    [],
    hostile,
    { v: 2, kind: "stop", roomId: ROOM },
    { v: 1, kind: "start", roomId: ROOM },
    { v: 1, kind: "stop", roomId: "" },
    { v: 1, kind: "stop" },
    { v: 1, kind: "snapshot", roomId: ROOM, recording: "yes", canStop: true },
    { v: 1, kind: "snapshot", roomId: ROOM, recording: true },
  ]) {
    assert.equal(parseBridgeRecordingMessage(bad), null);
  }
});

test("main honours a stop only while it is recording and this user may stop it", () => {
  const stop = { v: 1, kind: "stop", roomId: ROOM } as const;
  assert.deepEqual(
    resolveBridgeRecordingIntent(stop, { roomId: ROOM, recording: true, canStop: true }),
    { type: "stop" },
  );
  assert.equal(resolveBridgeRecordingIntent(stop, { roomId: ROOM, recording: false, canStop: true }), null);
  assert.equal(resolveBridgeRecordingIntent(stop, { roomId: ROOM, recording: true, canStop: false }), null);
  assert.equal(resolveBridgeRecordingIntent(stop, { roomId: OTHER, recording: true, canStop: true }), null);
});

test("hello is always answered; a snapshot is never an instruction", () => {
  assert.deepEqual(
    resolveBridgeRecordingIntent(
      { v: 1, kind: "hello", roomId: ROOM },
      { roomId: ROOM, recording: false, canStop: false },
    ),
    { type: "republish" },
  );
  assert.equal(
    resolveBridgeRecordingIntent(
      { v: 1, kind: "snapshot", roomId: ROOM, recording: true, canStop: true },
      { roomId: ROOM, recording: true, canStop: true },
    ),
    null,
  );
});

test("the chip shows only for this room, only while recording", () => {
  const recording = buildBridgeRecordingSnapshot({ roomId: ROOM, recording: true, canStop: true });
  assert.deepEqual(bridgeRecordingChipView(recording, ROOM), { kind: "recording", canStop: true });
  assert.deepEqual(bridgeRecordingChipView(recording, OTHER), { kind: "hidden" });
  assert.deepEqual(bridgeRecordingChipView(null, ROOM), { kind: "hidden" });
  assert.deepEqual(
    bridgeRecordingChipView(buildBridgeRecordingSnapshot({ roomId: ROOM, recording: false, canStop: true }), ROOM),
    { kind: "hidden" },
  );
});

// ── WT-916 ───────────────────────────────────────────────────────────────────

test("WT-916: nobody shown the opt-out, nobody recorded — the fallback modal and the device path", () => {
  // Both paths answer the listening question (or need none) WITHOUT a recording checkbox, so no
  // choice ever exists for the room. Everything else is as favourable as it gets: bridge room,
  // host, capture open, nothing recording, nothing handled.
  for (const canControl of [true, false]) {
    for (const inboundOpen of [true, false]) {
      assert.deepEqual(
        bridgeAutoRecordingDecision(input({ choice: null, canControl, inboundOpen })),
        { type: "none", reason: "no-choice" },
      );
    }
  }
  // And a choice is only ever made from an explicit boolean: the default-on lives in the checkbox.
  assert.equal(nextBridgeRecordChoice(null, { roomId: ROOM, record: false }).record, false);
});

test("WT-916: startedAt rides on a recording snapshot only, and only as a number", () => {
  assert.deepEqual(
    buildBridgeRecordingSnapshot({ roomId: ROOM, recording: true, canStop: true, startedAt: 42 }),
    { v: 1, kind: "snapshot", roomId: ROOM, recording: true, canStop: true, startedAt: 42 },
  );
  const stopped = buildBridgeRecordingSnapshot({ roomId: ROOM, recording: false, canStop: true, startedAt: 42 });
  assert.equal("startedAt" in stopped, false);
  const mistyped = parseBridgeRecordingMessage({
    v: 1,
    kind: "snapshot",
    roomId: ROOM,
    recording: true,
    canStop: true,
    startedAt: "now",
  });
  assert.deepEqual(mistyped, { v: 1, kind: "snapshot", roomId: ROOM, recording: true, canStop: true });
});

test("WT-916: the tell-everyone notice shows once per recording start, to host or capturer", () => {
  const started = (startedAt: number, canStop = true) =>
    buildBridgeRecordingSnapshot({ roomId: ROOM, recording: true, canStop, startedAt });

  assert.equal(shouldShowRecordingStartNotice(started(100), ROOM, null), true);
  // Dismissed: gone for this recording, through every republish of the same start.
  assert.equal(shouldShowRecordingStartNotice(started(100), ROOM, 100), false);
  // A new recording is a new start.
  assert.equal(shouldShowRecordingStartNotice(started(200), ROOM, 100), true);
  // A member cannot control the bridge and is not the one to tell the call.
  assert.equal(shouldShowRecordingStartNotice(started(100, false), ROOM, null), false);
  // Gone when the recording stops, for another room, with no snapshot, and against an older main
  // window that does not say when it started.
  assert.equal(
    shouldShowRecordingStartNotice(
      buildBridgeRecordingSnapshot({ roomId: ROOM, recording: false, canStop: true }),
      ROOM,
      null,
    ),
    false,
  );
  assert.equal(shouldShowRecordingStartNotice(started(100), OTHER, null), false);
  assert.equal(shouldShowRecordingStartNotice(null, ROOM, null), false);
  assert.equal(
    shouldShowRecordingStartNotice(
      buildBridgeRecordingSnapshot({ roomId: ROOM, recording: true, canStop: true }),
      ROOM,
      null,
    ),
    false,
  );
});
