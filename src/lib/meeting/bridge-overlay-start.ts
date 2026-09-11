/**
 * Start translation from the bridge popup, as a sequence the popup cannot get out of order.
 *
 * WHAT WAS WRONG
 *   The popup's Start opened a translation session on the server and did nothing else. The
 *   pipeline that session needs - the LiveKit connection, the dub, both Windows bridge legs, the
 *   inbound loopback - is neither on the server nor in the popup. It is the main window's
 *   PersistentMeetingSession, and that mounts only for the main window's `activeRoomId`, which
 *   lives in sessionStorage and so is per-window: nothing the popup writes to it is ever read
 *   there. A room whose popup the trigger raised, and which nobody had opened in the main window,
 *   was therefore marked translating while no microphone was captured and no dub was played. The
 *   sessions list said ACTIVE, the popup showed Stop, and the far side heard nothing.
 *
 *   Flow 2 had already solved it: the offer calls activateBridgeRoom before anything starts, and
 *   the main window answers `bridge:room-activated` with openMeeting. This is the same call on the
 *   other way into the same room.
 *
 * WHY ACTIVATION COMES FIRST
 *   A translation session opened before anybody has been asked to carry it is exactly the state
 *   being removed, so the ask goes out before the session can exist. It also lets the main window
 *   join while the two REST calls below are in flight rather than after them. Joining a room that
 *   is not open yet is fine - canConnectToRoom accepts every status short of terminal - and it is
 *   what flow 2 has always done with a room it created a moment earlier.
 *
 * WHY A FAILED ACTIVATION DOES NOT STOP THE START
 *   `false` means there was no main window to ask: a desktop build older than the relay, or this
 *   route open in a browser tab. The host may be carrying the room already, having opened it by
 *   hand, which is the one case that always worked, and refusing would take it away. So the start
 *   goes ahead and the outcome says so, for the caller to tell the user plainly.
 *
 * ONE ORDERING HAZARD, KNOWN
 *   If the main window was running a DIFFERENT bridge room, activating this one unmounts that
 *   session, and its cleanup closes the popup - this one - before the new session opens it again.
 *   A start still in flight dies with the window. Nothing is left half-done that the reopened popup
 *   misreports: it reads the sessions list afresh and offers Start again if the start never landed,
 *   and the second press finds the room already active. Two bridge rooms live at once is rare, and
 *   putting the REST calls first would reopen the gap this file closes for the common case.
 */

/** Room statuses in which the ROOM is already open, so only the translation has to start. */
const OPEN_ROOM_STATUSES: ReadonlySet<string> = new Set(["in_progress", "paused"]);

export interface BridgeOverlayStartSteps {
  /**
   * Make the room the main window's active meeting. Resolves false when there is no main window to
   * ask. activateBridgeRoom in the product.
   */
  activate: (roomId: string) => Promise<boolean>;
  /** Open the ROOM (`/start`). Only called for a room that is not open yet. */
  openRoom: (roomId: string) => Promise<unknown>;
  /** Open a translation session (`/resume`). Since WT-339 this is a separate act from the above. */
  startTranslation: (roomId: string) => Promise<unknown>;
}

export interface BridgeOverlayStartOutcome {
  /** Whether the main window was asked to carry the room. False is worth telling the user. */
  activated: boolean;
}

/**
 * Activate, open the room if it needs opening, then start translation.
 *
 * Rejects with whatever the REST step rejected with; activation itself never rejects, because
 * activateBridgeRoom already turns every failure into `false`.
 */
export async function startBridgeTranslation(
  room: { id: string; status: string },
  steps: BridgeOverlayStartSteps,
): Promise<BridgeOverlayStartOutcome> {
  const activated = await steps.activate(room.id);
  if (!OPEN_ROOM_STATUSES.has(room.status)) {
    await steps.openRoom(room.id);
  }
  await steps.startTranslation(room.id);
  return { activated };
}
