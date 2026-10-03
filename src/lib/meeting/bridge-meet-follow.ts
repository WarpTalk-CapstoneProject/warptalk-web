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
 * THE SENSOR CAN BE WRONG, SO THE USER CAN OVERRIDE IT (field evidence, 2026-10-03)
 *   The desktop's reading of Meet's mute button flapped (muted / unmuted within a second) and
 *   settled on "muted" while the button visibly showed unmuted; WarpTalk then heard nothing of the
 *   host, and the popup said nothing because the mic was "following Meet". The popup now always
 *   shows the WarpTalk mic, and its press while following Meet is an OVERRIDE (`micOverride`): it
 *   wins over Meet's reading until that reading next CHANGES (any flip of the button, a real one or
 *   a flap) or the user leaves the call. It never fights the follow loop: the next change of Meet's
 *   button is the user operating Meet again, and Meet is the source of truth again from there.
 *
 * THE FALLBACK IS A CHIP, NOT A GATE
 *   An older desktop, macOS, or a Meet the sensor cannot read never yields a mic reading. The mic
 *   then stays off, and the popup offers one compact chip to turn it on by hand (`micControl:
 *   "manual"`), validated here by `acceptsManualMic`. While the mic follows Meet there is no chip.
 *   The Google Meet plugin is never asked for, hinted at or required.
 *
 * CLOSING THE MEET TAB IS LEAVING (PO, 2026-10-03)
 *   A newer desktop says WHY a call was left: the tab was closed, navigated away, its window closed
 *   or the browser is gone (`MeetCallTabGoneReason`). That is the same `left` and the same 30 s
 *   countdown - closing the Meet tab means the Meet ended for this user - and only the popup's
 *   wording changes (`leaveCause`). A desktop that never sends a reason reads as an ordinary leave.
 *
 * AN END THAT FAILS IS TRIED AGAIN (prod incident 2026-10-03)
 *   The countdown used to be cleared the moment it ran out, before the End was even sent. With the
 *   backend hung at that moment the End failed, a toast nobody saw said so (the user is looking at
 *   Meet), and the room stayed open with nothing left to end it - an orphan that then held the
 *   bridge trigger. So the leave now stays pending until the End lands: a failure that could pass
 *   on another try (`meetLeaveFailureRetryable`) pushes the deadline out by a growing delay
 *   (`meetLeaveRetryDelayMs`) and the same timer fires again. It stops the way any leave stops:
 *   "Keep open", or the user back `in-call`. A failure no retry can change (the server refusing
 *   this user, say) drops the leave instead of knocking on the same door forever.
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import type { MeetCallState, MeetCallTabGoneReason, MeetSelfMic } from "../desktop/bridge.ts";

/** How long after the user leaves the Meet call the room is ended (or left) unless they answer. */
export const MEET_LEFT_COUNTDOWN_MS = 30_000;

/** The first retry of a failed End after the countdown, doubling from here. */
export const MEET_LEAVE_RETRY_BASE_MS = 5_000;
/** The longest gap between two retries: a hung backend is retried about once a minute. */
export const MEET_LEAVE_RETRY_MAX_MS = 60_000;

/**
 * What made the user leave, for the popup's wording only. The flow is identical.
 *
 *   left-call   Meet's own Leave button (or any `left` the desktop gave no tab-gone reason for)
 *   tab-closed  the Meet tab, its window or the browser went away
 */
export type MeetLeaveCause = "left-call" | "tab-closed";

const TAB_GONE_REASONS: readonly MeetCallTabGoneReason[] = [
  "tab-closed",
  "tab-navigated",
  "window-closed",
  "browser-gone",
];

/** The cause a `left` reading's `reason` names. Unknown and absent reasons are a plain leave. */
export function meetLeaveCause(reason: string | null | undefined): MeetLeaveCause {
  return reason && (TAB_GONE_REASONS as readonly string[]).includes(reason) ? "tab-closed" : "left-call";
}

/** How long to wait before retry number `failures` (1-based) of a failed End. */
export function meetLeaveRetryDelayMs(failures: number): number {
  const exponent = Math.max(0, failures - 1);
  return Math.min(MEET_LEAVE_RETRY_MAX_MS, MEET_LEAVE_RETRY_BASE_MS * 2 ** exponent);
}

/**
 * Whether a failed End (or Leave) might succeed on another try.
 *
 * The same line `canConnectToRoom` draws: no response at all (a timeout, a dropped connection), a
 * 5xx, 408 and 429 are the server not answering yet; any other 4xx is the server answering, and
 * the same request will get the same answer.
 */
export function meetLeaveFailureRetryable(httpStatus: number | undefined): boolean {
  if (httpStatus === undefined) return true;
  return httpStatus >= 500 || httpStatus === 408 || httpStatus === 429;
}

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
  /**
   * The countdown running after the user left the call, or null. `failures` counts Ends that did
   * not land; absent until the first one fails. See AN END THAT FAILS IS TRIED AGAIN.
   */
  leave: { endsAtMs: number; failures?: number } | null;
  /** Why the last leave happened, for the popup's wording; null (or absent) before the first. */
  leaveCause?: MeetLeaveCause | null;
  /** "Keep open" was pressed for this leave; cleared by the next `in-call`. */
  leaveKept: boolean;
  /**
   * The popup's override of Meet's reading, or null. Held until Meet's reading next changes, or the
   * user leaves the call. See THE SENSOR CAN BE WRONG above.
   */
  micOverride: boolean | null;
};

export const INITIAL_MEET_FOLLOW: MeetFollowState = {
  believed: null,
  leaveArmed: false,
  meetMuted: null,
  leave: null,
  leaveKept: false,
  micOverride: null,
};

export type MeetFollowEvent =
  | { type: "call-state"; state: MeetCallState; roomMeetCode?: string | null; now: number }
  | { type: "self-mic"; mic: MeetSelfMic; roomMeetCode?: string | null }
  /** "Keep open" in the popup: no end for this leave, and no prompt until the next one. */
  | { type: "keep-open" }
  /** The countdown was acted on (ended, left) and must not fire again. */
  | { type: "leave-resolved" }
  /** The End (or Leave) the countdown ran into did not land. See AN END THAT FAILS IS TRIED AGAIN. */
  | { type: "leave-failed"; now: number; retryable: boolean }
  /** The popup's press while the mic follows Meet: overrides Meet's reading (see above). */
  | { type: "mic-override"; enabled: boolean };

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
          // from here still counts as leaving. An override was for that call, and ends with it.
          return state.believed === "lobby" ? state : { ...state, believed: "lobby", micOverride: null };
        case "left": {
          if (!state.leaveArmed) {
            return state.believed === "left" ? state : { ...state, believed: "left", micOverride: null };
          }
          return {
            ...state,
            believed: "left",
            micOverride: null,
            leaveArmed: false,
            leave: { endsAtMs: event.now + MEET_LEFT_COUNTDOWN_MS },
            leaveCause: meetLeaveCause(call.reason),
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
      // A change of Meet's button ends an override: the user is operating Meet again.
      return state.meetMuted === mic.muted ? state : { ...state, meetMuted: mic.muted, micOverride: null };
    }
    case "mic-override": {
      // Only while the mic follows Meet. Elsewhere there is no reading to override: the chip
      // applies directly ("manual"), or the user is not in the call ("none").
      if (meetFollowMicControl(state) !== "meet") return state;
      // Pressing for what Meet already says is not an override; it also ends one.
      const micOverride = event.enabled === !state.meetMuted ? null : event.enabled;
      return state.micOverride === micOverride ? state : { ...state, micOverride };
    }
    case "keep-open":
      return state.leave ? { ...state, leave: null, leaveKept: true } : state;
    case "leave-resolved":
      return state.leave ? { ...state, leave: null } : state;
    case "leave-failed": {
      // Nothing pending: the user rejoined or chose Keep open while the request was in flight.
      if (!state.leave) return state;
      if (!event.retryable) return { ...state, leave: null };
      const failures = (state.leave.failures ?? 0) + 1;
      return { ...state, leave: { endsAtMs: event.now + meetLeaveRetryDelayMs(failures), failures } };
    }
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
 *   in the call, Meet's button read  → the popup's override if there is one, else the opposite of
 *                                      muted
 *   in the call, never read          → null: stays off, and the popup's chip is the way to turn it on
 *   lobby / left                     → off. Not in the call, so nothing of theirs is published
 *   never told a phase               → null: an older desktop, macOS. The chip again
 */
export function meetFollowMicTarget(state: MeetFollowState): boolean | null {
  if (state.believed === "in-call") {
    if (state.meetMuted === null) return null;
    return state.micOverride ?? !state.meetMuted;
  }
  if (state.believed === "lobby" || state.believed === "left") return false;
  return null;
}

/**
 * Who decides the WarpTalk mic right now.
 *
 *   "meet"    it follows Meet's button (or the popup's override of it, until the button changes)
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
 * Whether the popup's mic button may change the mic: while Meet's button cannot be read (the chip,
 * applied directly) and while it follows Meet (an override, held until Meet's button next changes:
 * see THE SENSOR CAN BE WRONG). Not while the user is out of the call: nothing of theirs is
 * published there, and a press from before they left is stale.
 */
export function acceptsManualMic(control: MeetMicControl | undefined): boolean {
  return control === "manual" || control === "meet";
}

/** Whether the mic is on the popup's override rather than on Meet's reading right now. */
export function meetFollowMicOverridden(state: MeetFollowState): boolean {
  return meetFollowMicControl(state) === "meet" && state.micOverride !== null;
}

/**
 * Why `meetFollowMicTarget` is what it is, in words for main.log. Every applied on/off is logged
 * with it, so a mic that went off can be traced to the reading (or the press) that turned it off.
 */
export function describeMeetFollowMicReason(state: MeetFollowState): string {
  if (state.believed === "lobby") return "the user is in the Meet lobby";
  if (state.believed === "left") return "the user left the Meet call";
  if (state.believed === "in-call" && state.meetMuted !== null) {
    const reading = state.meetMuted ? "muted" : "unmuted";
    if (state.micOverride !== null) {
      return `overridden in the popup (Meet's button reads ${reading}; held until it changes)`;
    }
    return `Meet's mute button reads ${reading}`;
  }
  return "Meet's mute button cannot be read";
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
 * `cause` picks the wording ("The Google Meet tab was closed" for the tab-gone family) and
 * `retrying` says the End already failed and the countdown is now the wait for the next try. Both
 * optional, so a snapshot without them still reads as the plain leave it always was.
 *
 * Only for someone who may end the room. A member is asked nothing: their countdown runs silently
 * and ends in a leave, and they have no "kept" state to report.
 */
export type MeetLeavePrompt =
  | { state: "countdown"; endsAtMs: number; cause?: MeetLeaveCause; retrying?: boolean }
  | { state: "kept"; cause?: MeetLeaveCause };

export function meetLeavePrompt(
  state: MeetFollowState,
  input: { mayEndRoom: boolean },
): MeetLeavePrompt | undefined {
  if (!input.mayEndRoom) return undefined;
  // Only the tab-gone cause is written out: a plain leave stays the exact shape it always had.
  const cause = state.leaveCause === "tab-closed" ? ({ cause: "tab-closed" } as const) : {};
  if (state.leave) {
    return {
      state: "countdown",
      endsAtMs: state.leave.endsAtMs,
      ...cause,
      ...(state.leave.failures ? { retrying: true } : {}),
    };
  }
  if (state.leaveKept && state.believed === "left") return { state: "kept", ...cause };
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
