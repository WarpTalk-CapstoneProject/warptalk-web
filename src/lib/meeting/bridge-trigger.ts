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
  /** When the schedule says it ends. Absent for rooms with no end time; see the tail constant. */
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
 */
export function selectTriggerMeeting(
  meetings: readonly TriggerMeeting[],
  nowMs: number,
): TriggerMeeting | null {
  const eligible = meetings.filter((meeting) => isWithinTriggerWindow(meeting, nowMs));
  if (eligible.length === 0) return null;
  return eligible.reduce((best, meeting) =>
    Math.abs(meeting.startsAtMs - nowMs) < Math.abs(best.startsAtMs - nowMs) ? meeting : best,
  );
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
  if (!meeting || !isWithinTriggerWindow(meeting, input.nowMs)) {
    /**
     * Flow 2: a call with no room behind it.
     *
     * Deliberately NOT latched, unlike `ready`. A latch has to be bounded by something, and every
     * bound `ready` uses comes from the meeting - its roomId, its scheduled window. An offer has
     * neither, so a latched one would have no way to expire and would sit on screen after the call
     * it was offering for had ended. Following the sensor directly costs a flicker when the user
     * tabs away before accepting; it never costs a window that will not leave.
     */
    return input.meetWindowVisible ? OFFER_TRIGGER : IDLE_TRIGGER;
  }

  if (input.translationStarted) return { state: "running", roomId: meeting.roomId };

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

/** Whether this state means the floating widget should be open at all. */
export function shouldShowBridgeWidget(state: BridgeTriggerState): boolean {
  return state !== "idle";
}
