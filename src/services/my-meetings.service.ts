import { translationRoomService } from "@/services/translation-room.service";
import { mapArtifact } from "@/services/room-history.service";
import { resolveMeetingDurationSeconds } from "@/lib/meeting/room-history-mapping";
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
    //
    // WT-407: this used to fall back to `room.startedAt ?? room.createdAt`, which is the exact
    // mistake resolveMeetingDurationSeconds was written to stop — its own docstring calls out
    // "14h for a 20-minute meeting". createdAt is when the ROW was inserted, and a recurring
    // occurrence is created days before its scheduled slot; cancelling it stamps endedAt without
    // ever stamping startedAt, so the subtraction measured the wait, not the meeting. Production
    // has rooms in exactly that shape (started_at NULL, ended_at set, status CANCELLED) and QA
    // saw "50h 8m" on one.
    //
    // The history service already routed through the shared resolver. This is the second reader
    // of the same rooms, and it was still on the old arithmetic — so the two screens disagreed
    // about the same meeting.
    //
    // A meeting that never started keeps null rather than 0: "no duration" is the honest answer
    // for something that never ran, and it matches the convention this field already uses above.
    durationSeconds: resolveEndedMeetingDurationSeconds(room),
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


/**
 * Duration for a room that has finished, or null when there is nothing honest to report.
 *
 * Null covers two different "no duration" cases on purpose: a meeting still running, and a
 * meeting that was cancelled before it ever started. Both would otherwise render as "0m", which
 * reads as "it ran for no time" rather than "it never ran".
 */
function resolveEndedMeetingDurationSeconds(room: {
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
}): number | null {
  if (!room.endedAt) return null;

  const seconds = resolveMeetingDurationSeconds({
    durationSeconds: room.durationSeconds,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
  });

  // resolveMeetingDurationSeconds returns 0 for a room with no usable start. Here that is not a
  // measurement, it is the absence of one.
  return seconds > 0 ? seconds : null;
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
