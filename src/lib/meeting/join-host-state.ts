/**
 * What the join response says about the room's lock and its recording. WT-935.
 *
 * WHAT WAS WRONG
 *   The Record button and the lock both started at `false` on every mount and only ever moved on a
 *   RecordingStateChanged / RoomLockChanged broadcast. A broadcast announces a TRANSITION and is
 *   not replayed to somebody who joins afterwards, so a reload of /live in a meeting that was
 *   being recorded drew the idle button — and the host's next press sent `start` for a recording
 *   that was already running. The lock had the same shape: a locked room opened as "unlocked", and
 *   the first tap re-sent the value the room already had.
 *
 * WHERE THE TRUTH WAS ALL ALONG
 *   The meeting service's join response already carries both, for every joiner: `locked` (WT-282)
 *   and `recording` (WT-283, true while the room has an active egress), next to `muteOnEntry`. The
 *   client never read them. This module is the reading.
 *
 * THE TWO RULES
 *   1. A field that is ABSENT is not `false`. An older backend does not send it, and "not told" must
 *      leave the state where it is rather than switch a recording indicator off.
 *   2. The join response is a snapshot taken when the server answered, and it travels. A broadcast
 *      or a mutation's answer that landed while the join was in flight is the same age or NEWER, so
 *      it wins: the snapshot is then dropped rather than allowed to undo it. Without this a host
 *      who stops the recording during a rejoin could watch the button flip back to "recording".
 *
 * Hydration is silent — it reports a state that was already true, not a change. The transition
 * toasts stay with the broadcast handler and the mutations, which are the only places a change is
 * actually witnessed. A joiner still learns the meeting is recorded: the standing REC chip.
 *
 * Pure on purpose: no React, no DOM, no LiveKit.
 */

/** The two host-controlled states the join response reports. `null` = the response did not say. */
export interface JoinHostState {
  locked: boolean | null;
  recording: boolean | null;
}

/** Reads the two fields off a join response. Anything that is not a boolean is "did not say". */
export function readJoinHostState(
  session: { locked?: unknown; recording?: unknown } | null | undefined,
): JoinHostState {
  return {
    locked: typeof session?.locked === "boolean" ? session.locked : null,
    recording: typeof session?.recording === "boolean" ? session.recording : null,
  };
}

/**
 * The state after a join response arrived.
 *
 * `toldWhileJoining`: a broadcast or a mutation result set this state after the join request was
 * sent. See THE TWO RULES.
 */
export function hydrateFromJoin(input: {
  current: boolean;
  joined: boolean | null;
  toldWhileJoining: boolean;
}): boolean {
  if (input.joined === null) return input.current;
  if (input.toldWhileJoining) return input.current;
  return input.joined;
}
