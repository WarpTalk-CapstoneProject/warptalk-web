/**
 * Whether the transcript is being written down right now. WT-605.
 *
 * WHAT PAUSING THE TRANSCRIPT IS, AND WHAT IT IS NOT
 *   It stops the written record growing. Translation, dubbing, subtitles and LiveKit keep running
 *   exactly as before — people go on hearing each other in their own language, and only the
 *   transcript stops. The backend is emphatic about this, because it deliberately introduced a new
 *   event pair rather than reusing `TranslationStopped`:
 *
 *     "TranslationStopped means the AI workers stopped translating and dubbing; TranscriptPaused
 *      means only the written-down transcript stopped growing … Reusing the same event would tell
 *      clients to treat the two as the same thing, which they are not."
 *          — TranslationRoomRedisSubscriberService, WT-605
 *
 *   So nothing here may be folded into the Stop Translation switch, and no copy built on it may
 *   say "meeting paused".
 *
 * WHY THIS IS A MODULE AND NOT A `useState` IN THE MEETING PAGE
 *   The state has two sources that can disagree, and the disagreement is a race that happens in
 *   production rather than in theory:
 *
 *     - `GET …/pause-windows`, which is what somebody who joins mid-pause has to learn it from.
 *       The meeting page has exactly this bug already for the room lock, recorded in its own
 *       comment: "JoinMeetingResponse does not report it, so isRoomLocked can only be learned from
 *       a RoomLockChanged broadcast that fires after somebody toggles it." A participant who
 *       arrives while the transcript is already paused must not be told it is running.
 *     - the `TranscriptPaused` / `TranscriptResumed` broadcasts, which are what everybody already
 *       in the room learns it from.
 *
 *   A fetch started before an event can land after it, and react-query's `dataUpdatedAt` is when
 *   the response was RECEIVED, not when its contents were true — so "take whichever is newer by
 *   timestamp" gets this exactly backwards for a request that was already in flight when the host
 *   pressed Pause. That fetch is the newer arrival and the older fact, and following it silently
 *   un-pauses a transcript that is still paused: the panel then claims words are being written
 *   down that are not, which is worse than showing nothing.
 *
 *   So the rule is not recency. A broadcast is the room's live state and OUTRANKS the window
 *   list outright; the list answers only when no broadcast has been seen. Freshness across a
 *   dropped connection stays the caller's job — on reconnect it forgets the last event, because
 *   events that fired while the socket was down were never delivered, and the refetched list is
 *   then the only party that knows.
 */

/** One pause window as `GET /transcripts/by-room/{id}/pause-windows` returns it. */
export type TranscriptPauseWindowLike = {
  /** ISO instant the pause began. */
  startedAt: string;
  /** ISO instant it was lifted, or null while it is still in force. */
  endedAt?: string | null;
};

export type TranscriptPauseState = {
  paused: boolean;
  /** When the pause in force began, for the notice. Null whenever `paused` is false. */
  since: string | null;
  /**
   * Whether anything has actually told us. False before the first window list lands and before
   * any broadcast — the caller shows no notice at all rather than asserting "running", because
   * "we have not been told yet" and "it is running" are different facts.
   */
  known: boolean;
};

export const TRANSCRIPT_PAUSE_UNKNOWN: TranscriptPauseState = {
  paused: false,
  since: null,
  known: false,
};

/**
 * The state a list of pause windows describes.
 *
 * A window with no `endedAt` is one still in force. There should only ever be one — the server
 * refuses a second pause with INVALID_STATE — but the newest is taken rather than the first, so a
 * historical row that was never closed (a crash mid-meeting) cannot outrank the live one.
 */
export function transcriptPauseFromWindows(
  windows: readonly TranscriptPauseWindowLike[] | null | undefined,
): { paused: boolean; since: string | null } {
  if (!windows) return { paused: false, since: null };

  let since: string | null = null;
  for (const window of windows) {
    if (window.endedAt) continue;
    if (since === null || Date.parse(window.startedAt) > Date.parse(since)) {
      since = window.startedAt;
    }
  }
  return since === null ? { paused: false, since: null } : { paused: true, since };
}

/**
 * The state to render.
 *
 * A broadcast wins whenever there is one — see the header: the window list can arrive later and
 * still be older, and there is no timestamp on either side that can tell you so.
 *
 * The caller must clear `event` whenever it can no longer vouch for it — on hub reconnect, since
 * anything that happened while the socket was down was never delivered — which hands the answer
 * back to the refetched list.
 */
export function resolveTranscriptPause(input: {
  /** The window list, or null/undefined while it has not arrived (or the request failed). */
  windows: readonly TranscriptPauseWindowLike[] | null | undefined;
  /** The last broadcast seen since the connection was established, or null if none has. */
  event: { paused: boolean } | null;
}): TranscriptPauseState {
  if (input.event) {
    return {
      paused: input.event.paused,
      // A broadcast carries the room id and nothing else, so a pause learned this way has no
      // start time to show. The notice reads perfectly well without one; putting `Date.now()`
      // here would print a fabricated clock time on screen.
      since: null,
      known: true,
    };
  }

  if (!input.windows) return TRANSCRIPT_PAUSE_UNKNOWN;

  return { ...transcriptPauseFromWindows(input.windows), known: true };
}
