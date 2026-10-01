import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_CONSENT_PROTOCOL_VERSION,
  CONSENT_POPUP_MAX_UNANSWERED_RAISES,
  CONSENT_POPUP_RAISE_GRACE_MS,
  CONSENT_POPUP_RECHECK_MS,
  applyConsentRaise,
  initialConsentRaiseState,
  isCompactConsentAsk,
  nextConsentRaise,
  bridgeConsentPromptView,
  bridgeConsentSurface,
  buildBridgeConsentSnapshot,
  parseBridgeConsentMessage,
  resolveBridgeConsentIntent,
  shouldAcknowledgeConsentSnapshot,
  shouldRaiseConsentPopup,
  type BridgeConsentHostView,
  type ConsentRaiseState,
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
    compact: false,
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
    compact: false,
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

// --- WT-900: inbound hints on the snapshot ---------------------------------------------------

test("the inbound hints ride the snapshot and survive the parser", () => {
  const built = buildBridgeConsentSnapshot({
    roomId: ROOM,
    consent: "required",
    sources: [{ id: "chrome", name: "Google Chrome" }],
    selectedSourceId: "chrome",
    loadingSources: false,
    inboundPath: "device",
    inboundReason: "device-while-asking",
    inboundHealth: "listening",
  });
  assert.equal(built.inboundPath, "device");
  assert.deepEqual(parseBridgeConsentMessage(built), built);
});

test("absent or null hints are left off the snapshot, not sent as null", () => {
  const built = buildBridgeConsentSnapshot({
    roomId: ROOM,
    consent: "required",
    sources: [],
    selectedSourceId: null,
    loadingSources: false,
    inboundPath: null,
    inboundReason: null,
  });
  assert.equal("inboundPath" in built, false);
  assert.equal("inboundReason" in built, false);
  assert.equal("inboundHealth" in built, false);
});

test("an unknown hint is dropped, and the rest of the snapshot is kept", () => {
  const parsed = parseBridgeConsentMessage({
    ...snapshot(),
    inboundPath: "carrier-pigeon",
    inboundReason: 7,
    inboundHealth: "listening",
  });
  assert.ok(parsed && parsed.kind === "snapshot");
  assert.equal(parsed.consent, "required", "a bad hint must not hide the question");
  assert.equal("inboundPath" in parsed, false);
  assert.equal("inboundReason" in parsed, false);
  assert.equal(parsed.inboundHealth, "listening");
  // An old main sends none of them, and is read exactly as before.
  const old = parseBridgeConsentMessage(snapshot());
  assert.ok(old && old.kind === "snapshot");
  assert.equal("inboundHealth" in old, false);
});

test("the ask is compact only while the cable stands in AND carries Meet", () => {
  assert.equal(isCompactConsentAsk({ inboundReason: "device-while-asking", inboundHealth: "listening" }), true);
  for (const inboundHealth of ["unknown", "no-signal", "quiet", undefined] as const) {
    assert.equal(
      isCompactConsentAsk({ inboundReason: "device-while-asking", inboundHealth }),
      false,
      String(inboundHealth),
    );
  }
  // No cable standing in: the answer is the only way to hear the far side.
  assert.equal(isCompactConsentAsk({ inboundReason: "awaiting-consent", inboundHealth: "listening" }), false);
  assert.equal(isCompactConsentAsk({}), false);

  const view = bridgeConsentPromptView(
    snapshot({ inboundPath: "device", inboundReason: "device-while-asking", inboundHealth: "listening" }),
    ROOM,
  );
  assert.equal(view.kind === "ask" && view.compact, true);
  const silent = bridgeConsentPromptView(
    snapshot({ inboundPath: "device", inboundReason: "device-while-asking", inboundHealth: "no-signal" }),
    ROOM,
  );
  assert.equal(silent.kind === "ask" && silent.compact, false);
});

// --- WT-900: nextConsentRaise ----------------------------------------------------------------

function asked(over: Partial<ConsentRaiseState> = {}): ConsentRaiseState {
  return { ...initialConsentRaiseState({ consent: "required", popupAvailable: true, nowMs: 0 }), ...over };
}

test("nothing is decided while nothing is asked", () => {
  for (const consent of ["not-required", "granted", "declined"] as const) {
    assert.deepEqual(nextConsentRaise(asked({ consent }), 999_999), { type: "idle" });
  }
});

test("without a popup the main window asks straight away", () => {
  assert.deepEqual(nextConsentRaise(asked({ popupAvailable: false }), 0), { type: "use-main" });
});

test("an ask waits the grace, then raises a popup that has not acked", () => {
  assert.deepEqual(nextConsentRaise(asked(), 0), { type: "wait", atMs: CONSENT_POPUP_RAISE_GRACE_MS });
  assert.deepEqual(nextConsentRaise(asked(), CONSENT_POPUP_RAISE_GRACE_MS), { type: "raise" });
});

test("an acknowledged popup is not raised, but is checked again every recheck period", () => {
  const seen = asked({ acknowledged: true });
  assert.deepEqual(nextConsentRaise(seen, CONSENT_POPUP_RAISE_GRACE_MS), {
    type: "wait",
    atMs: CONSENT_POPUP_RECHECK_MS,
  });
  assert.deepEqual(nextConsentRaise(seen, CONSENT_POPUP_RECHECK_MS), { type: "check" });
  const checked = applyConsentRaise(seen, { type: "check" }, CONSENT_POPUP_RECHECK_MS);
  assert.equal(checked.acknowledged, false, "a new check needs a new ack");
  assert.equal(checked.phase, "check");
  // Closed or minimised since: silence past the grace raises it.
  assert.deepEqual(
    nextConsentRaise(checked, CONSENT_POPUP_RECHECK_MS + CONSENT_POPUP_RAISE_GRACE_MS),
    { type: "raise" },
  );
});

test("a raise waits the recheck period for an ack, and two unanswered raises move to main", () => {
  assert.equal(CONSENT_POPUP_MAX_UNANSWERED_RAISES, 2);
  let state = asked();
  let now = CONSENT_POPUP_RAISE_GRACE_MS;
  state = applyConsentRaise(state, nextConsentRaise(state, now), now);
  assert.equal(state.unansweredRaises, 1);
  assert.deepEqual(nextConsentRaise(state, now + 1), { type: "wait", atMs: now + CONSENT_POPUP_RECHECK_MS });

  now += CONSENT_POPUP_RECHECK_MS;
  assert.deepEqual(nextConsentRaise(state, now), { type: "raise" });
  state = applyConsentRaise(state, { type: "raise" }, now);
  assert.equal(state.unansweredRaises, 2);

  now += CONSENT_POPUP_RECHECK_MS;
  assert.deepEqual(nextConsentRaise(state, now), { type: "use-main" });
  // use-main changes nothing to apply.
  assert.deepEqual(applyConsentRaise(state, { type: "use-main" }, now), state);
});

test("an ack after a raise resets the count at the next check", () => {
  let state = applyConsentRaise(asked(), { type: "raise" }, 1_500);
  state = { ...state, acknowledged: true };
  const decision = nextConsentRaise(state, 1_500 + CONSENT_POPUP_RECHECK_MS);
  assert.deepEqual(decision, { type: "check" });
  state = applyConsentRaise(state, decision, 1_500 + CONSENT_POPUP_RECHECK_MS);
  assert.equal(state.unansweredRaises, 0);
  assert.equal(state.phase, "check");
});

test("custom timings are honoured", () => {
  const options = { graceMs: 10, recheckMs: 100, maxUnansweredRaises: 1 };
  let state = asked();
  assert.deepEqual(nextConsentRaise(state, 10, options), { type: "raise" });
  state = applyConsentRaise(state, { type: "raise" }, 10);
  assert.deepEqual(nextConsentRaise(state, 109, options), { type: "wait", atMs: 110 });
  assert.deepEqual(nextConsentRaise(state, 110, options), { type: "use-main" });
});
