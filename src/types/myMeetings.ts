import type { RoomHistoryArtifact, RoomHistoryParticipant } from "@/types/roomHistory";
import type { TranslationRoomStatus } from "@/types/translationRoom";

/**
 * WT-333 — where one meeting sits relative to now.
 *
 * Derived from the room's status and its own timestamps rather than sent by the server, because the
 * answer changes while the page is open: a room that was `upcoming` when the request returned is
 * `live` ten minutes later without anything being refetched.
 */
export type MeetingTimeState = "upcoming" | "live" | "past";

/**
 * One row of the personal timeline.
 *
 * Deliberately NOT `EndedRoomHistoryItem`. That type is the workspace archive's and pins
 * `status` to ended|cancelled, `endedAt` to a string, and a retention block that only makes sense
 * once a meeting has produced something. Half this timeline is meetings that have not happened, so
 * widening the archive's type would have meant loosening every field the archive currently relies
 * on being present.
 */
export interface MyMeetingItem {
  id: string;
  workspaceId: string;
  hostId: string;
  hostName: string;
  title: string;
  description?: string;
  translationRoomCode: string;
  status: TranslationRoomStatus;
  timeState: MeetingTimeState;

  /**
   * The moment this meeting belongs to on the timeline — booked slot, else when it actually
   * started, else when it ended, else when it was created. Mirrors the ordering the server sorts
   * by, so the grouping the user sees cannot disagree with the order rows arrived in.
   */
  occursAt: string;

  startedAt?: string;
  endedAt?: string;

  /** Null while a meeting has not finished — an upcoming room has no duration to state. */
  durationSeconds: number | null;

  sourceLanguage: string;
  targetLanguages: string[];
  participants: RoomHistoryParticipant[];
  participantCount: number;
  artifacts: RoomHistoryArtifact[];

  /** True when the viewer is the host, which is what the row badges instead of an RSVP state. */
  isHost: boolean;
}

export interface MyMeetingsResponse {
  meetings: MyMeetingItem[];
  /** Server-side count BEFORE the page cap, so the UI can admit when it is showing a subset. */
  total: number;
}
