import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MEETING_TAIL_MS,
  EMPTY_BRIDGE_WINDOW,
  IDLE_TRIGGER,
  OFFER_GRACE_MS,
  TRIGGER_LEAD_MS,
  bridgeWindowClosed,
  bridgeWindowReopened,
  extractMeetCodeFromUrl,
  isWithinTriggerWindow,
  nextBridgeTrigger,
  nextBridgeWindow,
  OFFER_TRIGGER,
  selectTriggerMeeting,
  shouldShowBridgeWidget,
  sightingLatchRoomId,
  type BridgeTriggerSnapshot,
  type BridgeTriggerState,
  type BridgeWindowLedger,
  type TriggerMeeting,
} from "../bridge-trigger.ts";

const NOW = 1_700_000_000_000;
const meeting = (over: Partial<Parameters<typeof isWithinTriggerWindow>[0]> = {}) => ({
  roomId: "room-1",
  startsAtMs: NOW,
  ...over,
});

const step = (previous: BridgeTriggerSnapshot, over: Record<string, unknown> = {}) =>
  nextBridgeTrigger(previous, {
    meeting: meeting(),
    nowMs: NOW,
    meetWindowVisible: false,
    translationStarted: false,
    ...over,
  } as Parameters<typeof nextBridgeTrigger>[1]);

test("reads the room code out of a Meet join URL, and tolerates one that has none", () => {
  assert.equal(extractMeetCodeFromUrl("https://meet.google.com/abc-defg-hij"), "abc-defg-hij");
  assert.equal(extractMeetCodeFromUrl("https://meet.google.com/abc-defg-hij?authuser=0"), "abc-defg-hij");
  assert.equal(extractMeetCodeFromUrl("https://meet.google.com/"), undefined);
  assert.equal(extractMeetCodeFromUrl(null), undefined);
});

test("the widget offers itself before the meeting starts, not at the moment it does", () => {
  assert.equal(isWithinTriggerWindow(meeting(), NOW - TRIGGER_LEAD_MS), true);
  assert.equal(isWithinTriggerWindow(meeting(), NOW - TRIGGER_LEAD_MS - 1), false);
});

test("a meeting with no end time stops being eligible instead of arming the sensor forever", () => {
  assert.equal(isWithinTriggerWindow(meeting(), NOW + DEFAULT_MEETING_TAIL_MS), true);
  assert.equal(isWithinTriggerWindow(meeting(), NOW + DEFAULT_MEETING_TAIL_MS + 1), false);
  // A stated end time wins over the ceiling.
  assert.equal(isWithinTriggerWindow(meeting({ endsAtMs: NOW + 1000 }), NOW + 2000), false);
});

test("only one meeting drives the widget, and it is the nearest", () => {
  const soon = { roomId: "soon", startsAtMs: NOW + 60_000 };
  const later = { roomId: "later", startsAtMs: NOW + 4 * 60_000 };
  assert.equal(selectTriggerMeeting([later, soon], NOW)?.roomId, "soon");
  assert.equal(selectTriggerMeeting([{ roomId: "far", startsAtMs: NOW + 60 * 60_000 }], NOW), null);
});

test("no meeting means no widget", () => {
  assert.deepEqual(step(IDLE_TRIGGER, { meeting: null }), IDLE_TRIGGER);
  assert.equal(shouldShowBridgeWidget("idle"), false);
});

test("near but unseen is upcoming, which is where Open Google Meet lives", () => {
  assert.deepEqual(step(IDLE_TRIGGER), { state: "upcoming", roomId: "room-1" });
});

test("a Meet window on screen moves it to ready", () => {
  assert.deepEqual(step(IDLE_TRIGGER, { meetWindowVisible: true }), {
    state: "ready",
    roomId: "room-1",
  });
});

test("ready survives the user switching to another tab", () => {
  // The sensor only sees the ACTIVE tab's title, so a Meet in the background reads as gone. Taking
  // the controls away there would be yanking them mid-sentence.
  const ready = step(IDLE_TRIGGER, { meetWindowVisible: true });
  assert.equal(step(ready, { meetWindowVisible: false }).state, "ready");
});

test("the latch does not leak into the next meeting", () => {
  const ready = step(IDLE_TRIGGER, { meetWindowVisible: true });
  const next = nextBridgeTrigger(ready, {
    meeting: { roomId: "room-2", startsAtMs: NOW },
    nowMs: NOW,
    meetWindowVisible: false,
    translationStarted: false,
  });
  assert.deepEqual(next, { state: "upcoming", roomId: "room-2" }, "room-2 has not been seen yet");
});

test("leaving the meeting window drops the latch with it", () => {
  const ready = step(IDLE_TRIGGER, { meetWindowVisible: true });
  const after = step(ready, { nowMs: NOW + DEFAULT_MEETING_TAIL_MS + 1, meetWindowVisible: false });
  assert.deepEqual(after, IDLE_TRIGGER);
});

test("a window belonging to a different call does not count as this one", () => {
  const withCode = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: { roomId: "room-1", startsAtMs: NOW, meetCode: "abc-defg-hij" },
    nowMs: NOW,
    meetWindowVisible: true,
    observedMeetCode: "zzz-zzzz-zzz",
    translationStarted: false,
  });
  assert.equal(withCode.state, "upcoming");
});

test("a missing code is not treated as a conflict", () => {
  // Meet drops the code from the title as soon as the event has a name, which is every meeting
  // WarpBot creates. Requiring one would mean the sensor is never believed.
  const named = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: { roomId: "room-1", startsAtMs: NOW, meetCode: "abc-defg-hij" },
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  assert.equal(named.state, "ready");
});

test("running is reported while translating, and falls back to ready when stopped", () => {
  const running = step(IDLE_TRIGGER, { meetWindowVisible: true, translationStarted: true });
  assert.equal(running.state, "running");
  assert.equal(step(running, { meetWindowVisible: false }).state, "ready");
});

test("flow 2: a Meet with no room behind it is an offer, not silence", () => {
  const offer = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: null,
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  assert.deepEqual(offer, { state: "offer", roomId: null });
  assert.equal(shouldShowBridgeWidget("offer"), true);
});

test("an offer follows the sensor rather than latching", () => {
  // Nothing bounds an offer - no roomId, no scheduled window - so a latched one could never
  // expire. Better a flicker than a window that will not leave.
  const offer = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: null,
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  const gone = nextBridgeTrigger(offer, {
    meeting: null,
    nowMs: NOW,
    meetWindowVisible: false,
    translationStarted: false,
  });
  assert.deepEqual(gone, IDLE_TRIGGER);
});

test("a workspace with no bridge room at all still gets the offer", () => {
  // An EMPTY schedule plus a Meet window is the only shape flow 2 ever has, so this composes both
  // halves rather than handing nextBridgeTrigger a written-out `null`: the empty list is the input
  // the app really holds, and `selectTriggerMeeting` is what turns it into the null.
  //
  // BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT CATCH. The bug that made flow 2 unreachable was
  // never here - the pure half always answered correctly. The hook armed the window sensor on
  // `meetings.length > 0`, so a workspace that had never made a bridge room never looked, and this
  // input was never produced. That gate is gone, but its return would not turn this test red:
  // arming is a subscription inside a hook, not a value, and nothing pure can observe it. See the
  // note in use-bridge-trigger.ts. What this does hold is the pure path itself - that an empty
  // schedule and a visible window still compose into an offer rather than into silence.
  const meeting = selectTriggerMeeting([], NOW);
  assert.equal(meeting, null);
  assert.deepEqual(
    nextBridgeTrigger(IDLE_TRIGGER, {
      meeting,
      nowMs: NOW,
      meetWindowVisible: true,
      translationStarted: false,
    }),
    OFFER_TRIGGER,
  );
});

test("a known meeting wins over the offer", () => {
  const withRoom = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: meeting(),
    nowMs: NOW,
    meetWindowVisible: true,
    translationStarted: false,
  });
  assert.equal(withRoom.state, "ready", "flow 1 must not be shadowed by flow 2");
});

// ── A translation in progress outlives the schedule ─────────────────────────────────────────────

/**
 * Selection and reducer together, the way the hook composes them. The bug lived in the seam: the
 * reducer already said `running` for a translating meeting, but selection had dropped the meeting
 * at the end of its window before the reducer was ever asked.
 */
const tick = (
  nowMs: number,
  options: { translatingRoomId?: string | null; meetWindowVisible?: boolean; meetings?: ReturnType<typeof meeting>[] } = {},
) => {
  const translatingRoomId = options.translatingRoomId ?? null;
  const selected = selectTriggerMeeting(options.meetings ?? [meeting()], nowMs, translatingRoomId);
  return nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: selected,
    nowMs,
    meetWindowVisible: options.meetWindowVisible ?? true,
    translationStarted: selected !== null && selected.roomId === translatingRoomId,
  });
};

test("an hour-long translated call keeps its controls past the one-hour ceiling", () => {
  // The reported bug: at start + 60 min a room with no end time left its window, and with Meet
  // still on screen the popup carrying Stop translation was navigated to the offer.
  const pastTheCeiling = NOW + DEFAULT_MEETING_TAIL_MS + 60_000;
  assert.deepEqual(tick(NOW + DEFAULT_MEETING_TAIL_MS - 60_000, { translatingRoomId: "room-1" }), {
    state: "running",
    roomId: "room-1",
  });
  assert.deepEqual(tick(pastTheCeiling, { translatingRoomId: "room-1" }), {
    state: "running",
    roomId: "room-1",
  });
  // With Meet gone from view too - auto-PiP off - it must not fall to idle, which closes the popup.
  assert.deepEqual(tick(pastTheCeiling, { translatingRoomId: "room-1", meetWindowVisible: false }), {
    state: "running",
    roomId: "room-1",
  });
});

test("the same call, not translated, still ages out at the ceiling", () => {
  // The ceiling is what stops a forgotten room arming the widget all day. Translation lifts it;
  // nothing else does.
  assert.deepEqual(tick(NOW + DEFAULT_MEETING_TAIL_MS + 60_000), OFFER_TRIGGER);
  assert.deepEqual(tick(NOW + DEFAULT_MEETING_TAIL_MS + 60_000, { meetWindowVisible: false }), IDLE_TRIGGER);
});

test("a running translation outlives a stated end time as well as the default one", () => {
  const ended = meeting({ endsAtMs: NOW + 10 * 60_000 });
  assert.equal(
    tick(NOW + 30 * 60_000, { meetings: [ended], translatingRoomId: "room-1" }).state,
    "running",
  );
  assert.equal(tick(NOW + 30 * 60_000, { meetings: [ended] }).state, "offer");
});

test("translating one room does not mark whichever room the schedule picked as running", () => {
  const soon = { roomId: "soon", startsAtMs: NOW + 60_000 };
  const later = { roomId: "later", startsAtMs: NOW + 4 * 60_000 };
  assert.equal(selectTriggerMeeting([soon, later], NOW, "later")?.roomId, "later");
  assert.deepEqual(tick(NOW, { meetings: [soon, later], translatingRoomId: "later" }), {
    state: "running",
    roomId: "later",
  });
});

test("a translating room the schedule does not know about falls back to the schedule", () => {
  // Nothing to hold on to: no start, no code. Inventing a meeting for it would be guessing.
  assert.equal(selectTriggerMeeting([meeting()], NOW, "elsewhere")?.roomId, "room-1");
  assert.equal(selectTriggerMeeting([], NOW, "elsewhere"), null);
});

// ── The offer's grace ────────────────────────────────────────────────────────────────────────────

const offerStep = (nowMs: number, meetWindowLostAtMs: number | null, meetWindowVisible = false) =>
  nextBridgeTrigger(OFFER_TRIGGER, {
    meeting: null,
    nowMs,
    meetWindowVisible,
    meetWindowLostAtMs,
    translationStarted: false,
  });

test("switching from the Meet tab to its picture-in-picture does not close the offer", () => {
  // Tab switch ends the sighting; PiP starts the next one a poll or two later (3 s each).
  assert.deepEqual(offerStep(NOW + 3_000, NOW), OFFER_TRIGGER);
  assert.deepEqual(offerStep(NOW + 6_000, NOW), OFFER_TRIGGER);
  assert.deepEqual(offerStep(NOW + OFFER_GRACE_MS - 1, NOW), OFFER_TRIGGER);
});

test("an offer for a call that really ended leaves once the grace is up", () => {
  assert.deepEqual(offerStep(NOW + OFFER_GRACE_MS, NOW), IDLE_TRIGGER);
  assert.deepEqual(offerStep(NOW + 60_000, NOW), IDLE_TRIGGER);
});

test("the grace extends an offer the sensor backed; it cannot raise one", () => {
  // No sighting ever ended, so there is nothing to be graceful about.
  assert.deepEqual(offerStep(NOW, null), IDLE_TRIGGER);
});

test("the grace is the offer's alone and does not touch a scheduled meeting", () => {
  const upcoming = nextBridgeTrigger(IDLE_TRIGGER, {
    meeting: meeting(),
    nowMs: NOW + 1_000,
    meetWindowVisible: false,
    meetWindowLostAtMs: NOW,
    translationStarted: false,
  });
  assert.deepEqual(upcoming, { state: "upcoming", roomId: "room-1" });
});

// ── The popup the user closed ────────────────────────────────────────────────────────────────────

/** Feeds a sequence of (target, state) through the ledger, collecting the commands it issues. */
function drive(
  steps: readonly (readonly [string | null, BridgeTriggerState])[],
  start: BridgeWindowLedger = EMPTY_BRIDGE_WINDOW,
) {
  let ledger = start;
  const commands: string[] = [];
  for (const [target, state] of steps) {
    const result = nextBridgeWindow(ledger, target, state);
    ledger = result.ledger;
    if (result.command) {
      commands.push(result.command.kind === "open" ? `open ${result.command.target}` : "close");
    }
  }
  return { ledger, commands };
}

test("the popup opens once per target and closes when the trigger lets go", () => {
  const { commands } = drive([
    ["room-1", "upcoming"],
    ["room-1", "ready"],
    ["room-1", "running"],
    [null, "idle"],
  ]);
  // upcoming -> ready -> running raise nothing: the window is already there, and re-raising it
  // would refocus a window the user moved aside.
  assert.deepEqual(commands, ["open room-1", "close"]);
});

test("a popup the user closed stays closed for the rest of that phase", () => {
  const opened = drive([["room-1", "running"]]).ledger;
  const closed = bridgeWindowClosed(opened, "room-1", "running");
  assert.deepEqual(closed, { opened: null, dismissed: { target: "room-1", state: "running" } });
  assert.deepEqual(drive([["room-1", "running"], ["room-1", "running"]], closed).commands, []);
});

test("a closed popup comes back when the meeting moves forward", () => {
  // Closing the five-minute heads-up must not also hide the Start button once the user is in Meet.
  const opened = drive([["room-1", "upcoming"]]).ledger;
  const closed = bridgeWindowClosed(opened, "room-1", "upcoming");
  assert.deepEqual(drive([["room-1", "upcoming"], ["room-1", "ready"]], closed).commands, ["open room-1"]);

  const closedWhileReady = bridgeWindowClosed(drive([["room-1", "ready"]]).ledger, "room-1", "ready");
  assert.deepEqual(drive([["room-1", "running"]], closedWhileReady).commands, ["open room-1"]);
});

test("a dismissal ends with its target, so the next time is a new time", () => {
  const closed = bridgeWindowClosed(drive([["offer", "offer"]]).ledger, "offer", "offer");
  // The call ended (the offer let go), then a new one started.
  assert.deepEqual(drive([[null, "idle"], ["offer", "offer"]], closed).commands, ["open offer"]);
  // A different meeting taking over is a new target, not the dismissed one.
  assert.deepEqual(drive([["room-2", "upcoming"]], closed).commands, ["open room-2"]);
});

test("closing does not leave the trigger believing the popup is open", () => {
  // The original defect: the desktop told nobody, the ledger kept `opened`, and the next open for
  // that target was skipped as a no-op. After a close, the ledger holds nothing open, so going idle
  // has nothing to close and a new call is free to open again.
  const closed = bridgeWindowClosed(drive([["room-1", "ready"]]).ledger, "room-1", "ready");
  assert.equal(closed.opened, null);
  assert.deepEqual(drive([[null, "idle"]], closed).commands, []);
});

test("a close of a popup the trigger did not open is not the trigger's dismissal", () => {
  // A bridge room opened by hand raises its own popup; the trigger must not start suppressing
  // anything because of it.
  const opened = drive([["room-1", "ready"]]).ledger;
  assert.deepEqual(bridgeWindowClosed(opened, "room-9", "ready"), opened);
  assert.deepEqual(bridgeWindowClosed(EMPTY_BRIDGE_WINDOW, "room-1", "ready"), EMPTY_BRIDGE_WINDOW);
});

test("a popup reopened from the tray is adopted, so the trigger still closes it later", () => {
  const closed = bridgeWindowClosed(drive([["room-1", "running"]]).ledger, "room-1", "running");
  const reopened = bridgeWindowReopened(closed, "room-1", "room-1");
  assert.deepEqual(reopened, { opened: "room-1", dismissed: null });
  // Without the adoption the ledger would hold nothing open, and the popup the user brought back
  // would outlive the meeting.
  assert.deepEqual(drive([[null, "idle"]], reopened).commands, ["close"]);
});

test("a reopened popup showing something else is left to whoever owns it", () => {
  const closed = bridgeWindowClosed(drive([["room-1", "running"]]).ledger, "room-1", "running");
  assert.deepEqual(bridgeWindowReopened(closed, "room-9", "room-1"), closed);
});

// ── The sighting narrows the schedule (prod incident 2026-10-03) ────────────────────────────────

/**
 * The incident: Meet X got room A; A's session was torn down without ending it, so A sat in the
 * room list with no end for its one-hour tail. Selection by clock kept picking A, a selected
 * meeting can never be `offer`, and the next Meet calls were never claimed.
 */
const X = "jkm-bfek-dio";
const Y = "uys-xppr-xjd";
const Z = "nht-fzkw-igv";
const roomA: TriggerMeeting = { roomId: "A", startsAtMs: NOW - 10 * 60_000, meetCode: X };
const roomB: TriggerMeeting = { roomId: "B", startsAtMs: NOW - 60_000, meetCode: Y };

test("a room for another call does not hold the trigger: a new Meet code is an offer", () => {
  const selected = selectTriggerMeeting([roomA], NOW, null, Y);
  assert.equal(selected, null);
  assert.deepEqual(
    nextBridgeTrigger({ state: "ready", roomId: "A" }, {
      meeting: selected,
      nowMs: NOW,
      meetWindowVisible: true,
      observedMeetCode: Y,
      translationStarted: false,
    }),
    OFFER_TRIGGER,
  );
});

test("the room whose code is on screen wins, even when another room is nearer to now", () => {
  const nearer: TriggerMeeting = { roomId: "A", startsAtMs: NOW, meetCode: X };
  const further: TriggerMeeting = { roomId: "B", startsAtMs: NOW - 30 * 60_000, meetCode: Y };
  assert.equal(selectTriggerMeeting([nearer, further], NOW)?.roomId, "A", "by clock alone");
  assert.equal(selectTriggerMeeting([nearer, further], NOW, null, Y)?.roomId, "B");
});

test("a room with no code stays selectable under any observed code", () => {
  // Absence proves nothing: Meet drops the code from the title once the event has a name.
  const noCode: TriggerMeeting = { roomId: "N", startsAtMs: NOW };
  assert.equal(selectTriggerMeeting([noCode], NOW, null, Y)?.roomId, "N");
  assert.equal(selectTriggerMeeting([noCode, roomA], NOW, null, Y)?.roomId, "N");
  // ...but a room that MATCHES is better evidence than one that merely does not disagree.
  assert.equal(selectTriggerMeeting([noCode, roomB], NOW, null, Y)?.roomId, "B");
});

test("with no observed code and no preferred room the old nearest-start rule is unchanged", () => {
  assert.equal(selectTriggerMeeting([roomA, roomB], NOW)?.roomId, "B");
  assert.equal(selectTriggerMeeting([roomA, roomB], NOW, null, undefined, null)?.roomId, "B");
});

test("a translating room wins over a sighting of some other call", () => {
  const selected = selectTriggerMeeting([roomA, roomB], NOW, "A", Y);
  assert.equal(selected?.roomId, "A");
  assert.deepEqual(
    nextBridgeTrigger(IDLE_TRIGGER, {
      meeting: selected,
      nowMs: NOW,
      meetWindowVisible: true,
      observedMeetCode: Y,
      translationStarted: true,
    }),
    { state: "running", roomId: "A" },
  );
  // ...and the other call's window is not recorded as a sighting of the translated room.
  assert.equal(
    sightingLatchRoomId({ meetings: [roomA], nowMs: NOW, translatingRoomId: "A", observedMeetCode: Y }),
    null,
  );
});

test("picture-in-picture keeps the call the user was seen in, and the latch does not jump", () => {
  // PiP: visible, but the title carries no code. A is older and still in its tail; B is the call.
  const oldA: TriggerMeeting = { roomId: "A", startsAtMs: NOW - 2 * 60_000, meetCode: X };
  const newB: TriggerMeeting = { roomId: "B", startsAtMs: NOW - 20 * 60_000, meetCode: Y };
  assert.equal(selectTriggerMeeting([oldA, newB], NOW)?.roomId, "A", "the clock alone prefers A");
  assert.equal(selectTriggerMeeting([oldA, newB], NOW, null, undefined, "B")?.roomId, "B");
  assert.equal(
    sightingLatchRoomId({ meetings: [oldA, newB], nowMs: NOW, translatingRoomId: null, preferredRoomId: "B" }),
    "B",
  );
});

test("a scheduled room in its lead does not steal an unrelated call the user is in", () => {
  const scheduled: TriggerMeeting = { roomId: "S", startsAtMs: NOW + 3 * 60_000, meetCode: "sch-edul-edd" };
  const current: TriggerMeeting = { roomId: "B", startsAtMs: NOW - 40 * 60_000, meetCode: Y };
  assert.equal(selectTriggerMeeting([scheduled, current], NOW, null, Y)?.roomId, "B");
  // Tab hidden: no code to compare, but the latch remembers B.
  assert.equal(selectTriggerMeeting([scheduled, current], NOW, null, undefined, "B")?.roomId, "B");
  // With nothing remembered the schedule is still free to bring S forward.
  assert.equal(selectTriggerMeeting([scheduled, current], NOW)?.roomId, "S");
});

test("a sighting that belongs to no room leaves the latch alone", () => {
  assert.equal(
    sightingLatchRoomId({
      meetings: [roomA],
      nowMs: NOW,
      translatingRoomId: null,
      observedMeetCode: Y,
      preferredRoomId: "A",
    }),
    null,
  );
  assert.equal(
    sightingLatchRoomId({ meetings: [roomA], nowMs: NOW, translatingRoomId: null, observedMeetCode: X }),
    "A",
  );
});

/**
 * The incident, replayed through every pure piece the hook composes: the sighting latch, the
 * selection, the reducer, and the popup ledger. The claim is modelled as the room list gaining a
 * room for the offered code, which is what use-bridge-auto-room's invalidation produces.
 */
test("replay: three Meet calls in a row each get their own room and popup, never the old one", () => {
  let meetings: TriggerMeeting[] = [];
  let seen: string | null = null;
  let ledger: BridgeWindowLedger = EMPTY_BRIDGE_WINDOW;
  const commands: string[] = [];
  const states: string[] = [];
  let nowMs = NOW;

  const render = (presence: { visible: boolean; code?: string }) => {
    // The hook's latch: the sensor callback and the room-list catch-up run the same rule.
    if (presence.visible) {
      const latch = sightingLatchRoomId({
        meetings,
        nowMs,
        translatingRoomId: null,
        observedMeetCode: presence.code,
        preferredRoomId: seen,
      });
      if (latch) seen = latch;
    }
    const selected = selectTriggerMeeting(meetings, nowMs, null, presence.code, seen);
    const trigger = nextBridgeTrigger(seen ? { state: "ready", roomId: seen } : IDLE_TRIGGER, {
      meeting: selected,
      nowMs,
      meetWindowVisible: presence.visible,
      observedMeetCode: presence.code,
      translationStarted: false,
    });
    const target = trigger.state === "idle" || trigger.state === "offer" ? null : trigger.roomId;
    const result = nextBridgeWindow(ledger, target, trigger.state);
    ledger = result.ledger;
    if (result.command) {
      commands.push(result.command.kind === "open" ? `open ${result.command.target}` : "close");
    }
    states.push(`${trigger.state} ${trigger.roomId ?? "-"}`);
    return trigger;
  };
  const claim = (roomId: string, code: string) => {
    meetings = [...meetings, { roomId, startsAtMs: nowMs, meetCode: code }];
  };

  // Call 1: Meet X. Offer, claim, ready A.
  assert.deepEqual(render({ visible: true, code: X }), OFFER_TRIGGER);
  claim("A", X);
  assert.deepEqual(render({ visible: true, code: X }), { state: "ready", roomId: "A" });

  // A's session dies without ending it; A stays in the list with no end. The user moves on.
  nowMs += 5 * 60_000;
  render({ visible: false });

  // Call 2: Meet Y. Must be an offer, not "ready A".
  assert.deepEqual(render({ visible: true, code: Y }), OFFER_TRIGGER);
  claim("B", Y);
  assert.deepEqual(render({ visible: true, code: Y }), { state: "ready", roomId: "B" });
  // Tab switch: no code. The latch is B now, so the older A does not come back.
  assert.deepEqual(render({ visible: false }), { state: "ready", roomId: "B" });

  // Call 3: Meet Z, with both A and B still in their tails.
  nowMs += 5 * 60_000;
  assert.deepEqual(render({ visible: true, code: Z }), OFFER_TRIGGER);
  claim("C", Z);
  assert.deepEqual(render({ visible: true, code: Z }), { state: "ready", roomId: "C" });

  assert.deepEqual(commands, ["open A", "close", "open B", "close", "open C"], states.join(" | "));
});
