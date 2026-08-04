import type { TranslationRoomStatus } from "@/types/translationRoom";

const TERMINAL_ROOM_STATUSES: ReadonlySet<TranslationRoomStatus> = new Set([
  "ended",
  "cancelled",
  "expired",
  "failed",
  "timeout",
]);

export function canJoinTranslationRoom(
  status: TranslationRoomStatus,
): boolean {
  return !TERMINAL_ROOM_STATUSES.has(status);
}

/**
 * Whether entering this room means entering the lobby rather than the live call (WT-232).
 *
 * A room only carries live audio once the host starts it. Before that the room detail page
 * still offered "Join meeting", which walked the user through device setup and dropped them
 * into an empty session with no indication of what they were waiting for. These two statuses
 * mean "created, not started" — everyone who enters lands in the waiting room instead.
 */
export function shouldEnterWaitingRoom(
  status: TranslationRoomStatus,
): boolean {
  return status === "scheduled" || status === "waiting";
}
