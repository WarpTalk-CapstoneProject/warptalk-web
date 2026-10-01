import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_WIDGET_RELAY_VERSION,
  acceptsRejoin,
  bridgeWidgetIsRoomHost,
  bridgeWidgetMeetingStatus,
  bridgeWidgetTranscriptPauseState,
  bridgeWidgetTranslationState,
  buildBridgeWidgetSnapshot,
  canRelayStopTranslation,
  canRelayTranscriptPause,
  initialBridgeWidgetRelayView,
  isBridgeWidgetIntent,
  parseBridgeWidgetMessage,
  reduceBridgeWidgetRelayView,
  type BridgeWidgetRelayEventBody,
  type BridgeWidgetRelayView,
  type BridgeWidgetSnapshot,
  type BridgeWidgetSnapshotFields,
} from "../bridge-widget-relay.ts";

// WT-901 / WT-868: the meeting as the main window runs it, mirrored into the popup at once.

const ROOM = "room-1";
const v = BRIDGE_WIDGET_RELAY_VERSION;

const snapshotWire = (over: Record<string, unknown> = {}) => ({
  v,
  roomId: ROOM,
  type: "snapshot",
  speakLanguage: "vi",
  listenLanguage: "vi",
  voiceEnabled: true,
  browserCapture: { state: "not-required" },
  at: 1_000,
  ...over,
});

const baseFields: BridgeWidgetSnapshotFields = {
  speakLanguage: "vi",
  listenLanguage: "vi",
  voiceEnabled: true,
  browserCaptureState: "not-required",
};

function parsedSnapshot(over: Record<string, unknown>): BridgeWidgetSnapshot {
  const result = parseBridgeWidgetMessage(snapshotWire(over), ROOM);
  assert.ok(result.ok, "the snapshot itself must still parse");
  assert.equal(result.message.type, "snapshot");
  return result.message as unknown as BridgeWidgetSnapshot;
}

const connected = (snapshot: BridgeWidgetSnapshot): BridgeWidgetRelayView =>
  reduceBridgeWidgetRelayView(initialBridgeWidgetRelayView(ROOM), {
    roomId: ROOM,
    type: "snapshot-received",
    snapshot,
  });

const run = (events: BridgeWidgetRelayEventBody[]) =>
  events.reduce<BridgeWidgetRelayView>(
    (view, event) => reduceBridgeWidgetRelayView(view, { roomId: ROOM, ...event }),
    initialBridgeWidgetRelayView(ROOM),
  );

// ── intents ──────────────────────────────────────────────────────────────────

test("the new intents cross the relay, rebuilt field by field", () => {
  for (const [wire, expected] of [
    [{ type: "stop-translation", extra: 1 }, { type: "stop-translation" }],
    [{ type: "set-transcript-paused", paused: true }, { type: "set-transcript-paused", paused: true }],
    [{ type: "set-transcript-paused", paused: false }, { type: "set-transcript-paused", paused: false }],
    [{ type: "rejoin", why: "x" }, { type: "rejoin" }],
    [{ type: "open-setup" }, { type: "open-setup" }],
    [{ type: "open-room-record", url: "https://evil" }, { type: "open-room-record" }],
  ] as const) {
    const result = parseBridgeWidgetMessage({ v, roomId: ROOM, ...wire }, ROOM);
    assert.ok(result.ok, `${wire.type} must parse`);
    assert.deepEqual(result.message, { ...expected, v, roomId: ROOM });
    assert.ok(isBridgeWidgetIntent(result.message), `${wire.type} is an intent`);
  }
});

test("there is no end intent: the popup never ends a bridge meeting", () => {
  for (const type of ["end", "end-meeting", "end-session", "end-room"]) {
    assert.deepEqual(parseBridgeWidgetMessage({ v, roomId: ROOM, type }, ROOM), {
      ok: false,
      reason: "unknown-type",
    });
  }
});

test("set-transcript-paused without a boolean is malformed, not a guess", () => {
  for (const paused of [undefined, "true", 1, null]) {
    const result = parseBridgeWidgetMessage({ v, roomId: ROOM, type: "set-transcript-paused", paused }, ROOM);
    assert.deepEqual(result, { ok: false, reason: "malformed" });
  }
});

test("a rejoin is acted on only while the main window says the reaper let go", () => {
  assert.equal(acceptsRejoin(true), true);
  assert.equal(acceptsRejoin(false), false);
  assert.equal(acceptsRejoin(undefined), false);
});

// ── snapshot fields ──────────────────────────────────────────────────────────

test("an old main window's snapshot, with none of the new fields, still parses unchanged", () => {
  const parsed = parsedSnapshot({});
  for (const key of [
    "translation",
    "transcriptPause",
    "creditsSuspended",
    "creditsSuspendedReason",
    "meetingError",
    "idleReaped",
    "connection",
    "isRoomHost",
  ]) {
    assert.equal(key in parsed, false, `${key} must be absent, not undefined`);
  }
});

test("every new field round-trips through the builder and the validator", () => {
  const fields: BridgeWidgetSnapshotFields = {
    ...baseFields,
    translation: { started: true },
    transcriptPause: { known: true, paused: true, since: "2026-10-01T10:00:00.000Z" },
    creditsSuspended: true,
    creditsSuspendedReason: "insufficient_credits",
    meetingError: "Could not connect to the meeting.",
    idleReaped: true,
    connection: "reconnecting",
    isRoomHost: false,
  };
  const built = buildBridgeWidgetSnapshot(fields, 2_000);
  const result = parseBridgeWidgetMessage({ ...built, v, roomId: ROOM }, ROOM);
  assert.ok(result.ok);
  assert.deepEqual(result.message, { ...built, v, roomId: ROOM });
  assert.deepEqual(built.translation, { started: true });
  assert.deepEqual(built.transcriptPause, {
    known: true,
    paused: true,
    since: "2026-10-01T10:00:00.000Z",
  });
  assert.equal(built.connection, "reconnecting");
  assert.equal(built.isRoomHost, false);
});

test("the builder leaves out what it was not given, and keeps null as 'no error'", () => {
  const bare = buildBridgeWidgetSnapshot(baseFields, 1);
  for (const key of ["translation", "transcriptPause", "creditsSuspended", "meetingError", "idleReaped", "connection", "isRoomHost"]) {
    assert.equal(key in bare, false, `${key} must not be sent when not given`);
  }
  const cleared = buildBridgeWidgetSnapshot({ ...baseFields, meetingError: null, creditsSuspended: false }, 1);
  assert.equal(cleared.meetingError, null);
  assert.equal(cleared.creditsSuspended, false);
  const parsed = parsedSnapshot({ meetingError: null, creditsSuspended: false });
  assert.equal(parsed.meetingError, null);
  assert.equal(parsed.creditsSuspended, false);
});

test("an unreadable new field is dropped on its own; the rest of the snapshot survives", () => {
  const parsed = parsedSnapshot({
    translation: { started: "yes" },
    transcriptPause: { known: true, paused: "no", since: null },
    creditsSuspended: "true",
    creditsSuspendedReason: "x".repeat(65),
    meetingError: 42,
    idleReaped: 1,
    connection: "teleporting",
    isRoomHost: "host",
    inboundHealth: "listening",
  });
  assert.equal(parsed.speakLanguage, "vi");
  assert.equal(parsed.inboundHealth, "listening");
  for (const key of [
    "translation",
    "transcriptPause",
    "creditsSuspended",
    "creditsSuspendedReason",
    "meetingError",
    "idleReaped",
    "connection",
    "isRoomHost",
  ]) {
    assert.equal(key in parsed, false, `${key} must be dropped`);
  }
});

test("only the protocol's keys of a nested field reach the popup", () => {
  const parsed = parsedSnapshot({
    translation: { started: false, sessionId: "s-1" },
    transcriptPause: { known: true, paused: false, since: undefined, by: "u-1" },
  });
  assert.deepEqual(parsed.translation, { started: false });
  assert.deepEqual(parsed.transcriptPause, { known: true, paused: false, since: null });
});

test("a meeting error is bounded and trimmed; a blank one is dropped", () => {
  assert.equal(parsedSnapshot({ meetingError: "  Lost the meeting.  " }).meetingError, "Lost the meeting.");
  assert.equal(parsedSnapshot({ meetingError: "x".repeat(900) }).meetingError?.length, 500);
  assert.equal("meetingError" in parsedSnapshot({ meetingError: "   " }), false);
});

test("every meeting connection state crosses the relay", () => {
  for (const connection of ["connecting", "connected", "reconnecting", "disconnected"]) {
    assert.equal(parsedSnapshot({ connection }).connection, connection);
  }
});

// ── selectors ────────────────────────────────────────────────────────────────

test("translation: the main window's answer wins at once; without it the REST fallback stands", () => {
  const fallback = { started: false };
  const mirrored = connected(parsedSnapshot({ translation: { started: true } }));
  assert.deepEqual(bridgeWidgetTranslationState(mirrored, fallback), { started: true, mirrored: true });
  assert.equal(canRelayStopTranslation(mirrored), true);

  const old = connected(parsedSnapshot({}));
  assert.deepEqual(bridgeWidgetTranslationState(old, fallback), { started: false, mirrored: false });
  assert.equal(canRelayStopTranslation(old), false, "an old main window would drop the intent");

  const none = run([{ type: "no-answer" }]);
  assert.deepEqual(bridgeWidgetTranslationState(none, { started: true }), { started: true, mirrored: false });
  assert.equal(canRelayStopTranslation(none), false);
});

test("a main window that left stops being the answer", () => {
  const gone = run([
    { type: "snapshot-received", snapshot: parsedSnapshot({ translation: { started: true }, isRoomHost: true }) },
    { type: "host-gone" },
  ]);
  assert.deepEqual(bridgeWidgetTranslationState(gone, { started: false }), { started: false, mirrored: false });
  assert.equal(bridgeWidgetIsRoomHost(gone, false), false);
  assert.equal(bridgeWidgetMeetingStatus(gone).idleReaped, false);
});

test("pause: 'not told yet' from the main window does not overrule what the popup already knows", () => {
  const fallback = { known: true, paused: true, since: "2026-10-01T10:00:00.000Z" };
  const unknown = connected(parsedSnapshot({ transcriptPause: { known: false, paused: false, since: null } }));
  assert.deepEqual(bridgeWidgetTranscriptPauseState(unknown, fallback), { ...fallback, mirrored: false });
  assert.equal(canRelayTranscriptPause(unknown), true, "the main window can still be asked to pause");

  const known = connected(parsedSnapshot({ transcriptPause: { known: true, paused: false, since: null } }));
  assert.deepEqual(bridgeWidgetTranscriptPauseState(known, fallback), {
    known: true,
    paused: false,
    since: null,
    mirrored: true,
  });
});

test("room host: the main window's live answer, else the popup's own", () => {
  assert.equal(bridgeWidgetIsRoomHost(connected(parsedSnapshot({ isRoomHost: false })), true), false);
  assert.equal(bridgeWidgetIsRoomHost(connected(parsedSnapshot({ isRoomHost: true })), false), true);
  assert.equal(bridgeWidgetIsRoomHost(connected(parsedSnapshot({})), true), true);
});

test("meeting status claims nothing without a main window, and reads what one says", () => {
  assert.deepEqual(bridgeWidgetMeetingStatus(initialBridgeWidgetRelayView(ROOM)), {
    creditsSuspended: false,
    creditsSuspendedReason: null,
    meetingError: null,
    idleReaped: false,
    connection: null,
  });
  const view = connected(
    parsedSnapshot({
      creditsSuspended: true,
      creditsSuspendedReason: "invoice_overdue",
      meetingError: "Could not connect.",
      idleReaped: true,
      connection: "disconnected",
    }),
  );
  assert.deepEqual(bridgeWidgetMeetingStatus(view), {
    creditsSuspended: true,
    creditsSuspendedReason: "invoice_overdue",
    meetingError: "Could not connect.",
    idleReaped: true,
    connection: "disconnected",
  });
});
