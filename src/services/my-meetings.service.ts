import { translationRoomService } from "@/services/translation-room.service";
import { mapArtifact } from "@/services/room-history.service";
import { calculateMeetingDurationSeconds } from "@/lib/meeting/meeting-duration";
import type { MeetingTimeState, MyMeetingItem, MyMeetingsResponse } from "@/types/myMeetings";
import type { TranslationRoomDto, TranslationRoomHistoryItemDto } from "@/types/translationRoom";

/**
 * WT-333 — where a room sits relative to now.
 *
 * Read from STATUS, not from comparing timestamps to the clock. A room booked for 09:00 that nobody
 * opened is still `upcoming` at 09:05 — it has not started, and showing a Join button for it would
 * be a lie the status already contradicts. The clock only decides the day a row is filed under.
 *
 * `waiting` counts as live because the lobby being open is the point at which a participant can act
 * on the row: the room is reachable, which is the only distinction this state drives in the UI.
 */
function resolveTimeState(status: TranslationRoomDto["status"]): MeetingTimeState {
  if (status === "in_progress" || status === "waiting" || status === "paused") return "live";
  if (status === "scheduled") return "upcoming";
  return "past";
}

/**
 * The moment a meeting belongs to on the timeline.
 *
 * Same fallback chain the server sorts by (ScheduledAt ?? StartedAt ?? EndedAt ?? CreatedAt), and
 * it has to stay that way: if the client filed rows under a different timestamp than the server
 * ordered them by, a page boundary would drop meetings out of the middle of a day rather than off
 * the end of the range.
 */
function resolveOccursAt(room: TranslationRoomDto): string {
  return room.scheduledAt ?? room.startedAt ?? room.endedAt ?? room.createdAt;
}

function mapMeeting(item: TranslationRoomHistoryItemDto): MyMeetingItem {
  const room = item.room;

  return {
    id: room.id,
    workspaceId: room.workspaceId,
    hostId: room.hostId,
    hostName:
      item.participants.find((participant) => participant.userId === room.hostId)?.displayName ?? "Host",
    title: room.title,
    description: room.description,
    translationRoomCode: room.translationRoomCode,
    status: room.status,
    timeState: resolveTimeState(room.status),
    occursAt: resolveOccursAt(room),
    startedAt: room.startedAt,
    endedAt: room.endedAt,
    // Null rather than 0 for anything unfinished. A meeting that has not ended has no duration, and
    // 0 would render as a real "0m" next to meetings that genuinely lasted no time.
    durationSeconds: room.endedAt
      ? calculateMeetingDurationSeconds(room.startedAt ?? room.createdAt, room.endedAt)
      : null,
    sourceLanguage: room.sourceLanguage ?? "en",
    targetLanguages: room.targetLanguages,
    participants: item.participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      displayName: participant.displayName,
      role: participant.role === "host" || participant.role === "HOST" ? "host" : "participant",
      speakLanguage: participant.speakLanguage,
      listenLanguage: participant.listenLanguage,
      joinedAt: participant.joinedAt,
    })),
    participantCount: room.participantCount ?? item.participants.length,
    artifacts: item.artifacts.map(mapArtifact),
    isHost: room.isHost === true,
  };
}

export const myMeetingsService = {
  /**
   * One window of the caller's personal timeline.
   *
   * Windowed by date rather than paged by number: the agenda scrolls in both directions from today,
   * so "page 2" has no meaning — page 2 of a list sorted newest-first is further into the past on
   * one side of the anchor and nowhere at all on the other. `pageSize` is a per-window cap, and
   * `total` comes back so the caller can say when it has been hit instead of silently truncating.
   */
  async listMyMeetings(options: {
    workspaceId: string;
    from?: Date;
    to?: Date;
    search?: string;
    pageSize?: number;
  }): Promise<MyMeetingsResponse> {
    const { data } = await translationRoomService.myMeetings({
      workspaceId: options.workspaceId,
      from: options.from?.toISOString(),
      to: options.to?.toISOString(),
      search: options.search?.trim() || undefined,
      pageSize: options.pageSize ?? 100,
    });

    return {
      meetings: data.rooms.map(mapMeeting),
      total: data.total,
    };
  },
};
