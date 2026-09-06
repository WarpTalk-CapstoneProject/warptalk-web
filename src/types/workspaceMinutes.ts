/**
 * The workspace's biên bản, as a list.
 *
 * Mirrors `WorkspaceMinutesResponse` in warptalk-backend/translation-room. Each row carries the
 * document AND enough of its meeting to be listed on its own: the minutes endpoint is scoped by
 * the rooms the caller may read, which is not the same set as the page of meeting history loaded
 * beside it, so a row whose meeting is not on that page still has a title to show.
 */

import type { MeetingMinutesDto } from "@/types/meetingMinutes";

export interface WorkspaceMinutesItem {
  minutes: MeetingMinutesDto;
  roomTitle: string;
  roomCode: string;
  roomHostId: string;
  roomStatus: string;
  /** Null for a meeting that has no end recorded — the document's own date stands in. */
  roomEndedAt?: string | null;
}

export interface WorkspaceMinutesResponse {
  items: WorkspaceMinutesItem[];
  /** The server's count for the current filters — NOT `items.length`. */
  total: number;
  /** 1-based. */
  page: number;
  pageSize: number;
}
