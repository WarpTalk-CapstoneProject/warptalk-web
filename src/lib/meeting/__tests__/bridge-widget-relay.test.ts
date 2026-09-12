import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";

import {
  BRIDGE_WIDGET_RELAY_VERSION,
  acceptsBrowserCaptureAnswer,
  applyRelayedLanguagePick,
  bridgeWidgetReaderLanguage,
  bridgeWidgetRelayChannelName,
  bridgeWidgetShownLanguage,
  buildBridgeWidgetSnapshot,
  canRelayLanguagePick,
  initialBridgeWidgetRelayView,
  isBridgeWidgetIntent,
  openBridgeWidgetRelay,
  parseBridgeWidgetMessage,
  reduceBridgeWidgetRelayView,
  type BridgeWidgetMessage,
  type BridgeWidgetRelayEventBody,
  type BridgeWidgetRelayView,
  type BridgeWidgetSnapshot,
} from "../bridge-widget-relay.ts";

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

const snapshot = (over: Partial<BridgeWidgetSnapshot> = {}): BridgeWidgetSnapshot => ({
  speakLanguage: "vi",
  listenLanguage: "vi",
  voiceEnabled: true,
  browserCapture: { state: "not-required" },
  at: 1_000,
  ...over,
});

const run = (events: BridgeWidgetRelayEventBody[], roomId = ROOM) =>
  events.reduce<BridgeWidgetRelayView>(
    (view, event) => reduceBridgeWidgetRelayView(view, { roomId, ...event }),
    initialBridgeWidgetRelayView(roomId),
  );

// ── validation ───────────────────────────────────────────────────────────────

test("one channel per room, named the same way on both sides", () => {
  assert.equal(bridgeWidgetRelayChannelName("abc"), "warptalk:bridge-widget:abc");
});

test("accepts every intent the popup sends, rebuilt field by field", () => {
  const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
    [{ type: "request-snapshot" }, { type: "request-snapshot" }],
    [{ type: "set-language", language: "ja" }, { type: "set-language", language: "ja" }],
    [{ type: "set-voice-enabled", enabled: false }, { type: "set-voice-enabled", enabled: false }],
    [{ type: "answer-browser-capture", granted: true }, { type: "answer-browser-capture", granted: true }],
    [
      { type: "answer-browser-capture", granted: true, sourceId: "window:42:0" },
      { type: "answer-browser-capture", granted: true, sourceId: "window:42:0" },
    ],
    [{ type: "host-gone" }, { type: "host-gone" }],
  ];
  for (const [body, expected] of cases) {
    const result = parseBridgeWidgetMessage({ v, roomId: ROOM, ...body }, ROOM);
    assert.deepEqual(result, { ok: true, message: { v, roomId: ROOM, ...expected } }, JSON.stringify(body));
  }
});

test("a language arrives as the bare code the gateway is keyed by", () => {
  const result = parseBridgeWidgetMessage({ v, roomId: ROOM, type: "set-language", language: "vi-VN" }, ROOM);
  assert.ok(result.ok);
  assert.equal((result.message as Extract<BridgeWidgetMessage, { type: "set-language" }>).language, "vi");
});

test("drops what the sender added beyond the protocol", () => {
  const result = parseBridgeWidgetMessage(
    { v, roomId: ROOM, type: "set-voice-enabled", enabled: true, speak: "en", __proto_hack: 1 },
    ROOM,
  );
  assert.deepEqual(result, { ok: true, message: { v, roomId: ROOM, type: "set-voice-enabled", enabled: true } });
});

test("rejects anything that is not this protocol, and says why", () => {
  const reasons: Array<[unknown, string]> = [
    [null, "not-a-message"],
    ["REFRESH_NOTIFICATIONS", "not-a-message"],
    [{ type: "request-snapshot", roomId: ROOM }, "not-a-message"],
    [{ v: v + 1, roomId: ROOM, type: "request-snapshot" }, "other-version"],
    [{ v: String(v), roomId: ROOM, type: "request-snapshot" }, "other-version"],
    [{ v, roomId: "room-2", type: "request-snapshot" }, "other-room"],
    [{ v, roomId: ROOM, type: "set-mic-device", deviceId: "abc" }, "unknown-type"],
    [{ v, roomId: ROOM, type: "set-language" }, "malformed"],
    [{ v, roomId: ROOM, type: "set-language", language: "" }, "malformed"],
    [{ v, roomId: ROOM, type: "set-language", language: 42 }, "malformed"],
    [{ v, roomId: ROOM, type: "set-language", language: "x".repeat(200) }, "malformed"],
    [{ v, roomId: ROOM, type: "set-language", language: "<script>" }, "malformed"],
    [{ v, roomId: ROOM, type: "set-voice-enabled", enabled: "yes" }, "malformed"],
    [{ v, roomId: ROOM, type: "answer-browser-capture" }, "malformed"],
    [{ v, roomId: ROOM, type: "answer-browser-capture", granted: 1 }, "malformed"],
    [{ v, roomId: ROOM, type: "answer-browser-capture", granted: true, sourceId: "" }, "malformed"],
    [{ v, roomId: ROOM, type: "answer-browser-capture", granted: true, sourceId: 7 }, "malformed"],
  ];
  for (const [raw, reason] of reasons) {
    assert.deepEqual(parseBridgeWidgetMessage(raw, ROOM), { ok: false, reason }, JSON.stringify(raw));
  }
});

test("a snapshot is validated whole, including the browser-capture question", () => {
  const ok = parseBridgeWidgetMessage(
    snapshotWire({
      micDeviceId: "mic-1",
      browserCapture: { state: "required", selectedSourceId: "window:42:0", extra: true },
    }),
    ROOM,
  );
  assert.deepEqual(ok, {
    ok: true,
    message: {
      v,
      roomId: ROOM,
      type: "snapshot",
      speakLanguage: "vi",
      listenLanguage: "vi",
      voiceEnabled: true,
      micDeviceId: "mic-1",
      browserCapture: { state: "required", selectedSourceId: "window:42:0" },
      at: 1_000,
    },
  });

  // null is an answer ("no language yet"); a string that is no language is not.
  assert.ok(parseBridgeWidgetMessage(snapshotWire({ speakLanguage: null, listenLanguage: null }), ROOM).ok);

  const malformed: Array<Record<string, unknown>> = [
    { speakLanguage: "not a language" },
    { listenLanguage: undefined },
    { voiceEnabled: undefined },
    { at: -1 },
    { at: Number.NaN },
    { at: "1000" },
    { browserCapture: undefined },
    { browserCapture: { state: "not-needed" } },
    { browserCapture: { state: "granted", selectedSourceId: "" } },
    { micDeviceId: "" },
  ];
  for (const over of malformed) {
    assert.deepEqual(
      parseBridgeWidgetMessage(snapshotWire(over), ROOM),
      { ok: false, reason: "malformed" },
      JSON.stringify(over),
    );
  }
});

test("every consent state the main window can be in crosses the relay", () => {
  for (const state of ["not-required", "required", "granted", "declined"]) {
    assert.ok(parseBridgeWidgetMessage(snapshotWire({ browserCapture: { state } }), ROOM).ok, state);
  }
});

test("intents and host messages are told apart by type", () => {
  assert.equal(isBridgeWidgetIntent({ type: "set-language", language: "vi" }), true);
  assert.equal(isBridgeWidgetIntent({ type: "answer-browser-capture", granted: false }), true);
  assert.equal(isBridgeWidgetIntent({ type: "host-gone" }), false);
  assert.equal(isBridgeWidgetIntent({ type: "snapshot", ...snapshot() }), false);
});

// ── main-window side ─────────────────────────────────────────────────────────

test("the main window's snapshot normalizes what it holds and survives its own validator", () => {
  const body = buildBridgeWidgetSnapshot(
    {
      speakLanguage: "vi-VN",
      listenLanguage: "",
      voiceEnabled: false,
      micDeviceId: null,
      browserCaptureState: "required",
      selectedLoopbackSourceId: "window:42:0",
    },
    5_000,
  );
  assert.deepEqual(body, {
    type: "snapshot",
    speakLanguage: "vi",
    listenLanguage: null,
    voiceEnabled: false,
    browserCapture: { state: "required", selectedSourceId: "window:42:0" },
    at: 5_000,
  });
  assert.ok(parseBridgeWidgetMessage({ ...body, v, roomId: ROOM }, ROOM).ok);
});

test("a relayed pick writes both halves, speak first, and persists once — like the native picker", () => {
  const calls: string[] = [];
  applyRelayedLanguagePick("ja-JP", {
    onChangeSpeakLanguage: (language) => calls.push(`speak:${language}`),
    onChangeListenLanguage: (language) => calls.push(`listen:${language}`),
    onLanguagePicked: (language) => calls.push(`picked:${language}`),
  });
  assert.deepEqual(calls, ["speak:ja", "listen:ja", "picked:ja"]);

  const none: string[] = [];
  applyRelayedLanguagePick("", {
    onChangeSpeakLanguage: (language) => none.push(language),
    onChangeListenLanguage: (language) => none.push(language),
  });
  assert.deepEqual(none, [], "an empty pick writes nothing rather than blanking both halves");
});

test("a browser-capture answer is taken only while the main window is asking", () => {
  assert.equal(acceptsBrowserCaptureAnswer("required"), true);
  // Already answered in the main window, or nothing to ask: a late answer must not overrule it.
  assert.equal(acceptsBrowserCaptureAnswer("granted"), false);
  assert.equal(acceptsBrowserCaptureAnswer("declined"), false);
  assert.equal(acceptsBrowserCaptureAnswer("not-required"), false);
});

// ── popup side ───────────────────────────────────────────────────────────────

test("no answer in time means no main window, and the pill must not offer a pick", () => {
  const view = run([{ type: "no-answer" }]);
  assert.equal(view.status, "no-host");
  assert.equal(canRelayLanguagePick(view), false);
  assert.equal(canRelayLanguagePick(initialBridgeWidgetRelayView(ROOM)), false);
});

test("a main window that answers late — it mounted the meeting after the popup asked — still connects", () => {
  const view = run([{ type: "no-answer" }, { type: "snapshot-received", snapshot: snapshot() }]);
  assert.equal(view.status, "connected");
  assert.equal(canRelayLanguagePick(view), true);
});

test("the timeout cannot undo an answer that already arrived", () => {
  const view = run([{ type: "snapshot-received", snapshot: snapshot() }, { type: "no-answer" }]);
  assert.equal(view.status, "connected");
});

test("host-gone drops the snapshot so the pill falls back to what this window knows", () => {
  const view = run([
    { type: "snapshot-received", snapshot: snapshot({ speakLanguage: "ja", listenLanguage: "ja" }) },
    { type: "host-gone" },
  ]);
  assert.equal(view.status, "no-host");
  assert.equal(view.snapshot, null);
  assert.equal(bridgeWidgetShownLanguage(view, "en"), "en");
});

test("an older snapshot never replaces a newer one", () => {
  const view = run([
    { type: "snapshot-received", snapshot: snapshot({ speakLanguage: "ja", listenLanguage: "ja", at: 2_000 }) },
    { type: "snapshot-received", snapshot: snapshot({ speakLanguage: "vi", listenLanguage: "vi", at: 1_500 }) },
  ]);
  assert.equal(view.snapshot?.speakLanguage, "ja");
});

test("a pick shows at once, and clears when the main window confirms it", () => {
  let view = run([
    { type: "snapshot-received", snapshot: snapshot({ at: 1_000 }) },
    { type: "language-picked", language: "ja", at: 1_100 },
  ]);
  assert.equal(bridgeWidgetShownLanguage(view, null), "ja");
  assert.equal(bridgeWidgetReaderLanguage(view), "ja");

  // A snapshot sent before the pick landed still says "vi": the pick keeps showing.
  view = reduceBridgeWidgetRelayView(view, { roomId: ROOM, type: "snapshot-received", snapshot: snapshot({ at: 1_050 }) });
  assert.equal(bridgeWidgetShownLanguage(view, null), "ja");

  view = reduceBridgeWidgetRelayView(view, {
    roomId: ROOM,
    type: "snapshot-received",
    snapshot: snapshot({ speakLanguage: "ja", listenLanguage: "ja", at: 1_200 }),
  });
  assert.equal(view.pendingLanguage, null);
  assert.equal(bridgeWidgetShownLanguage(view, null), "ja");
});

test("a pick the main window never applied expires back to what it holds", () => {
  let view = run([
    { type: "snapshot-received", snapshot: snapshot() },
    { type: "language-picked", language: "ja", at: 1_100 },
  ]);
  // An expiry for an earlier pick is not this one's.
  view = reduceBridgeWidgetRelayView(view, { roomId: ROOM, type: "pick-expired", pickedAt: 900 });
  assert.equal(bridgeWidgetShownLanguage(view, null), "ja");
  view = reduceBridgeWidgetRelayView(view, { roomId: ROOM, type: "pick-expired", pickedAt: 1_100 });
  assert.equal(bridgeWidgetShownLanguage(view, null), "vi");
});

test("picking what the main window already holds leaves nothing pending", () => {
  const view = run([
    { type: "snapshot-received", snapshot: snapshot() },
    { type: "language-picked", language: "vi-VN", at: 1_100 },
  ]);
  assert.equal(view.pendingLanguage, null);
});

test("the pill shows one language; the transcript reads the one this user hears", () => {
  // An inherited split — speak vi, hear en — shown as the native pill shows it.
  const view = run([
    { type: "snapshot-received", snapshot: snapshot({ speakLanguage: "vi", listenLanguage: "en" }) },
  ]);
  assert.equal(bridgeWidgetShownLanguage(view, null), "vi");
  assert.equal(bridgeWidgetReaderLanguage(view), "en");
  // Unset on both sides reads as unset, not as the fallback.
  const unset = run([
    { type: "snapshot-received", snapshot: snapshot({ speakLanguage: null, listenLanguage: null }) },
  ]);
  assert.equal(bridgeWidgetShownLanguage(unset, "en"), "");
});

test("a stale build answering is 'reload', unless a compatible main window already answered", () => {
  assert.equal(run([{ type: "incompatible" }]).status, "incompatible");
  assert.equal(
    run([{ type: "snapshot-received", snapshot: snapshot() }, { type: "incompatible" }]).status,
    "connected",
  );
});

test("a view is about one room: an event for another starts over", () => {
  const view = run([{ type: "snapshot-received", snapshot: snapshot() }]);
  const other = reduceBridgeWidgetRelayView(view, { roomId: "room-2", type: "no-answer" });
  assert.equal(other.roomId, "room-2");
  assert.equal(other.snapshot, null);
  assert.equal(other.status, "no-host");
});

// ── transport ────────────────────────────────────────────────────────────────

function nextMessage(
  relay: ReturnType<typeof openBridgeWidgetRelay>,
  predicate: (message: BridgeWidgetMessage) => boolean,
): Promise<BridgeWidgetMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("no message within 2s"));
    }, 2_000);
    const unsubscribe = relay.subscribe((message) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(message);
    });
  });
}

test("two relays on one room reach each other, and a sender never hears itself", async () => {
  const host = openBridgeWidgetRelay(ROOM);
  const popup = openBridgeWidgetRelay(ROOM);
  const otherRoom = openBridgeWidgetRelay("room-2");
  try {
    assert.equal(host.available, true);
    const heardByOtherRoom: BridgeWidgetMessage[] = [];
    otherRoom.subscribe((message) => heardByOtherRoom.push(message));
    const heardByPopup: BridgeWidgetMessage[] = [];
    popup.subscribe((message) => heardByPopup.push(message));

    const request = nextMessage(host, (message) => message.type === "request-snapshot");
    popup.send({ type: "request-snapshot" });
    assert.deepEqual(await request, { v, roomId: ROOM, type: "request-snapshot" });

    const reply = nextMessage(popup, (message) => message.type === "snapshot");
    host.send(buildBridgeWidgetSnapshot({ speakLanguage: "vi", listenLanguage: "vi", voiceEnabled: true, browserCaptureState: "not-required" }, 1));
    assert.equal((await reply).type, "snapshot");

    assert.equal(heardByPopup.some((message) => message.type === "request-snapshot"), false);
    assert.deepEqual(heardByOtherRoom, []);
  } finally {
    host.close();
    popup.close();
    otherRoom.close();
  }
});

test("a malformed message on the channel reaches onRejected, never the listener", async () => {
  const listener = openBridgeWidgetRelay(ROOM);
  const raw = new BroadcastChannel(bridgeWidgetRelayChannelName(ROOM));
  try {
    const rejected = new Promise<string>((resolve) => {
      listener.subscribe(
        () => assert.fail("a malformed message reached the listener"),
        (reason) => resolve(reason),
      );
    });
    raw.postMessage({ v: v + 1, roomId: ROOM, type: "snapshot" });
    assert.equal(await rejected, "other-version");
  } finally {
    listener.close();
    raw.close();
  }
});

test("a closed relay is inert rather than throwing", () => {
  const relay = openBridgeWidgetRelay(ROOM);
  relay.close();
  relay.close();
  relay.send({ type: "request-snapshot" });
  relay.subscribe(() => {})();
});

test("without BroadcastChannel the relay is an inert no-op", () => {
  const original = globalThis.BroadcastChannel;
  // @ts-expect-error — removing the global to stand in for an environment that lacks it.
  delete globalThis.BroadcastChannel;
  try {
    const relay = openBridgeWidgetRelay(ROOM);
    assert.equal(relay.available, false);
    relay.send({ type: "request-snapshot" });
    relay.subscribe(() => {})();
    relay.close();
  } finally {
    globalThis.BroadcastChannel = original;
  }
  assert.equal(openBridgeWidgetRelay("").available, false, "no room, no channel");
});

/**
 * The closest a unit test gets to two BrowserWindows: two JavaScript realms with separate
 * globals and separate event loops, joined only by the channel name. The "main window" runs in a
 * worker, answers a snapshot request and applies a pick; the test is the popup.
 */
test("across two realms: the popup asks, the main window answers, a pick comes back applied", async () => {
  const moduleUrl = new URL("../bridge-widget-relay.ts", import.meta.url).href;
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      import(workerData.moduleUrl).then((lib) => {
        const relay = lib.openBridgeWidgetRelay(workerData.roomId);
        let language = "vi";
        const reply = () => relay.send(lib.buildBridgeWidgetSnapshot(
          { speakLanguage: language, listenLanguage: language, voiceEnabled: true, browserCaptureState: "not-required" },
          Date.now(),
        ));
        relay.subscribe((message) => {
          if (message.type === "request-snapshot") reply();
          if (message.type === "set-language") {
            lib.applyRelayedLanguagePick(message.language, {
              onChangeSpeakLanguage: (code) => { language = code; },
              onChangeListenLanguage: () => {},
            });
            reply();
          }
        });
        parentPort.on("message", (message) => {
          if (message === "stop") { relay.close(); parentPort.close(); }
        });
        parentPort.postMessage("ready");
      });
    `,
    { eval: true, workerData: { moduleUrl, roomId: ROOM } },
  );
  const popup = openBridgeWidgetRelay(ROOM);
  try {
    await new Promise<void>((resolve, reject) => {
      worker.once("message", () => resolve());
      worker.once("error", reject);
    });

    let view = initialBridgeWidgetRelayView(ROOM);
    const first = nextMessage(popup, (message) => message.type === "snapshot");
    popup.send({ type: "request-snapshot" });
    const answered = await first;
    assert.equal(answered.type, "snapshot");
    if (answered.type !== "snapshot") return;
    view = reduceBridgeWidgetRelayView(view, { roomId: ROOM, type: "snapshot-received", snapshot: answered });
    assert.equal(bridgeWidgetShownLanguage(view, null), "vi");

    view = reduceBridgeWidgetRelayView(view, { roomId: ROOM, type: "language-picked", language: "ja", at: Date.now() });
    const applied = nextMessage(popup, (message) => message.type === "snapshot" && message.speakLanguage === "ja");
    popup.send({ type: "set-language", language: "ja" });
    const confirmed = await applied;
    if (confirmed.type !== "snapshot") return;
    view = reduceBridgeWidgetRelayView(view, { roomId: ROOM, type: "snapshot-received", snapshot: confirmed });
    assert.equal(view.pendingLanguage, null);
    assert.equal(bridgeWidgetShownLanguage(view, null), "ja");
  } finally {
    popup.close();
    worker.postMessage("stop");
    await worker.terminate();
  }
});
