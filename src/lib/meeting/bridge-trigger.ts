/**
 * When the external-bridge widget should be on screen, and in which of its four shapes.
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 *   The widget used to appear because the user had opened the room in WarpTalk. That is backwards
 *   for a meeting held in Google Meet: the call is the thing that starts, not the WarpTalk page,
 *   and a user who goes straight to their browser got nothing at all. So the trigger now comes
 *   from two facts about the world - the meeting is near, and a Meet window is on screen - neither
 *   of which is "the user navigated here".
 *
 * TWO SIGNALS, NOT ONE
 *   They answer different questions and both are worth surfacing. The schedule says "it is time";
 *   the window says "they are in there". Collapsing them would throw away the first, which is the
 *   only one that works with no window knowledge at all - every browser, every platform, and macOS
 *   without screen-recording permission. `upcoming` is a real product state, not a waiting room:
 *   it is where the Open Google Meet button finally has a job to do.
 *
 * WHY THIS IS PURE
 *   Same reason as bridge-tiers.ts, its neighbour: the rule most likely to need tuning is the one
 *   that must be testable without a desktop build. The impure half - arming the sensor, opening
 *   the window - lives in the hook that calls this.
 */

/** The room code Meet puts in a join URL, e.g. `abc-defg-hij`. */
const MEET_CODE_IN_URL = /\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})(?:[/?#]|$)/i;

export type BridgeTriggerState =
  /** Nothing to show. */
  | "idle"
  /**
   * A Meet call is on screen that no WarpTalk room accounts for: the user made one on the spot.
   *
   * The second of the two flows, not an edge of the first. Someone who opens Google Meet and
   * starts talking never touched WarpTalk, so there is no room to attach a transcript to yet -
   * this state is the offer to make one.
   */
  | "offer"
  /** The meeting is near but no Meet window has been seen: offer to open it. */
  | "upcoming"
  /** A Meet window is up: offer to start translating. Consent is asked on the way out of here. */
  | "ready"
  /** Translation is running. */
  | "running";

export interface TriggerMeeting {
  roomId: string;
  startsAtMs: number;
  /**
   * When the meeting is known to end. Absent for rooms with no end time; see the tail constant.
   *
   * The room DTO carries no booked end, so in practice this is `endedAt`: the one end the server
   * actually knows. It is a ceiling on the schedule, never on a translation that is running - see
   * `selectTriggerMeeting`.
   */
  endsAtMs?: number;
  /** From the room's stored Meet URL. Used to tell two concurrent meetings apart when it can. */
  meetCode?: string;
}

export interface BridgeTriggerSnapshot {
  state: BridgeTriggerState;
  /** Which meeting the state belongs to, so a latch cannot leak across meetings. */
  roomId: string | null;
}

export interface BridgeTriggerInput {
  /** The bridge meeting in play, or null when none is. */
  meeting: TriggerMeeting | null;
  nowMs: number;
  /** The desktop app saw a Meet window. Always false in a browser tab. */
  meetWindowVisible: boolean;
  /** The code that window's title carried, when it carried one. */
  observedMeetCode?: string;
  /**
   * When the sensor stopped seeing a Meet window, or null while one is on screen or none has been
   * seen. Only the offer reads it; see OFFER_GRACE_MS.
   */
  meetWindowLostAtMs?: number | null;
  /** Translation is running in THIS meeting - not merely in some meeting. */
  translationStarted: boolean;
}

/**
 * How early the widget offers itself.
 *
 * Five minutes rather than one: the user has to open Meet, let the browser load and pick a camera
 * before anything can be translated, and a prompt that lands exactly at the start time arrives
 * after the part it was meant to help with.
 */
export const TRIGGER_LEAD_MS = 5 * 60_000;

/**
 * How long a meeting with no end time stays eligible.
 *
 * A ceiling rather than a guess at the real length: without it a room created once would keep the
 * widget armed - and the window sensor polling - for the rest of the session. An hour is long
 * enough that a normal call never trips it and short enough that a forgotten room stops costing
 * anything.
 */
export const DEFAULT_MEETING_TAIL_MS = 60 * 60_000;

/**
 * How long an offer outlives the sighting that raised it.
 *
 * Switching away from the Meet tab ends the sighting before Chrome's automatic picture-in-picture
 * starts the next one, and the watcher only looks every 3 s (warptalk-desktop meet-presence.ts), so
 * the gap is one or two polls. Following the sensor exactly closed the offer in that gap and opened
 * it again - a second focus steal and a second notification for a call the user never left. Eight
 * seconds covers two missed polls and a slow PiP, and is still short enough that an offer for a
 * call that really ended does not linger.
 */
export const OFFER_GRACE_MS = 8_000;

export const IDLE_TRIGGER: BridgeTriggerSnapshot = { state: "idle", roomId: null };

/** No room yet, by definition - that is what the offer is for. */
export const OFFER_TRIGGER: BridgeTriggerSnapshot = { state: "offer", roomId: null };

/** The Meet room code in a join URL, or undefined when there is not one to read. */
export function extractMeetCodeFromUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const match = MEET_CODE_IN_URL.exec(url);
  return match ? match[1].toLowerCase() : undefined;
}

export function triggerWindowEndMs(meeting: TriggerMeeting): number {
  return meeting.endsAtMs ?? meeting.startsAtMs + DEFAULT_MEETING_TAIL_MS;
}

export function isWithinTriggerWindow(meeting: TriggerMeeting, nowMs: number): boolean {
  return nowMs >= meeting.startsAtMs - TRIGGER_LEAD_MS && nowMs <= triggerWindowEndMs(meeting);
}

/**
 * The meeting the widget is about, out of everything on the schedule.
 *
 * Only ever one: two widgets over one browser window would be worse than the problem they solve.
 * Ties go to the meeting that starts soonest, which is the one the user is walking into.
 *
 * A meeting being translated wins outright, whatever the clock says. The window above is a guess
 * at when a meeting might matter; a running translation is proof that it does. Without this, a
 * room with no end time fell out of its window at start + DEFAULT_MEETING_TAIL_MS in the middle of
 * the call, and the popup carrying Stop translation was closed - or, with Meet still on screen,
 * navigated to the offer for the very call it was translating.
 *
 * THE SIGHTING NARROWS THE CLOCK (prod incident 2026-10-03)
 *   Picking by clock alone let a room that was never ended - its session torn down under it while
 *   the backend hung - hold the selection for the whole one-hour tail. A selected meeting can only
 *   ever be `upcoming` or `ready`, never `offer`, so the next Meet call the user opened was never
 *   claimed: one call re-opened the popup for the OLD room, the one after it got no popup at all.
 *   The clock says what COULD be in play; a Meet code on screen says what IS. So, after the window:
 *     - a room whose code matches the sighting is the answer, whatever else the clock allows;
 *     - otherwise a room whose KNOWN code differs is a different call and drops out. A room with no
 *       code stays, for the same reason `codeConflict` lets a missing code through: Meet drops the
 *       code from the title once the event has a name, and absence proves nothing either way.
 *   If that leaves nothing, the reducer is handed no meeting, and a visible Meet window is exactly
 *   the `offer` that claims a room for it.
 *
 * THE PREFERRED ROOM
 *   `preferredRoomId` is the room a Meet window was last seen for (the hook's latch). It decides
 *   between survivors so that a sighting with no code to compare - picture-in-picture, a hidden tab
 *   - keeps the call the user is actually in instead of letting the clock jump to whichever room
 *   starts nearest, e.g. a scheduled meeting in its 5-minute lead or an older room still in its tail.
 *   It never outranks the code filter: it only picks among rooms the sighting has not ruled out.
 *
 * WHAT THIS DELIBERATELY DOES NOT SOLVE (PO 2026-10-03: tech debt)
 *   A user in Meet A, not translating, who opens a second Meet tab B. The selection follows the
 *   sighting, so the trigger moves to B (or offers B) and back to A when A's tab is in front again;
 *   there is no notion of "the bridge room this window is already carrying". Only the translating
 *   room is pinned, which is the case where moving would actually take controls away.
 *
 * With no observed code and no preferred room this is exactly the old rule: nearest start wins.
 */
export function selectTriggerMeeting(
  meetings: readonly TriggerMeeting[],
  nowMs: number,
  translatingRoomId: string | null = null,
  observedMeetCode?: string | null,
  preferredRoomId?: string | null,
): TriggerMeeting | null {
  if (translatingRoomId) {
    const translating = meetings.find((meeting) => meeting.roomId === translatingRoomId);
    if (translating) return translating;
  }

  let eligible = meetings.filter((meeting) => isWithinTriggerWindow(meeting, nowMs));

  if (observedMeetCode) {
    const matching = eligible.filter((meeting) => meeting.meetCode === observedMeetCode);
    eligible = matching.length > 0 ? matching : eligible.filter((meeting) => !meeting.meetCode);
  }

  if (eligible.length === 0) return null;

  if (preferredRoomId) {
    const preferred = eligible.find((meeting) => meeting.roomId === preferredRoomId);
    if (preferred) return preferred;
  }

  return eligible.reduce((best, meeting) =>
    Math.abs(meeting.startsAtMs - nowMs) < Math.abs(best.startsAtMs - nowMs) ? meeting : best,
  );
}

export interface SightingLatchInput {
  meetings: readonly TriggerMeeting[];
  nowMs: number;
  translatingRoomId: string | null;
  /** The code the NEW sighting carried, if any - not the one the last render saw. */
  observedMeetCode?: string | null;
  /** The room the latch holds now, so a code-less sighting keeps it rather than jumping. */
  preferredRoomId?: string | null;
}

/**
 * The room a visible Meet window counts as a sighting of, or null when it is nobody's.
 *
 * WHY THIS EXISTS (prod incident 2026-10-03)
 *   The hook used to latch "whichever room the last render selected" on ANY visible sighting,
 *   without looking at the code the sighting carried. The last render's selection was made with the
 *   previous call's code, so opening a new Meet tab latched the old, never-ended room to `ready` -
 *   the popup came back for a call the user had left. The latch is the one piece of state the
 *   trigger keeps, so it must be written from the same rule the selection uses, with the sighting
 *   that is actually on screen.
 *
 * Null means "do not touch the latch", not "clear it": a sighting that matches no room is an offer,
 * and the claim that follows brings its own room in on the next sighting.
 *
 * The code check after the selection is not redundant: a translating room wins the selection
 * whatever the code says (see `selectTriggerMeeting`), and a window showing some OTHER call must
 * not be recorded as a sighting of it. The translation is pinned by `translatingRoomId`, not by
 * the latch, so it loses nothing.
 */
export function sightingLatchRoomId(input: SightingLatchInput): string | null {
  const selected = selectTriggerMeeting(
    input.meetings,
    input.nowMs,
    input.translatingRoomId,
    input.observedMeetCode,
    input.preferredRoomId,
  );
  if (!selected) return null;
  if (input.observedMeetCode && selected.meetCode && selected.meetCode !== input.observedMeetCode) {
    return null;
  }
  return selected.roomId;
}

/**
 * The next state, given the last one.
 *
 * A reducer rather than a formula because of the latch. A window title only reflects the ACTIVE
 * tab, so a user who switches to another tab mid-meeting makes the Meet window vanish from the
 * sensor's view while they are very much still in the call. Dropping back to `upcoming` there
 * would yank the controls away mid-sentence. So: enter `ready` on the first sighting, and stay
 * there until the meeting's own window closes. Quick to trust, slow to doubt.
 *
 * The latch is scoped to `roomId` for the obvious reason - the next meeting has not been seen yet
 * and must earn `ready` on its own.
 */
export function nextBridgeTrigger(
  previous: BridgeTriggerSnapshot,
  input: BridgeTriggerInput,
): BridgeTriggerSnapshot {
  const { meeting } = input;

  // Before the window check, not after it: the schedule decides when the widget may appear, never
  // when a translation in progress has to lose its controls.
  if (meeting && input.translationStarted) return { state: "running", roomId: meeting.roomId };

  if (!meeting || !isWithinTriggerWindow(meeting, input.nowMs)) {
    /**
     * Flow 2: a call with no room behind it.
     *
     * Deliberately NOT latched, unlike `ready`. A latch has to be bounded by something, and every
     * bound `ready` uses comes from the meeting - its roomId, its scheduled window. An offer has
     * neither, so a latched one would have no way to expire and would sit on screen after the call
     * it was offering for had ended.
     *
     * What it has instead is a short grace, which is bounded by the clock alone: it covers the gap
     * between a Meet tab losing focus and its picture-in-picture window being seen, and nothing
     * longer. See OFFER_GRACE_MS.
     */
    return input.meetWindowVisible || isWithinOfferGrace(input) ? OFFER_TRIGGER : IDLE_TRIGGER;
  }

  // A code that disagrees is a different meeting, so the sighting is not this meeting's. A code
  // that is merely absent proves nothing either way, and refusing to believe the sensor without
  // one would mean never believing it: Meet drops the code from the title as soon as the event has
  // a name, which is every meeting WarpBot creates.
  const codeConflict =
    Boolean(input.observedMeetCode) &&
    Boolean(meeting.meetCode) &&
    input.observedMeetCode !== meeting.meetCode;

  const latched = previous.roomId === meeting.roomId && (previous.state === "ready" || previous.state === "running");
  const seen = input.meetWindowVisible && !codeConflict;

  return { state: seen || latched ? "ready" : "upcoming", roomId: meeting.roomId };
}

/**
 * Whether a Meet window that has just gone out of view still counts for the offer.
 *
 * `meetWindowLostAtMs` only exists after a sighting ended, so this can only ever extend an offer
 * the sensor has already backed; it cannot raise one on its own.
 */
function isWithinOfferGrace(input: BridgeTriggerInput): boolean {
  const lostAtMs = input.meetWindowLostAtMs;
  return lostAtMs != null && input.nowMs - lostAtMs < OFFER_GRACE_MS;
}

/** Whether this state means the floating widget should be open at all. */
export function shouldShowBridgeWidget(state: BridgeTriggerState): boolean {
  return state !== "idle";
}

/**
 * The popup the user closed, and how far along the meeting was when they did.
 *
 * `target` is the hook's window target - a roomId, or the offer's stand-in - so this compares with
 * the same string the hook opens by.
 */
export interface BridgeWindowDismissal {
  target: string;
  state: BridgeTriggerState;
}

export interface BridgeWindowLedger {
  /** The target the trigger last opened the popup for; null while it holds nothing open. */
  opened: string | null;
  dismissed: BridgeWindowDismissal | null;
}

export type BridgeWindowCommand = { kind: "open"; target: string } | { kind: "close" } | null;

export const EMPTY_BRIDGE_WINDOW: BridgeWindowLedger = { opened: null, dismissed: null };

/**
 * How far along a meeting is, for deciding whether a closed popup may come back by itself.
 *
 * `offer` and `upcoming` share a rung because neither follows from the other: they are the two
 * flows' first states.
 */
const PHASE_RANK: Record<BridgeTriggerState, number> = {
  idle: 0,
  offer: 1,
  upcoming: 1,
  ready: 2,
  running: 3,
};

/**
 * What to do with the popup, given where the trigger now points.
 *
 * WHY THIS KNOWS ABOUT THE USER CLOSING IT
 *   The desktop app used to close the popup without telling anyone, so the hook went on believing
 *   it was open. The next open for the same target was then skipped as a no-op, and the popup was
 *   gone until the trigger happened to point somewhere else - for a translated meeting, that is
 *   the rest of the call.
 *
 * WHAT A CLOSE MEANS
 *   "Not now", not "never". It holds for the phase the meeting was in, and the popup comes back
 *   when the meeting moves forward: closing the 5-minute heads-up should not also hide the Start
 *   button once the user is actually in Meet, and closing that should not hide the controls of a
 *   translation someone then starts. Reopening in the SAME phase would be a window that will not
 *   leave, which is exactly what a close must never produce.
 *
 *   A dismissal also lasts only as long as its target: once the trigger lets go of it - the call
 *   ended, or a different meeting took over - the next time is a new time.
 */
export function nextBridgeWindow(
  ledger: BridgeWindowLedger,
  target: string | null,
  state: BridgeTriggerState,
): { ledger: BridgeWindowLedger; command: BridgeWindowCommand } {
  const dismissed = ledger.dismissed?.target === target ? ledger.dismissed : null;

  if (target === ledger.opened) return { ledger: { opened: ledger.opened, dismissed }, command: null };

  if (target === null) return { ledger: EMPTY_BRIDGE_WINDOW, command: { kind: "close" } };

  if (dismissed && PHASE_RANK[state] <= PHASE_RANK[dismissed.state]) {
    return { ledger: { opened: ledger.opened, dismissed }, command: null };
  }

  return { ledger: { opened: target, dismissed: null }, command: { kind: "open", target } };
}

/**
 * The user closed the popup showing `closedTarget`.
 *
 * Ignored unless it is the popup the trigger opened. Another opener - a bridge room the user opened
 * by hand - owns its own window, and a dismissal recorded against it would suppress a popup the
 * trigger never showed.
 */
export function bridgeWindowClosed(
  ledger: BridgeWindowLedger,
  closedTarget: string,
  state: BridgeTriggerState,
): BridgeWindowLedger {
  if (ledger.opened === null || ledger.opened !== closedTarget) return ledger;
  return { opened: null, dismissed: { target: closedTarget, state } };
}

/**
 * The desktop app reopened the popup itself - from the tray, or from the notification.
 *
 * Adopted only when it shows what the trigger points at now, so that the trigger closes it again
 * when the meeting lets go. A popup the trigger does not account for is left to whoever asked.
 */
export function bridgeWindowReopened(
  ledger: BridgeWindowLedger,
  reopenedTarget: string,
  currentTarget: string | null,
): BridgeWindowLedger {
  if (reopenedTarget !== currentTarget) return ledger;
  return { opened: reopenedTarget, dismissed: null };
}
