import type { RoomHistoryArtifact, RoomHistoryParticipant } from "@/types/roomHistory";
import type { TranslationRoomStatus } from "@/types/translationRoom";

/**
 * WT-333 / WT-538 — where one meeting sits, for the person looking at it, right now.
 *
 * Derived rather than sent by the server, because the answer changes while the page is open: a room
 * that was `upcoming` when the request returned is `live` ten minutes later without anything being
 * refetched, and a room nobody opened becomes `missed` two hours after that.
 *
 * WT-538 renamed `past` to `joined` and split `missed` out of it, because "it is over" turned out
 * to be two different facts wearing one word. A finished meeting the viewer sat through and a
 * finished meeting they never opened both read as "Attended" on this page, and a booked meeting
 * that never happened read as "Upcoming" indefinitely. `joined` now means what it says — the viewer
 * was in the room — and everything else that is over and unattended is `missed`.
 *
 * The rule lives in `@/lib/meeting/meeting-time-state`, and it is a FUNCTION, not a field: the
 * answer depends on the viewer and on the wall clock, neither of which a cached row can carry.
 */
export type MeetingTimeState = "upcoming" | "live" | "joined" | "missed";

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

  /*
   * There is deliberately no `timeState` field here.
   *
   * It used to be one, written by the mapper inside the query function — which meant it was frozen
   * at the instant the response was cached, on a page whose whole premise is that the answer moves
   * on its own. It also cannot be written at all any more: `missed` depends on which participant
   * row belongs to the VIEWER, and the mapper has no idea who that is.
   *
   * Callers ask `resolveMeetingTimeState(meeting, { viewerUserId, now })` instead. One rule, one
   * place, evaluated when it is needed rather than remembered from when it was not.
   */

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
