"use client";

/**
 * The impure half of bridge-meet-follow.ts: the main window follows the Google Meet call.
 * WT-912 (the mic) and WT-913 (leaving).
 *
 * Every rule is in lib/meeting/bridge-meet-follow, which is pure and tested. What is left here is
 * what cannot be: the desktop subscription, the LiveKit microphone, sessionStorage, and one timer.
 *
 * MOUNTED in PersistentMeetingSession, for an EXTERNAL_BRIDGE room only. `enabled: false` (every
 * native meeting) subscribes to nothing, applies nothing and returns the idle state, so a native
 * meeting behaves exactly as it did.
 *
 * THE MICROPHONE
 *   `meetFollowMicTarget` says what the WarpTalk mic should be, or null for "leave it". It is
 *   applied when it CHANGES and again when LiveKit (re)connects, never on every render: between
 *   two readings the mic belongs to whoever last set it, which is what lets the popup's fallback
 *   chip work where Meet cannot be read.
 *
 *   Applied two ways, because <LiveKitRoom> reads its `audio` prop only at SignalConnected:
 *     - not connected yet: the connect-time INTENT (`setMicrophoneIntent`, the session's
 *       `microphoneEnabled` state), which is what LiveKit publishes with when it connects;
 *     - connected: the local participant itself, through the session's LocalMediaController.
 *   The hub's mute state needs nothing from here: the session already publishes ToggleMute from
 *   the real track state, however it changed.
 *
 *   Every applied value is also written as the room's join record (`rememberBridgeMicrophone`): a
 *   bridge has no pre-join screen to write one, and without it a reload of this window fails
 *   closed to a muted microphone.
 *
 *   THE POPUP CAN OVERRIDE IT (field evidence 2026-10-03: the desktop read Meet's button as muted
 *   while it showed unmuted, and the mic went off with nothing on screen). `setManualMic` while
 *   following Meet is an override in the reducer, held until Meet's button next changes; where
 *   Meet cannot be read it applies directly, as the chip always did. Every applied value is logged
 *   to main.log (`console.warn("[bridge] ...")`, the level the desktop copies) with its reason.
 *
 *   `micIntentRef` is the last value applied: what the mic is MEANT to be, which the session's
 *   self-heal (lib/meeting/mic-self-heal) enforces after a reconnect. Not `microphoneEnabled`, which
 *   mirrors what LiveKit has and so says "off" exactly when a lost publication needs healing.
 *
 *   IF IT DOES NOT TAKE: Meet says unmuted, the mic was asked for, and a few seconds later it is
 *   still off (the device is busy, permission was refused). Saying nothing is the original bug in
 *   a new place, so the control is then reported as "manual" and the popup's chip appears.
 *
 * LEAVING
 *   The reducer starts the 30 s countdown; this hook only runs the clock and calls
 *   `onLeaveDeadline` when it runs out. What that does (end the room, or leave it) is the
 *   session's, because the session owns the native exit.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";

import { watchMeetCall, type MeetCallState } from "@/lib/desktop/bridge";
import {
  INITIAL_MEET_FOLLOW,
  meetFollowLeftCall,
  describeMeetFollowMicReason,
  meetFollowMicControl,
  meetFollowMicOverridden,
  meetFollowMicTarget,
  reduceMeetFollow,
  trustedMeetPhase,
  type MeetFollowEvent,
  type MeetFollowState,
  type MeetMicControl,
} from "@/lib/meeting/bridge-meet-follow";
import { rememberBridgeMicrophone } from "@/lib/meeting/meeting-join-state";

/** How long a microphone that was asked for may stay off before the popup's chip is offered. */
const MIC_NOT_TAKEN_AFTER_MS = 5_000;

type RoomScoped = { roomId: string; state: MeetFollowState };
type RoomScopedEvent = { roomId: string; event: MeetFollowEvent };

function reduceRoomScoped(current: RoomScoped, { roomId, event }: RoomScopedEvent): RoomScoped {
  // A different room starts from nothing: one call's belief must never carry into another's.
  const base = current.roomId === roomId ? current.state : INITIAL_MEET_FOLLOW;
  const next = reduceMeetFollow(base, event);
  return current.roomId === roomId && next === current.state ? current : { roomId, state: next };
}

export type BridgeMeetFollow = {
  state: MeetFollowState;
  /** The desktop's last phase for THIS room's call, "unknown" included; null if never told. */
  callPhase: MeetCallState["phase"] | null;
  /**
   * WT-910 B18: the desktop's last raw reading for THIS room's call (tab or PiP included); null if
   * never told. The recording's picture follows it (lib/meeting/bridge-recording).
   */
  call: MeetCallState | null;
  /** Who decides the WarpTalk mic; "manual" is when the popup's press applies directly. */
  micControl: MeetMicControl;
  /** The mic is on the popup's override of Meet's reading (until Meet's button next changes). */
  micOverridden: boolean;
  /** The last value applied to the mic (null before the first): what it is meant to be. */
  micIntentRef: RefObject<boolean | null>;
  /** The user left the call and has not come back: this desktop stops listening to Meet. */
  leftCall: boolean;
  /**
   * The popup's mic button (and the host's ForceMuted). The relay host has already checked the
   * control is "manual" or "meet". An override while following Meet; applied directly otherwise.
   */
  setManualMic: (enabled: boolean) => void;
  /** "Keep open". */
  keepOpen: () => void;
  /** The countdown was acted on. */
  resolveLeave: () => void;
};

export function useBridgeMeetFollow({
  roomId,
  enabled,
  roomMeetCode,
  liveKitConnected,
  microphoneEnabled,
  localMediaControlRef,
  setMicrophoneIntent,
  onLeaveDeadline,
}: {
  roomId: string;
  /** True only for an EXTERNAL_BRIDGE room. */
  enabled: boolean;
  /** The Meet code in the room's stored Meet URL, when it has one. */
  roomMeetCode: string | null | undefined;
  /** LiveKit reported Connected and has not reported a disconnect since. */
  liveKitConnected: boolean;
  /** The published microphone, as the session mirrors it from LiveKit. */
  microphoneEnabled: boolean;
  /** The session's handle onto the local participant; null until <LiveKitRoom> has mounted. */
  localMediaControlRef: RefObject<{ setMicrophoneEnabled: (enabled: boolean) => void } | null>;
  /** The connect-time intent that feeds <LiveKitRoom audio>. */
  setMicrophoneIntent: (enabled: boolean) => void;
  /** The 30 s ran out with no answer. May be a fresh closure every render. */
  onLeaveDeadline: () => void;
}): BridgeMeetFollow {
  const [scoped, dispatch] = useReducer(reduceRoomScoped, { roomId, state: INITIAL_MEET_FOLLOW });
  const state = scoped.roomId === roomId ? scoped.state : INITIAL_MEET_FOLLOW;
  const [rawCall, setRawCall] = useState<{ roomId: string; call: MeetCallState } | null>(null);

  // ── the desktop's two readings ───────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !roomId) return;
    const stop = watchMeetCall({
      onCallState: (call) => {
        setRawCall({ roomId, call });
        dispatch({ roomId, event: { type: "call-state", state: call, roomMeetCode, now: Date.now() } });
      },
      onSelfMic: (mic) => {
        dispatch({ roomId, event: { type: "self-mic", mic, roomMeetCode } });
      },
    });
    return stop ?? undefined;
  }, [enabled, roomId, roomMeetCode]);

  // ── the microphone ───────────────────────────────────────────────────────
  const liveKitConnectedRef = useRef(liveKitConnected);
  const setMicrophoneIntentRef = useRef(setMicrophoneIntent);
  useEffect(() => {
    liveKitConnectedRef.current = liveKitConnected;
    setMicrophoneIntentRef.current = setMicrophoneIntent;
  });

  const micIntentRef = useRef<boolean | null>(null);
  const applyMicrophone = useCallback(
    (on: boolean, reason: string) => {
      micIntentRef.current = on;
      console.warn(`[bridge] WarpTalk mic → ${on ? "on" : "off"}: ${reason}`);
      try {
        rememberBridgeMicrophone(window.sessionStorage, roomId, on);
      } catch {
        // Storage refused (a locked-down profile): the mic still follows Meet for this sitting.
      }
      const control = localMediaControlRef.current;
      if (liveKitConnectedRef.current && control) control.setMicrophoneEnabled(on);
      else setMicrophoneIntentRef.current(on);
    },
    [roomId, localMediaControlRef],
  );

  const micTarget = enabled ? meetFollowMicTarget(state) : null;
  const micReason = describeMeetFollowMicReason(state);
  const micReasonRef = useRef(micReason);
  useEffect(() => {
    micReasonRef.current = micReason;
  });
  const lastAppliedRef = useRef<{ on: boolean; connected: boolean } | null>(null);
  useEffect(() => {
    if (micTarget === null) return;
    const last = lastAppliedRef.current;
    const reapply = last !== null && last.on === micTarget && liveKitConnected && !last.connected;
    lastAppliedRef.current = { on: micTarget, connected: liveKitConnected };
    applyMicrophone(
      micTarget,
      reapply ? `re-applied after LiveKit connected (${micReasonRef.current})` : micReasonRef.current,
    );
    // `liveKitConnected` on purpose: a (re)connect re-applies what Meet last said, so a reconnect
    // can never come back with a microphone Meet has muted.
  }, [micTarget, liveKitConnected, applyMicrophone]);

  // The popup's press. While following Meet it is an override (the reducer holds it until Meet's
  // button changes, and the effect above applies it); a press for what is already the target —
  // the "it did not take" chip asking again — and every press where Meet cannot be read apply
  // directly, as the chip always did.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const setManualMic = useCallback(
    (on: boolean) => {
      const current = stateRef.current;
      if (meetFollowMicControl(current) === "meet" && meetFollowMicTarget(current) !== on) {
        dispatch({ roomId, event: { type: "mic-override", enabled: on } });
        return;
      }
      applyMicrophone(on, "set by hand in the popup");
    },
    [roomId, applyMicrophone],
  );

  // Asked for, connected, and still off after a while: it did not take. Set and cleared from a
  // timer both, so the chip neither flickers on every unmute nor outlives the fault.
  const [micNotTaken, setMicNotTaken] = useState(false);
  const micWanted = micTarget === true && liveKitConnected && !microphoneEnabled;
  useEffect(() => {
    const timer = window.setTimeout(
      () => setMicNotTaken(micWanted),
      micWanted ? MIC_NOT_TAKEN_AFTER_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [micWanted]);

  // ── leaving ──────────────────────────────────────────────────────────────
  const onLeaveDeadlineRef = useRef(onLeaveDeadline);
  useEffect(() => {
    onLeaveDeadlineRef.current = onLeaveDeadline;
  });
  const leaveEndsAtMs = enabled ? (state.leave?.endsAtMs ?? null) : null;
  useEffect(() => {
    if (leaveEndsAtMs === null) return;
    const timer = window.setTimeout(
      () => onLeaveDeadlineRef.current(),
      Math.max(0, leaveEndsAtMs - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [leaveEndsAtMs]);

  const keepOpen = useCallback(() => dispatch({ roomId, event: { type: "keep-open" } }), [roomId]);
  const resolveLeave = useCallback(
    () => dispatch({ roomId, event: { type: "leave-resolved" } }),
    [roomId],
  );

  const callPhase =
    enabled && rawCall?.roomId === roomId ? trustedMeetPhase(rawCall.call, roomMeetCode) : null;
  const call = enabled && rawCall?.roomId === roomId ? rawCall.call : null;
  const derivedControl = meetFollowMicControl(state);
  const micControl: MeetMicControl =
    derivedControl === "meet" && micNotTaken && micWanted ? "manual" : derivedControl;
  const micOverridden = enabled && micControl === "meet" && meetFollowMicOverridden(state);
  const leftCall = enabled && meetFollowLeftCall(state);

  return useMemo(
    () => ({
      state,
      callPhase,
      call,
      micControl,
      micOverridden,
      micIntentRef,
      leftCall,
      setManualMic,
      keepOpen,
      resolveLeave,
    }),
    [state, callPhase, call, micControl, micOverridden, leftCall, setManualMic, keepOpen, resolveLeave],
  );
}
