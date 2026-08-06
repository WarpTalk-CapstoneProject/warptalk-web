/**
 * When the persistent meeting session may hold a LiveKit connection, and when a MINIMISED one
 * has to give it back.
 *
 * Extracted from persistent-meeting-session.tsx so the rules are executable on their own: the
 * component owns the wiring, this owns the decisions.
 */

/**
 * How long a MINIMISED meeting may sit without any interaction in this tab before its LiveKit
 * connection is released.
 *
 * Deliberately 15 minutes, not 5 and not 60. LiveKit Cloud bills connection-minutes by
 * wall-clock presence and the AI ingress bot counts a connected human before it will
 * idle-release itself, so a forgotten tab used to bill two or more participants for as long as
 * the browser stayed open. Against that: someone who steps away from a real meeting, or who
 * minimises the call and reads a document in another tab for ten minutes, must not come back to
 * find they were dropped. Fifteen minutes clears any realistic "back in a moment" and still
 * stops an abandoned tab well inside the first hour.
 */
export const MINI_MEETING_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** How far ahead of the cut-off the "Stay connected" toast appears. */
export const MINI_MEETING_IDLE_WARNING_MS = 60 * 1000;

/**
 * Whether <LiveKitRoom connect> may be true.
 *
 * `hasToken` alone is the defect: a LiveKit token is issued once and never withdrawn, so
 * `connect={Boolean(token)}` stayed true for the life of the tab. Presence has to keep
 * depending on the room still being joinable — which also means a room id restored from
 * sessionStorage into an ENDED room can never reconnect — and on the minimised session not
 * having been idle-reaped.
 */
export function shouldConnectMeeting({
  hasToken,
  canConnectRoom,
  idleReaped,
}: {
  hasToken: boolean;
  canConnectRoom: boolean;
  idleReaped: boolean;
}): boolean {
  return hasToken && canConnectRoom && !idleReaped;
}

/**
 * Only a MINIMISED session is ever reaped. The full-size view is the meeting the person is
 * looking at; it is never idle by definition.
 */
export function isIdleReaped({
  compact,
  idleDisconnected,
}: {
  compact: boolean;
  idleDisconnected: boolean;
}): boolean {
  return compact && idleDisconnected;
}

export type IdleAction = "none" | "warn" | "disconnect";

/**
 * What the idle poll should do this tick.
 *
 * `warn` fires at most once per idle stretch — `alreadyWarned` is reset by any interaction, so
 * a person who clicks "Stay connected" (or simply moves the mouse) gets a fresh warning the
 * next time they go quiet rather than silently losing the grace period.
 */
export function evaluateIdleMeeting({
  now,
  lastInteractionAt,
  alreadyWarned,
  timeoutMs = MINI_MEETING_IDLE_TIMEOUT_MS,
  warningMs = MINI_MEETING_IDLE_WARNING_MS,
}: {
  now: number;
  lastInteractionAt: number;
  alreadyWarned: boolean;
  timeoutMs?: number;
  warningMs?: number;
}): IdleAction {
  const idleFor = now - lastInteractionAt;
  if (idleFor >= timeoutMs) return "disconnect";
  if (!alreadyWarned && idleFor >= timeoutMs - warningMs) return "warn";
  return "none";
}

/**
 * Whether a session restored from sessionStorage points at a room that is no longer there.
 *
 * WT-306 made `activeRoomId` survive a reload, so the id can outlive the room: ended,
 * cancelled, or simply no longer readable by this account. Only asked of a MINIMISED session —
 * on /room/{id} the TranslationRoomEnded broadcast already retires the session AND routes the
 * person somewhere, whereas closing from here would leave them staring at a bare spinner.
 */
export function isRestoredMeetingStale({
  compact,
  roomLoadFailed,
  hasRoom,
  canConnectRoom,
}: {
  compact: boolean;
  roomLoadFailed: boolean;
  hasRoom: boolean;
  canConnectRoom: boolean;
}): boolean {
  if (!compact) return false;
  if (roomLoadFailed) return true;
  return hasRoom && !canConnectRoom;
}
