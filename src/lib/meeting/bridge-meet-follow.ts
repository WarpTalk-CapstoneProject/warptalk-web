/**
 * A bridge room follows its Google Meet call: the pure half. WT-912 (mic) and WT-913 (leaving).
 *
 * THE DECISION (PO, 2026-10-02)
 *   A bridge has no pre-join screen and no End button. Meet is the source of truth: the user only
 *   operates Meet, and WarpTalk follows silently. The desktop reads two facts from Meet's own
 *   buttons by UI Automation (lib/desktop/bridge `MeetCallState`, `MeetSelfMic`) and this module
 *   turns them into what the main window does:
 *
 *     in the call, Meet unmuted   → the WarpTalk mic is on (and the hub says unmuted)
 *     in the call, Meet muted     → the WarpTalk mic is off
 *     lobby / left                → the WarpTalk mic is off: the user is not in the call
 *     left, after being in it     → a 30 s countdown, then the room ends (whoever may end it) or
 *                                   this desktop leaves it (a member). Rejoining cancels silently.
 *
 * WHAT WENT WRONG WITHOUT IT
 *   - The room is opened by use-bridge-auto-room with no join record, so the media preferences
 *     fail closed (`microphoneEnabled: false`) and nothing ever turned the mic on: WarpTalk never
 *     heard the user, and their own speech was missing from the transcript.
 *   - Leaving Meet ended nothing. The room stayed open and its artifacts were never finalized.
 *
 * "unknown" IS NOT A STATE
 *   The desktop says `unknown` whenever it cannot read Meet: a background tab with no
 *   Picture-in-Picture window, a failed read, macOS. It never means the call ended, so it changes
 *   nothing here: whatever was believed before stays believed. The same for a mic reading that is
 *   `stale` or `null`: the last value applied stays applied.
 *
 * WHICH CALL
 *   A reading is trusted only when its `meetCode` is the room's, or when one of the two is absent
 *   (a PiP window whose title carried no code; a room whose URL has none). A code that DISAGREES
 *   is another call, and must neither unmute this room nor end it.
 *
 * THE FALLBACK IS A CHIP, NOT A GATE
 *   An older desktop, macOS, or a Meet the sensor cannot read never yields a mic reading. The mic
 *   then stays off, and the popup offers one compact chip to turn it on by hand (`micControl:
 *   "manual"`), validated here by `acceptsManualMic`. While the mic follows Meet there is no chip.
 *   The Google Meet plugin is never asked for, hinted at or required.
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import type { MeetCallState, MeetSelfMic } from "../desktop/bridge.ts";

/** How long after the user leaves the Meet call the room is ended (or left) unless they answer. */
export const MEET_LEFT_COUNTDOWN_MS = 30_000;

/** Whether a desktop reading is about this room's Meet call. See WHICH CALL above. */
export function trustsMeetReading(
  readingMeetCode: string | null | undefined,
  roomMeetCode: string | null | undefined,
): boolean {
  if (!readingMeetCode || !roomMeetCode) return true;
  return readingMeetCode.trim().toLowerCase() === roomMeetCode.trim().toLowerCase();
}

export type MeetFollowState = {
  /**
   * The last phase the desktop was SURE of for this room's call; null until it has said one.
   * Never "unknown": that changes nothing.
   */
  believed: "lobby" | "in-call" | "left" | null;
  /**
   * The user has been in the call since the last time a leave was counted down or kept open, so
   * the next `left` is a real leave. A `left` page that was never joined does not arm anything.
   */
  leaveArmed: boolean;
  /** Meet's mute button as last READ (fresh, not stale); null until it has been read once. */
  meetMuted: boolean | null;
  /** The countdown running after the user left the call, or null. */
  leave: { endsAtMs: number } | null;
  /** "Keep open" was pressed for this leave; cleared by the next `in-call`. */
  leaveKept: boolean;
};

export const INITIAL_MEET_FOLLOW: MeetFollowState = {
  believed: null,
  leaveArmed: false,
  meetMuted: null,
  leave: null,
  leaveKept: false,
};

export type MeetFollowEvent =
  | { type: "call-state"; state: MeetCallState; roomMeetCode?: string | null; now: number }
  | { type: "self-mic"; mic: MeetSelfMic; roomMeetCode?: string | null }
  /** "Keep open" in the popup: no end for this leave, and no prompt until the next one. */
  | { type: "keep-open" }
  /** The countdown was acted on (ended, left) and must not fire again. */
  | { type: "leave-resolved" };

export function reduceMeetFollow(state: MeetFollowState, event: MeetFollowEvent): MeetFollowState {
  switch (event.type) {
    case "call-state": {
      const { state: call } = event;
      if (!trustsMeetReading(call.meetCode, event.roomMeetCode)) return state;
      switch (call.phase) {
        case "in-call":
          if (state.believed === "in-call" && state.leaveArmed && !state.leave && !state.leaveKept) {
            return state;
          }
          // Back in the call (Rejoin) cancels a countdown without a word, and re-arms the next leave.
          return { ...state, believed: "in-call", leaveArmed: true, leave: null, leaveKept: false };
        case "lobby":
          // The join screen: not in the call. A countdown already running keeps running, since only
          // being back IN the call cancels it; and an armed leave stays armed, so closing the tab
          // from here still counts as leaving.
          return state.believed === "lobby" ? state : { ...state, believed: "lobby" };
        case "left": {
          if (!state.leaveArmed) {
            return state.believed === "left" ? state : { ...state, believed: "left" };
          }
          return {
            ...state,
            believed: "left",
            leaveArmed: false,
            leave: { endsAtMs: event.now + MEET_LEFT_COUNTDOWN_MS },
            leaveKept: false,
          };
        }
        default:
          // "unknown", and any phase a newer desktop may add: nothing is known, nothing changes.
          return state;
      }
    }
    case "self-mic": {
      const { mic } = event;
      if (!trustsMeetReading(mic.meetCode, event.roomMeetCode)) return state;
      // Stale or unreadable: keep the last value that was actually read.
      if (mic.stale || typeof mic.muted !== "boolean") return state;
      return state.meetMuted === mic.muted ? state : { ...state, meetMuted: mic.muted };
    }
    case "keep-open":
      return state.leave ? { ...state, leave: null, leaveKept: true } : state;
    case "leave-resolved":
      return state.leave ? { ...state, leave: null } : state;
    default:
      return state;
  }
}

/** Whether the user is in the Meet call, as far as the desktop has been able to say. */
export function meetFollowInCall(state: MeetFollowState): boolean {
  return state.believed === "in-call";
}

/**
 * The user left the call and has not come back. This desktop then stops listening to Meet (its own
 * mic and the far side's capture): what the browser plays after the call is not the meeting.
 */
export function meetFollowLeftCall(state: MeetFollowState): boolean {
  return state.believed === "left";
}

/**
 * What the WarpTalk microphone should be, or null for "leave it as it is".
 *
 *   in the call, Meet's button read  → the opposite of muted
 *   in the call, never read          → null: stays off, and the popup's chip is the way to turn it on
 *   lobby / left                     → off. Not in the call, so nothing of theirs is published
 *   never told a phase               → null: an older desktop, macOS. The chip again
 */
export function meetFollowMicTarget(state: MeetFollowState): boolean | null {
  if (state.believed === "in-call") return state.meetMuted === null ? null : !state.meetMuted;
  if (state.believed === "lobby" || state.believed === "left") return false;
  return null;
}

/**
 * Who decides the WarpTalk mic right now.
 *
 *   "meet"    it follows Meet's button; the popup shows nothing
 *   "manual"  Meet's button cannot be read; the popup offers the chip
 *   "none"    the user is not in the call (lobby, left): no mic, and no chip to turn one on
 */
export type MeetMicControl = "meet" | "manual" | "none";

export function meetFollowMicControl(state: MeetFollowState): MeetMicControl {
  if (state.believed === "lobby" || state.believed === "left") return "none";
  if (state.believed === "in-call" && state.meetMuted !== null) return "meet";
  return "manual";
}

/**
 * Whether the popup's chip may change the mic: only while Meet's button cannot be read. A press
 * that arrives after the mic started following Meet is stale, and applying it would put WarpTalk
 * out of step with the one button the user is told to use. Rejected, never reinterpreted.
 */
export function acceptsManualMic(control: MeetMicControl | undefined): boolean {
  return control === "manual";
}

/** What the main window does when a leave's countdown runs out, or "End now" is pressed. */
export type MeetLeaveOutcome = "end-room" | "leave-room";

/**
 * Ending is for whoever may end the room: the room's host, the only one the server accepts an End
 * from in a bridge (a capturer who is not the host is refused there, so they are a member here).
 * Anyone else only leaves on their own side, and the room stays for the others.
 */
export function meetLeaveOutcome(input: { mayEndRoom: boolean }): MeetLeaveOutcome {
  return input.mayEndRoom ? "end-room" : "leave-room";
}

/**
 * What the popup is told about a leave, or undefined for nothing.
 *
 *   countdown  "You left the Meet call. End the WarpTalk room?" with End now / Keep open
 *   kept       the room was kept open; said so, because this desktop no longer listens to Meet
 *
 * Only for someone who may end the room. A member is asked nothing: their countdown runs silently
 * and ends in a leave, and they have no "kept" state to report.
 */
export type MeetLeavePrompt = { state: "countdown"; endsAtMs: number } | { state: "kept" };

export function meetLeavePrompt(
  state: MeetFollowState,
  input: { mayEndRoom: boolean },
): MeetLeavePrompt | undefined {
  if (!input.mayEndRoom) return undefined;
  if (state.leave) return { state: "countdown", endsAtMs: state.leave.endsAtMs };
  if (state.leaveKept && state.believed === "left") return { state: "kept" };
  return undefined;
}

/** Whole seconds left on a countdown, never negative: what the popup prints. */
export function meetLeaveSecondsLeft(endsAtMs: number, now: number): number {
  return Math.max(0, Math.ceil((endsAtMs - now) / 1000));
}

/**
 * What the idle reaper is told about the Meet call (lib/meeting/meeting-session-lifecycle).
 *
 * The RAW last phase for this room, "unknown" included, because the reaper's question is a
 * different one: not "what do we believe" but "is there evidence of a live call right now". Null
 * until a trusted reading has arrived (an older desktop never sends one).
 */
export function trustedMeetPhase(
  call: MeetCallState | null | undefined,
  roomMeetCode: string | null | undefined,
): MeetCallState["phase"] | null {
  if (!call || !trustsMeetReading(call.meetCode, roomMeetCode)) return null;
  return call.phase;
}
