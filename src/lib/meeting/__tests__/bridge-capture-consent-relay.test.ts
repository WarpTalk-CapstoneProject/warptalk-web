import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_CONSENT_PROTOCOL_VERSION,
  CONSENT_POPUP_RAISE_GRACE_MS,
  bridgeConsentPromptView,
  bridgeConsentSurface,
  buildBridgeConsentSnapshot,
  parseBridgeConsentMessage,
  resolveBridgeConsentIntent,
  shouldAcknowledgeConsentSnapshot,
  shouldRaiseConsentPopup,
  type BridgeConsentHostView,
  type BridgeConsentIntent,
  type BridgeConsentSnapshot,
} from "../bridge-capture-consent-relay.ts";

const ROOM = "room-1";
const OTHER_ROOM = "room-2";
const STATES = ["not-required", "required", "granted", "declined"] as const;

function host(over: Partial<BridgeConsentHostView> = {}): BridgeConsentHostView {
  return {
    roomId: ROOM,
    consent: "required",
    sourceIds: ["chrome", "edge"],
    selectedSourceId: "chrome",
    ...over,
  };
}

function snapshot(over: Partial<BridgeConsentSnapshot> = {}): BridgeConsentSnapshot {
  return {
    v: 1,
    kind: "snapshot",
    roomId: ROOM,
    consent: "required",
    sources: [
      { id: "chrome", name: "Google Chrome" },
      { id: "edge", name: "Microsoft Edge" },
    ],
    selectedSourceId: "chrome",
    loadingSources: false,
    ...over,
  };
}

// --- parseBridgeConsentMessage ---------------------------------------------------------------

test("every well-formed message kind parses back to itself", () => {
  const messages = [
    snapshot(),
    snapshot({ selectedSourceId: null, sources: [], loadingSources: true, consent: "not-required" }),
    { v: 1, kind: "hello", roomId: ROOM },
    { v: 1, kind: "ack", roomId: ROOM },
    { v: 1, kind: "select-source", roomId: ROOM, sourceId: "edge" },
    { v: 1, kind: "decide", roomId: ROOM, granted: true },
    { v: 1, kind: "decide", roomId: ROOM, granted: false },
    { v: 1, kind: "reconsider", roomId: ROOM },
  ];
  for (const message of messages) {
    assert.deepEqual(parseBridgeConsentMessage(message), message, JSON.stringify(message));
  }
});

test("each consent state is accepted in a snapshot", () => {
  for (const consent of STATES) {
    assert.equal(parseBridgeConsentMessage(snapshot({ consent }))?.kind, "snapshot", consent);
  }
});

test("garbage on the channel is null, never an exception", () => {
  // Any same-origin page can post here. None of this may reach main's state or take a window down.
  const garbage: unknown[] = [
    null,
    undefined,
    "snapshot",
    42,
    true,
    [],
    [snapshot()],
    {},
    { ...snapshot(), v: 2 },
    { ...snapshot(), v: "1" },
    { ...snapshot(), v: undefined },
    { v: 1, kind: "grant", roomId: ROOM },
    { v: 1, roomId: ROOM },
    { v: 1, kind: "hello" },
    { v: 1, kind: "hello", roomId: "" },
    { v: 1, kind: "hello", roomId: 7 },
    { ...snapshot(), roomId: undefined },
    { ...snapshot(), consent: "maybe" },
    { ...snapshot(), consent: undefined },
    { ...snapshot(), sources: "chrome" },
    { ...snapshot(), sources: { id: "chrome", name: "Google Chrome" } },
    { ...snapshot(), sources: [{ id: "chrome" }] },
    { ...snapshot(), sources: [{ id: "chrome", name: "Google Chrome" }, { id: "edge" }] },
    { ...snapshot(), sources: [{ id: "", name: "Nameless id" }] },
    { ...snapshot(), sources: [{ id: 1, name: "Numbered" }] },
    { ...snapshot(), sources: [null] },
    { ...snapshot(), sources: ["chrome"] },
    { ...snapshot(), selectedSourceId: undefined },
    { ...snapshot(), selectedSourceId: 3 },
    { ...snapshot(), selectedSourceId: "" },
    { ...snapshot(), loadingSources: "no" },
    { ...snapshot(), loadingSources: undefined },
    { v: 1, kind: "select-source", roomId: ROOM },
    { v: 1, kind: "select-source", roomId: ROOM, sourceId: "" },
    { v: 1, kind: "select-source", roomId: ROOM, sourceId: 5 },
    { v: 1, kind: "decide", roomId: ROOM },
    { v: 1, kind: "decide", roomId: ROOM, granted: "true" },
    { v: 1, kind: "decide", roomId: ROOM, granted: 1 },
  ];
  for (const data of garbage) {
    assert.equal(parseBridgeConsentMessage(data), null, JSON.stringify(data));
  }
});

test("a hostile getter is swallowed, not thrown", () => {
  const hostile = {
    v: 1,
    kind: "hello",
    get roomId(): string {
      throw new Error("boom");
    },
  };
  assert.equal(parseBridgeConsentMessage(hostile), null);
});

test("unknown fields are stripped, down to each source", () => {
  const parsed = parseBridgeConsentMessage({
    ...snapshot(),
    extra: "field",
    sources: [{ id: "chrome", name: "Google Chrome", windowHandle: 99, ownerProcessId: 4 }],
  });
  assert.deepEqual(parsed, snapshot({ sources: [{ id: "chrome", name: "Google Chrome" }] }));

  const intent = parseBridgeConsentMessage({
    v: 1,
    kind: "decide",
    roomId: ROOM,
    granted: true,
    sourceId: "edge",
    consent: "granted",
  });
  assert.deepEqual(intent, { v: 1, kind: "decide", roomId: ROOM, granted: true });
});

test("the parsed message is a fresh object, not the one that arrived", () => {
  const incoming = snapshot();
  const parsed = parseBridgeConsentMessage(incoming);
  assert.notEqual(parsed, incoming);
  assert.ok(parsed && parsed.kind === "snapshot");
  assert.notEqual(parsed.sources, incoming.sources);
  assert.notEqual(parsed.sources[0], incoming.sources[0]);
});

// --- buildBridgeConsentSnapshot --------------------------------------------------------------

test("the snapshot carries only id and name for each source", () => {
  // Window handles and process ids are for the capture; every same-origin page can read the channel.
  // Shaped like WindowsLoopbackSource, which is what main actually passes.
  const loopbackSources = [
    { id: "chrome", name: "Google Chrome", windowHandle: 1, ownerProcessId: 2, likelyMeetingWindow: true },
  ];
  const built = buildBridgeConsentSnapshot({
    roomId: ROOM,
    consent: "required",
    sources: loopbackSources,
    selectedSourceId: "chrome",
    loadingSources: false,
  });
  assert.deepEqual(built, snapshot({ sources: [{ id: "chrome", name: "Google Chrome" }] }));
  assert.equal(built.v, BRIDGE_CONSENT_PROTOCOL_VERSION);
});

test("a built snapshot survives the parser unchanged", () => {
  const built = buildBridgeConsentSnapshot({
    roomId: ROOM,
    consent: "granted",
    sources: [{ id: "edge", name: "Microsoft Edge" }],
    selectedSourceId: null,
    loadingSources: true,
  });
  assert.deepEqual(parseBridgeConsentMessage(built), built);
});

// --- resolveBridgeConsentIntent --------------------------------------------------------------

const hello: BridgeConsentIntent = { v: 1, kind: "hello", roomId: ROOM };
const ack: BridgeConsentIntent = { v: 1, kind: "ack", roomId: ROOM };
const grant: BridgeConsentIntent = { v: 1, kind: "decide", roomId: ROOM, granted: true };
const refuse: BridgeConsentIntent = { v: 1, kind: "decide", roomId: ROOM, granted: false };
const reconsider: BridgeConsentIntent = { v: 1, kind: "reconsider", roomId: ROOM };
const pickEdge: BridgeConsentIntent = { v: 1, kind: "select-source", roomId: ROOM, sourceId: "edge" };

test("main never acts on a snapshot, even its own room's", () => {
  for (const consent of STATES) {
    assert.equal(resolveBridgeConsentIntent(snapshot({ consent }), host({ consent })), null, consent);
  }
});

test("an intent for another room is ignored, whatever it is", () => {
  const intents: BridgeConsentIntent[] = [hello, ack, grant, refuse, reconsider, pickEdge];
  for (const intent of intents) {
    for (const consent of STATES) {
      assert.equal(
        resolveBridgeConsentIntent({ ...intent, roomId: OTHER_ROOM }, host({ consent })),
        null,
        `${intent.kind} in ${consent}`,
      );
    }
  }
});

test("hello is always answered with a republish", () => {
  // The channel has no replay; a republish changes nothing, so there is no state to refuse it in.
  for (const consent of STATES) {
    assert.deepEqual(resolveBridgeConsentIntent(hello, host({ consent })), { type: "republish" }, consent);
  }
});

test("ack only counts while the question is open", () => {
  assert.deepEqual(resolveBridgeConsentIntent(ack, host({ consent: "required" })), {
    type: "acknowledged",
  });
  for (const consent of ["not-required", "granted", "declined"] as const) {
    assert.equal(resolveBridgeConsentIntent(ack, host({ consent })), null, consent);
  }
});

test("a source can be picked only from main's own list, only while asking", () => {
  assert.deepEqual(resolveBridgeConsentIntent(pickEdge, host()), {
    type: "select-source",
    sourceId: "edge",
  });
  // A source that vanished since the popup's snapshot, or one main never listed.
  assert.equal(resolveBridgeConsentIntent(pickEdge, host({ sourceIds: ["chrome"] })), null);
  assert.equal(resolveBridgeConsentIntent(pickEdge, host({ sourceIds: [] })), null);
  for (const consent of ["not-required", "granted", "declined"] as const) {
    assert.equal(resolveBridgeConsentIntent(pickEdge, host({ consent })), null, consent);
  }
});

test("a grant needs the question open and main's own selection still listed", () => {
  assert.deepEqual(resolveBridgeConsentIntent(grant, host()), { type: "answer", granted: true });
  // Nothing selected yet: there is nothing to listen to.
  assert.equal(resolveBridgeConsentIntent(grant, host({ selectedSourceId: null })), null);
  // Main's selection dropped out of its list (the window closed) since the popup rendered.
  assert.equal(resolveBridgeConsentIntent(grant, host({ selectedSourceId: "firefox" })), null);
  assert.equal(
    resolveBridgeConsentIntent(grant, host({ sourceIds: [], selectedSourceId: "chrome" })),
    null,
  );
  // A stale popup clicking Allow after the answer was already given, or before there was a question.
  for (const consent of ["not-required", "granted", "declined"] as const) {
    assert.equal(resolveBridgeConsentIntent(grant, host({ consent })), null, consent);
  }
});

test("a refusal declines while asking and revokes while listening, and nothing else", () => {
  assert.deepEqual(resolveBridgeConsentIntent(refuse, host({ consent: "required" })), {
    type: "answer",
    granted: false,
  });
  // "Stop listening": no precondition on the selection, stopping must always be possible.
  assert.deepEqual(
    resolveBridgeConsentIntent(refuse, host({ consent: "granted", selectedSourceId: null, sourceIds: [] })),
    { type: "answer", granted: false },
  );
  assert.equal(resolveBridgeConsentIntent(refuse, host({ consent: "declined" })), null);
  assert.equal(resolveBridgeConsentIntent(refuse, host({ consent: "not-required" })), null);
});

test("asking again only follows a decline", () => {
  assert.deepEqual(resolveBridgeConsentIntent(reconsider, host({ consent: "declined" })), {
    type: "reask",
  });
  for (const consent of ["not-required", "required", "granted"] as const) {
    assert.equal(resolveBridgeConsentIntent(reconsider, host({ consent })), null, consent);
  }
});

// --- bridgeConsentSurface --------------------------------------------------------------------

test("the question is asked in the popup when there is one, else in main, and only when required", () => {
  assert.equal(bridgeConsentSurface({ consent: "required", popupAvailable: true }), "popup");
  assert.equal(bridgeConsentSurface({ consent: "required", popupAvailable: false }), "main");
  for (const consent of ["not-required", "granted", "declined"] as const) {
    for (const popupAvailable of [true, false]) {
      assert.equal(bridgeConsentSurface({ consent, popupAvailable }), "none", `${consent} ${popupAvailable}`);
    }
  }
});

// --- shouldRaiseConsentPopup -----------------------------------------------------------------

test("the popup is not raised inside the grace, is at the grace, and never once acknowledged", () => {
  const base = { surface: "popup" as const, acknowledged: false, askedAtMs: 10_000 };
  assert.equal(CONSENT_POPUP_RAISE_GRACE_MS, 1500);
  assert.equal(shouldRaiseConsentPopup({ ...base, nowMs: 10_000 }), false);
  assert.equal(shouldRaiseConsentPopup({ ...base, nowMs: 11_499 }), false);
  assert.equal(shouldRaiseConsentPopup({ ...base, nowMs: 11_500 }), true);
  assert.equal(shouldRaiseConsentPopup({ ...base, nowMs: 60_000 }), true);
  // Raising an already-visible popup costs an OS notification for nothing.
  assert.equal(shouldRaiseConsentPopup({ ...base, acknowledged: true, nowMs: 11_500 }), false);
  assert.equal(shouldRaiseConsentPopup({ ...base, acknowledged: true, nowMs: 60_000 }), false);
});

test("a custom grace is honoured", () => {
  const base = { surface: "popup" as const, acknowledged: false, askedAtMs: 0, graceMs: 200 };
  assert.equal(shouldRaiseConsentPopup({ ...base, nowMs: 199 }), false);
  assert.equal(shouldRaiseConsentPopup({ ...base, nowMs: 200 }), true);
});

test("nothing is raised when the question is not the popup's", () => {
  for (const surface of ["none", "main"] as const) {
    assert.equal(
      shouldRaiseConsentPopup({ surface, acknowledged: false, askedAtMs: 0, nowMs: 60_000 }),
      false,
      surface,
    );
  }
});

// --- bridgeConsentPromptView -----------------------------------------------------------------

test("no snapshot, another room's, or nothing to ask renders nothing", () => {
  assert.deepEqual(bridgeConsentPromptView(null, ROOM), { kind: "hidden" });
  assert.deepEqual(bridgeConsentPromptView(snapshot(), OTHER_ROOM), { kind: "hidden" });
  assert.deepEqual(bridgeConsentPromptView(snapshot({ consent: "not-required" }), ROOM), {
    kind: "hidden",
  });
});

test("required asks, and Allow is offered only for a listed selection", () => {
  assert.deepEqual(bridgeConsentPromptView(snapshot(), ROOM), {
    kind: "ask",
    sources: [
      { id: "chrome", name: "Google Chrome" },
      { id: "edge", name: "Microsoft Edge" },
    ],
    selectedSourceId: "chrome",
    loadingSources: false,
    canConfirm: true,
  });

  const nothingPicked = bridgeConsentPromptView(snapshot({ selectedSourceId: null }), ROOM);
  assert.equal(nothingPicked.kind === "ask" && nothingPicked.canConfirm, false);

  const pickedGone = bridgeConsentPromptView(snapshot({ selectedSourceId: "firefox" }), ROOM);
  assert.equal(pickedGone.kind, "ask");
  assert.equal(pickedGone.kind === "ask" && pickedGone.canConfirm, false);

  const loading = bridgeConsentPromptView(
    snapshot({ sources: [], selectedSourceId: null, loadingSources: true }),
    ROOM,
  );
  assert.deepEqual(loading, {
    kind: "ask",
    sources: [],
    selectedSourceId: null,
    loadingSources: true,
    canConfirm: false,
  });
});

test("granted shows what is being listened to, or no name if it is no longer listed", () => {
  assert.deepEqual(bridgeConsentPromptView(snapshot({ consent: "granted" }), ROOM), {
    kind: "listening",
    sourceName: "Google Chrome",
  });
  assert.deepEqual(
    bridgeConsentPromptView(snapshot({ consent: "granted", selectedSourceId: "firefox" }), ROOM),
    { kind: "listening", sourceName: null },
  );
  assert.deepEqual(
    bridgeConsentPromptView(snapshot({ consent: "granted", selectedSourceId: null }), ROOM),
    { kind: "listening", sourceName: null },
  );
});

test("declined renders the declined view", () => {
  assert.deepEqual(bridgeConsentPromptView(snapshot({ consent: "declined" }), ROOM), {
    kind: "declined",
  });
});

// --- shouldAcknowledgeConsentSnapshot --------------------------------------------------------

test("the popup acknowledges only an open question, for its room, while visible", () => {
  assert.equal(shouldAcknowledgeConsentSnapshot(snapshot(), ROOM, true), true);
  // Hidden: the ack claims the host can see the question, and would stop main raising the popup.
  assert.equal(shouldAcknowledgeConsentSnapshot(snapshot(), ROOM, false), false);
  assert.equal(shouldAcknowledgeConsentSnapshot(null, ROOM, true), false);
  assert.equal(shouldAcknowledgeConsentSnapshot(snapshot(), OTHER_ROOM, true), false);
  for (const consent of ["not-required", "granted", "declined"] as const) {
    assert.equal(shouldAcknowledgeConsentSnapshot(snapshot({ consent }), ROOM, true), false, consent);
  }
});
