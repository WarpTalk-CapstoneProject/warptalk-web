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
