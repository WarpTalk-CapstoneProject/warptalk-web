"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  closeTranscriptWindow,
  onTranscriptWindowClosed,
  onTranscriptWindowReopened,
  openTranscriptWindow,
  watchMeetPresence,
  type MeetPresence,
} from "@/lib/desktop/bridge";
import {
  EMPTY_BRIDGE_WINDOW,
  IDLE_TRIGGER,
  OFFER_GRACE_MS,
  bridgeWindowClosed,
  bridgeWindowReopened,
  nextBridgeTrigger,
  nextBridgeWindow,
  selectTriggerMeeting,
  type BridgeTriggerSnapshot,
  type BridgeTriggerState,
  type BridgeWindowLedger,
  type TriggerMeeting,
} from "@/lib/meeting/bridge-trigger";
import type { MeetSensorReading } from "@/lib/meeting/meeting-session-lifecycle";

/**
 * The impure half of the bridge trigger: arms the sensor, keeps a clock, opens and closes the
 * floating window.
 *
 * Every rule worth arguing about lives in lib/meeting/bridge-trigger.ts, which is pure and tested.
 * What is left here is the plumbing that cannot be: subscriptions, a timer, and one window whose
 * open/close must not be called on every render.
 *
 * OWNERSHIP
 *   This hook owns the window for a meeting NOBODY OPENED IN WARPTALK - the case it exists for.
 *   Mounted at the shell, it outlives any particular page, so the window survives a user who is
 *   watching Google Meet and never touches the app.
 *
 *   It is not the only opener, and the comment here claimed it was for longer than it was true.
 *   persistent-meeting-session opens the window too, for the user who opens a bridge room by hand
 *   with no sighting and no schedule to arm this. The two coexist because each one closes only
 *   what it opened: `windowLedger` below is this hook's record, and an unconditional close here
 *   would shut a window this hook never raised.
 */

/** How often the clock is re-read. The trigger window has minute-scale edges; this is plenty. */
const TICK_MS = 15_000;

/** Stands in for a roomId in the one state that has none. */
const OFFER_TARGET = "__offer__";

/** The desktop app names the popup's room, or null for the offer; the hook keys on one string. */
const targetFor = (roomId: string | null): string => roomId ?? OFFER_TARGET;

export interface UseBridgeTriggerOptions {
  /**
   * Bridge meetings that could be in play, for the SCHEDULE half of the trigger.
   *
   * Empty is a normal, expected state and disables nothing. An empty list is precisely the flow-2
   * case - a Meet call with no WarpTalk room behind it - which is the one the `offer` state exists
   * to catch. It used to gate the sensor; see the arming comment below for why it no longer can.
   */
  meetings: readonly TriggerMeeting[];
  /**
   * The room translation is running in, or null.
   *
   * A roomId rather than a boolean because "translation has started" is only meaningful next to
   * WHICH meeting: with two bridge rooms in their windows, a bare flag would mark whichever one
   * the schedule happened to pick as running. It also has to reach the selection, not just the
   * reducer - see `selectTriggerMeeting` - or the meeting drops out at the end of its window
   * before the reducer is ever asked.
   */
  translatingRoomId?: string | null;
}

export interface BridgeTriggerResult {
  trigger: BridgeTriggerSnapshot;
  /**
   * What the Meet sensor last said, for the meeting session's idle reaper.
   *
   * Handed down rather than subscribed to a second time, and for two reasons. The desktop reports
   * a sighting only when it CHANGES, so a listener that arrives after Meet came on screen hears
   * nothing until the call ends. And the watcher in the desktop's main process is one shared
   * instance: a second owner's disarm would switch it off under this hook, and the offer with it.
   */
  meetSensor: MeetSensorReading | null;
}

export function useBridgeTrigger({
  meetings,
  translatingRoomId = null,
}: UseBridgeTriggerOptions): BridgeTriggerResult {
  const [presence, setPresence] = useState<MeetPresence | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** When the sensor stopped seeing Meet; the offer's grace runs from here. See OFFER_GRACE_MS. */
  const [meetWindowLostAtMs, setMeetWindowLostAtMs] = useState<number | null>(null);
  const meetWindowVisibleRef = useRef(false);
  /**
   * The room a Meet window has been seen for. The whole of the latch, and the only thing here that
   * is genuinely new information rather than something derivable from it.
   *
   * Written from the sensor callback, never from an effect body: a title only reflects the ACTIVE
   * tab, so this is the record that survives the user switching away mid-call.
   */
  const [seenRoomId, setSeenRoomId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * The offer's grace ends between ticks, and nothing else would re-render to notice.
   *
   * Presence events arrive only when the sighting changes, and the clock above ticks every 15 s,
   * so without this an 8 s grace would really last anywhere up to 15.
   */
  useEffect(() => {
    if (meetWindowLostAtMs === null) return;
    const remainingMs = meetWindowLostAtMs + OFFER_GRACE_MS - Date.now();
    if (remainingMs <= 0) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), remainingMs + 50);
    return () => window.clearTimeout(timer);
  }, [meetWindowLostAtMs]);

  const meeting = selectTriggerMeeting(meetings, nowMs, translatingRoomId);
  const meetingRoomId = meeting?.roomId ?? null;

  // Read by the sensor callback, which fires long after the render that set it up.
  const meetingRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    meetingRoomIdRef.current = meetingRoomId;
  }, [meetingRoomId]);

  /**
   * The sensor arms for the whole session. Nothing gates it.
   *
   * WHAT WAS WRONG WITH THE OLD GATE
   *   It was `meetings.length > 0` - the workspace's EXTERNAL_BRIDGE rooms, as assembled by the app
   *   shell. So a workspace that had never created a bridge room never armed the sensor, and a
   *   workspace that never armed the sensor could never see a Meet window.
   *
   *   That is exactly the case `offer` exists for. `nextBridgeTrigger` returns it when there is no
   *   meeting and a Meet window is on screen - "a call with no room behind it", flow 2, the user who
   *   opened Google Meet and started talking without touching WarpTalk. Under the old gate, reaching
   *   it required a workspace to ALREADY own a bridge room and for that room to be outside its own
   *   trigger window: an accidental precondition nobody designed. The first bridge meeting a
   *   workspace ever had could not be offered, which is the only one where the offer is the whole
   *   product.
   *
   * WHAT REPLACED IT: NOTHING
   *   Not a narrower condition - there is no honest one to write. For a desktop user the answer to
   *   "when could a Meet window matter?" is "at any time", because the whole point of flow 2 is that
   *   WarpTalk was not told in advance.
   *
   *   Off the desktop the effect costs nothing to leave armed: `watchMeetPresence` returns null on a
   *   browser tab and on a desktop build that predates the sensor - it requires BOTH
   *   `warptalk.watchMeetPresence` and `warptalk.onMeetPresence` on the preload bridge, and
   *   `getDesktopBridge()` is null during server rendering and in any ordinary tab (lib/desktop/
   *   bridge.ts). So there is no subscription, nothing to clean up, and the schedule half of the
   *   trigger carries on working. Guarding this with `isDesktopApp()` would be a weaker copy of a
   *   check that already happens one call down: it only proves `window.warptalk` exists, not that
   *   this build has the sensor.
   *
   * WHAT IT COSTS, PLAINLY
   *   On the desktop a helper process now runs for the whole session for EVERY user, including ones
   *   who will never use the bridge: the UI Automation sensor keeps a warm PowerShell session and is
   *   asked one question per poll (warptalk-desktop/src/main/meet-url-sensor.ts). Measured on the
   *   target machine that is about 0.2 percentage points of one core at the poll cadence, and across
   *   six paired idle/polling rounds the delta shrank to nothing - the real cost is a one-time
   *   accessibility wake-up rather than a per-read one. That is small, but it is not zero and it is
   *   not conditional any more, so it is written down here rather than left to be rediscovered.
   *
   * THE GATE THIS SHOULD EVENTUALLY HAVE
   *   An explicit preference - "let WarpTalk notice Google Meet calls" - asked once and stored.
   *   Something the user chose, rather than a side effect of whether their workspace happens to own
   *   a bridge room. Deliberately NOT built here: this change is about making flow 2 reachable at
   *   all, and swapping one implicit gate for a second one in the same commit would leave nobody
   *   able to say which of them the feature actually depends on.
   *
   * WHY THE DEPENDENCY ARRAY IS EMPTY
   *   The subscription belongs to the mount, not to the schedule. `meetings` must not appear here:
   *   a query that refetches hands back a new array with the same content, and re-arming on its
   *   identity would tear down and restart the helper process on every poll. `meetingRoomIdRef` is
   *   how the callback reads the current meeting without the effect having to depend on it.
   */
  useEffect(() => {
    const stop = watchMeetPresence((next) => {
      setPresence(next);
      if (next.meetWindowVisible && meetingRoomIdRef.current) {
        setSeenRoomId(meetingRoomIdRef.current);
      }
      // Only a sighting that ENDED starts the grace. A first report of "nothing there" is not a
      // loss of anything, and must not be able to raise an offer on its own.
      if (next.meetWindowVisible) {
        setMeetWindowLostAtMs(null);
      } else if (meetWindowVisibleRef.current) {
        setMeetWindowLostAtMs(next.observedAtMs);
      }
      meetWindowVisibleRef.current = next.meetWindowVisible;
      // The clock is otherwise up to one tick stale, and the grace is measured against it.
      setNowMs(Date.now());
    });
    return stop ?? undefined;
  }, []);

  /**
   * Derived during render, not stored.
   *
   * The latch is fed back in as the previous snapshot, which is all `nextBridgeTrigger` needs to
   * know - it compares roomIds itself, so a sighting belonging to last meeting cannot carry into
   * this one, and a stale `seenRoomId` costs nothing.
   */
  const trigger = nextBridgeTrigger(
    seenRoomId ? { state: "ready", roomId: seenRoomId } : IDLE_TRIGGER,
    {
      meeting,
      nowMs,
      meetWindowVisible: presence?.meetWindowVisible ?? false,
      observedMeetCode: presence?.meetCode,
      meetWindowLostAtMs,
      translationStarted: meetingRoomId !== null && meetingRoomId === translatingRoomId,
    },
  );

  // One window, opened when a room takes the trigger and closed when it lets go. Keyed on roomId
  // rather than on the state: `upcoming` and `ready` are both on-screen, and re-opening between
  // them would raise and refocus a window the user had deliberately moved.
  // `offer` has no room by definition, so the target is a route rather than an id. Encoding both
  // in one string keeps this a single comparison: re-running it on every render would raise and
  // refocus a window the user had deliberately moved aside.
  //
  // The state is passed alongside only for the one case the target cannot express: a popup the
  // user CLOSED comes back when the meeting moves forward. The rule is `nextBridgeWindow`.
  const windowTarget = trigger.state === "idle" ? null : targetFor(trigger.roomId);
  const windowLedger = useRef<BridgeWindowLedger>(EMPTY_BRIDGE_WINDOW);
  // Read by the desktop's window events, which arrive long after the render that set them up.
  const windowTargetRef = useRef<string | null>(null);
  const triggerStateRef = useRef<BridgeTriggerState>("idle");
  useEffect(() => {
    windowTargetRef.current = windowTarget;
    triggerStateRef.current = trigger.state;

    const { ledger, command } = nextBridgeWindow(windowLedger.current, windowTarget, trigger.state);
    windowLedger.current = ledger;
    if (command?.kind === "close") {
      void closeTranscriptWindow();
    } else if (command?.kind === "open") {
      void openTranscriptWindow(command.target === OFFER_TARGET ? null : command.target);
    }
  }, [windowTarget, trigger.state]);

  /**
   * The popup's own lifecycle, as the desktop app reports it.
   *
   * The X on the popup used to be invisible from here: the desktop dropped its reference and told
   * nobody, so the ledger went on saying "open" and every later open for the same target was
   * skipped as a no-op. Neither subscription exists on a browser tab or on a desktop build older
   * than the events, which leaves the old behaviour rather than a broken one.
   */
  useEffect(() => {
    const stopClosed = onTranscriptWindowClosed((roomId) => {
      windowLedger.current = bridgeWindowClosed(
        windowLedger.current,
        targetFor(roomId),
        triggerStateRef.current,
      );
    });
    const stopReopened = onTranscriptWindowReopened((roomId) => {
      windowLedger.current = bridgeWindowReopened(
        windowLedger.current,
        targetFor(roomId),
        windowTargetRef.current,
      );
    });
    return () => {
      stopClosed?.();
      stopReopened?.();
    };
  }, []);

  // Closing on unmount would be wrong during navigation - the shell stays mounted, so this only
  // runs when the app itself is going away, and leaving a floating window behind then is what the
  // user would call a bug.
  useEffect(() => {
    return () => {
      if (windowLedger.current.opened) void closeTranscriptWindow();
    };
  }, []);

  // Memoised so the meeting session below the shell does not see a new object on every clock tick.
  const meetSensor = useMemo<MeetSensorReading | null>(
    () =>
      presence === null
        ? null
        : {
            meetWindowVisible: presence.meetWindowVisible,
            meetCode: presence.meetCode,
            meetWindowLostAtMs,
          },
    [presence, meetWindowLostAtMs],
  );

  return { trigger, meetSensor };
}
