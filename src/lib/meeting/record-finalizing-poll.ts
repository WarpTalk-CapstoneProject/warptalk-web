/**
 * B4 — the "Finishing up this meeting" screen must always resolve.
 *
 * WHAT HUNG
 *   WT-930 holds the desktop app's room page on a loading screen until the room's
 *   `transcript_export` artifact is listed (isRecordFinalizing). The record comes from the shared
 *   workspace-history query, whose only poll was shouldPollRoomHistory — and that predicate only
 *   looks at rooms that are IN the list. When the cached or first answer did not contain the room
 *   that had just ended (the desktop main window had already loaded the workspace history under
 *   the very same cache key before the meeting ended, and a 60s staleTime served it again on
 *   mount), the record was null, nothing in the list was "generating", and nothing ever asked
 *   again: a spinner forever. The five-minute cap did not save it either, because it was only
 *   evaluated on a render and nothing re-rendered the page.
 *
 * THE RULES HERE
 *   - While a room is finalizing, ask every few seconds — whether or not the room is in the list
 *     yet. `record` null is exactly the case that has to keep asking.
 *   - Know when the finalizing window ends, so the page can schedule one re-render for that
 *     moment and fall through to the record page on its own.
 *
 * Dependency-free so it runs under `node --experimental-strip-types` like its siblings.
 */

import {
  isRecordFinalizing,
  RECORD_FINALIZING_WINDOW_MS,
  shouldPollRoomHistory,
} from "./room-history-mapping.ts";

/** How often to re-ask while the finalizing screen is up. Inside the 3–5s band the screen wants. */
export const RECORD_FINALIZING_POLL_MS = 4_000;

/** The ordinary "something is still generating" cadence of the history list. */
export const ROOM_HISTORY_POLL_MS = 10_000;

type HistoryRoom = Parameters<typeof shouldPollRoomHistory>[0][number] & { id: string };

/**
 * The refetch interval of the room page's view of the history query.
 *
 * Finalizing wins over everything: it polls fast, and it polls even when `roomId` is absent from
 * `rooms`. Outside the window it is the shared list rule, unchanged, so the archive's behaviour
 * does not move.
 */
export function endedRecordRefetchInterval(
  input: {
    rooms: HistoryRoom[] | undefined;
    roomId: string | null | undefined;
    /** The room's own status and end time, from the room lookup — not from the list. */
    status?: string | null;
    endedAt?: string | null;
  },
  nowMs: number = Date.now(),
): number | false {
  const rooms = input.rooms ?? [];
  const record = input.roomId ? rooms.find((room) => room.id === input.roomId) ?? null : null;

  if (isRecordFinalizing({ status: input.status, endedAt: input.endedAt, record }, nowMs)) {
    return RECORD_FINALIZING_POLL_MS;
  }
  return shouldPollRoomHistory(rooms, { nowMs }) ? ROOM_HISTORY_POLL_MS : false;
}

/**
 * Milliseconds until the finalizing window closes, or null when there is no window to wait out
 * (not ended, no end time, or already past it).
 *
 * The page sets ONE timer for this delay. Without it, isRecordFinalizing's cap was only ever
 * evaluated on a render, and a page with nothing re-rendering it stayed on the spinner past five
 * minutes until a reload. A clock behind the server's reads a fresh end as being in the future;
 * the delay is then longer than five minutes, one window per leg. isRecordFinalizing stops
 * treating an end more than one window in the future as finalizing, so at most two legs run.
 */
export function finalizingDeadlineDelayMs(
  input: { status?: string | null; endedAt?: string | null },
  nowMs: number = Date.now(),
): number | null {
  if (input.status?.toLowerCase() !== "ended") return null;
  const endedMs = input.endedAt ? Date.parse(input.endedAt) : Number.NaN;
  if (!Number.isFinite(endedMs)) return null;

  const remaining = endedMs + RECORD_FINALIZING_WINDOW_MS - nowMs;
  if (remaining <= 0) return null;
  // +1ms so the re-render lands strictly past the window, where isRecordFinalizing answers false.
  return Math.min(remaining, RECORD_FINALIZING_WINDOW_MS) + 1;
}
