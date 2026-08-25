/**
 * A commitment from an approved biên bản, as a row somebody can be assigned and can close.
 *
 * Mirrors MeetingActionItemDto in warptalk-backend/translation-room.
 *
 * BOTH OWNER FIELDS TRAVEL AND BOTH MATTER
 *   `ownerName` is what the meeting said and always renders. `ownerParticipantId` is who that
 *   turned out to be, and is null whenever the name was ambiguous or matched nobody. A UI showing
 *   only the second would make an unresolved owner vanish from a line that clearly names one.
 */

export type ActionItemStatus = "OPEN" | "DONE" | "DROPPED";

export interface MeetingActionItemDto {
  id: string;
  translationRoomId: string;
  /** Present on the cross-meeting list, where a task means nothing without its meeting. */
  roomTitle?: string | null;
  sourceMinutesId: string;
  task: string;
  ownerName?: string | null;
  ownerParticipantId?: string | null;
  assigneeUserId?: string | null;
  atMs?: number | null;
  status: ActionItemStatus;
  dueDate?: string | null;
  closedAt?: string | null;
  createdAt: string;
}

/** Whether this task is still outstanding. DROPPED is closed too — decided against, not done. */
export function isOpen(item: MeetingActionItemDto): boolean {
  return item.status === "OPEN";
}
