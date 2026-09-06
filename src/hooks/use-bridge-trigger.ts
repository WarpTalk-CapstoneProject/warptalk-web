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
  /** Bridge meetings that could be in play. Empty disables the trigger entirely. */
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

  // The sensor runs only while there is something it could be about. `meetings.length` rather than
  // the array itself: a query that refetches hands back a new array with the same content, and
  // depending on its identity would tear down and re-arm the OS-level watcher on every poll.
  const armed = meetings.length > 0;
  useEffect(() => {
    if (!armed) return;
    // Null on a browser tab or a desktop build without the sensor. Nothing to clean up, and the
    // schedule half of the trigger carries on working without it.
    const stop = watchMeetPresence((next) => {
      setPresence(next);
      if (next.meetWindowVisible && meetingRoomIdRef.current) {
        setSeenRoomId(meetingRoomIdRef.current);
      }
    });
    return stop ?? undefined;
  }, [armed]);

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
