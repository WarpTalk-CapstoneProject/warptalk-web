"use client";

import { useEffect, useRef, useState } from "react";

import {
  closeTranscriptWindow,
  openTranscriptWindow,
  watchMeetPresence,
  type MeetPresence,
} from "@/lib/desktop/bridge";
import {
  IDLE_TRIGGER,
  nextBridgeTrigger,
  selectTriggerMeeting,
  type BridgeTriggerSnapshot,
  type TriggerMeeting,
} from "@/lib/meeting/bridge-trigger";

/**
 * The impure half of the bridge trigger: arms the sensor, keeps a clock, opens and closes the
 * floating window.
 *
 * Every rule worth arguing about lives in lib/meeting/bridge-trigger.ts, which is pure and tested.
 * What is left here is the plumbing that cannot be: subscriptions, a timer, and one window whose
 * open/close must not be called on every render.
 *
 * OWNERSHIP
 *   This hook is the only caller of openTranscriptWindow/closeTranscriptWindow. That is the point.
 *   The old arrangement opened the window from inside the meeting-session component, so the window
 *   lived and died with a React subtree on a route the user is not even looking at during an
 *   external-bridge meeting - they are in Google Meet. One owner, mounted at the shell, is what
 *   makes the window able to outlive any particular page.
 */

/** How often the clock is re-read. The trigger window has minute-scale edges; this is plenty. */
const TICK_MS = 15_000;

/** Stands in for a roomId in the one state that has none. */
const OFFER_TARGET = "__offer__";

export interface UseBridgeTriggerOptions {
  /**
   * Bridge meetings that could be in play, for the SCHEDULE half of the trigger.
   *
   * Empty is a normal, expected state and disables nothing. An empty list is precisely the flow-2
   * case - a Meet call with no WarpTalk room behind it - which is the one the `offer` state exists
   * to catch. It used to gate the sensor; see the arming comment below for why it no longer can.
   */
  meetings: readonly TriggerMeeting[];
  translationStarted?: boolean;
}

export function useBridgeTrigger({
  meetings,
  translationStarted = false,
}: UseBridgeTriggerOptions): BridgeTriggerSnapshot {
  const [presence, setPresence] = useState<MeetPresence | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
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

  const meeting = selectTriggerMeeting(meetings, nowMs);
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
      translationStarted,
    },
  );

  // One window, opened when a room takes the trigger and closed when it lets go. Keyed on roomId
  // rather than on the state: `upcoming` and `ready` are both on-screen, and re-opening between
  // them would raise and refocus a window the user had deliberately moved.
  // `offer` has no room by definition, so the target is a route rather than an id. Encoding both
  // in one string keeps this a single comparison: re-running it on every render would raise and
  // refocus a window the user had deliberately moved aside.
  const windowTarget = trigger.state === "idle" ? null : (trigger.roomId ?? OFFER_TARGET);
  const openedTarget = useRef<string | null>(null);
  useEffect(() => {
    if (windowTarget === openedTarget.current) return;
    openedTarget.current = windowTarget;
    if (windowTarget === null) {
      void closeTranscriptWindow();
    } else {
      void openTranscriptWindow(windowTarget === OFFER_TARGET ? null : windowTarget);
    }
  }, [windowTarget]);

  // Closing on unmount would be wrong during navigation - the shell stays mounted, so this only
  // runs when the app itself is going away, and leaving a floating window behind then is what the
  // user would call a bug.
  useEffect(() => {
    return () => {
      if (openedTarget.current) void closeTranscriptWindow();
    };
  }, []);

  return trigger;
}
