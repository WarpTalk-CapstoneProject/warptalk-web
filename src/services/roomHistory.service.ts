import { translationRoomService } from "@/services/translationRoom.service";
import {
  resolveArtifactStatus,
  resolveHistoryStatus,
  resolveMeetingDurationSeconds,
  resolveRetention,
} from "@/lib/room-history-mapping";
import type { EndedRoomHistoryItem, RoomArtifactStatus, RoomHistoryResponse, TranslationRoomSummaryArtifact } from "@/types/roomHistory";
import type { TranslationRoomArtifactDto, TranslationRoomHistoryItemDto } from "@/types/translationRoom";
import { parseMeetingSummaryContent } from "@/types/meetingSummary";

/** Server clamps `pageSize` to 1..100 (TranslationRoomService.GetTranslationRoomHistoryAsync). */
export const ROOM_HISTORY_PAGE_SIZE = 20;

function normalizeArtifactType(type: string): EndedRoomHistoryItem["artifacts"][number]["type"] {
  const normalized = type.toLowerCase();
  if (normalized === "optional_recording") return "recording";
  if (normalized === "transcript_export" || normalized === "summary_export" || normalized === "debug_log" || normalized === "audio_sample") {
    return normalized;
  }
  return "transcript_export";
}

function mapArtifact(artifact: TranslationRoomArtifactDto): EndedRoomHistoryItem["artifacts"][number] {
  const type = normalizeArtifactType(artifact.type);
  const backendSource = type === "summary_export"
    ? "translation_room_summaries"
    : type === "transcript_export"
      ? "transcript_exports"
      : "translation_room_recordings";

  return {
    id: artifact.id,
    type,
    title: artifact.title,
    description: artifact.fileUrl ? "Generated room artifact." : "Artifact metadata is available, but no file is linked yet.",
    status: resolveArtifactStatus(artifact.status),
    format: artifact.fileFormat?.toUpperCase(),
    fileUrl: artifact.fileUrl,
    fileSizeBytes: artifact.fileSizeBytes,
    createdAt: artifact.createdAt,
    expiresAt: artifact.retentionUntil,
    consentRequired: artifact.consentRequired,
    consentStatus: artifact.consentRequired ? "granted" : "not_required",
    content: artifact.content ?? undefined,
    backendSource,
  };
}

function buildSummaryArtifact(
  translationRoomId: string,
  artifact: ReturnType<typeof mapArtifact> | undefined
): TranslationRoomSummaryArtifact | undefined {
  if (!artifact) return undefined;
  const parsed = parseMeetingSummaryContent(artifact.content);
  if (!parsed) return undefined;

  return {
    id: artifact.id,
    translationRoomId,
    summary: parsed.summary,
    keyPoints: [],
    decisions: parsed.decisions,
    actionItems: parsed.actionItems,
    modelUsed: "",
    processingTimeMs: 0,
    generatedAt: artifact.createdAt ?? "",
    insufficientData: parsed.insufficientData,
    translations: parsed.translations,
  };
}

function mapHistoryItem(item: TranslationRoomHistoryItemDto): EndedRoomHistoryItem {
  const room = item.room;
  const artifacts = item.artifacts.map(mapArtifact);
  const summaryArtifact = artifacts.find((artifact) => artifact.type === "summary_export");
  const summary = buildSummaryArtifact(room.id, summaryArtifact);

  return {
    id: room.id,
    workspaceId: room.workspaceId,
    hostId: room.hostId,
    hostName: item.participants.find((participant) => participant.userId === room.hostId)?.displayName ?? "Host",
    title: room.title,
    description: room.description,
    translationRoomCode: room.translationRoomCode,
    // `room.status` is already lower-cased by translationRoom.service's `normalizeStatus`,
    // but this surface must not depend on that invisibly: the wire value is UPPERCASE and
    // a bare `=== "cancelled"` here is one refactor away from silently filing every
    // cancelled meeting under Completed. Fold explicitly.
    status: resolveHistoryStatus(room.status),
    startedAt: room.startedAt ?? room.createdAt,
    endedAt: room.endedAt ?? room.startedAt ?? room.createdAt,
    durationSeconds: resolveMeetingDurationSeconds({
      durationSeconds: room.durationSeconds,
      startedAt: room.startedAt,
      endedAt: room.endedAt,
    }),
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
    summary,
    artifacts,
    retention: resolveRetention(artifacts),
    consent: {
      recording: artifacts.some((artifact) => artifact.consentRequired) ? "granted" : "not_required",
      transcript: "not_required",
      summary: "not_required",
    },
  };
}

export const roomHistoryService = {
  /**
   * One PAGE of finished rooms, plus the server's own `total`.
   *
   * This used to ask for `pageSize: 100` (the server clamps there anyway) and throw away
   * `total`/`page`/`pageSize`, so a workspace with 300 meetings rendered "100 results" and
   * the other 200 meetings were unreachable — including by `?room=<id>` deep link.
   */
  async listEndedRooms(options: {
    workspaceId: string;
    state?: "ready" | "empty" | "permission_denied" | "error";
    artifactStatus?: RoomArtifactStatus;
    /** 1-based. */
    page?: number;
    pageSize?: number;
    /** Server-side status filter; omit for both ENDED and CANCELLED. */
    status?: "ended" | "cancelled";
    /** Server-side search over the whole archive, not just the loaded page. */
    search?: string;
  }): Promise<RoomHistoryResponse> {
    const page = options.page && options.page > 0 ? Math.floor(options.page) : 1;
    const pageSize = options.pageSize ?? ROOM_HISTORY_PAGE_SIZE;

    if (options?.state && options.state !== "ready") {
      return { rooms: [], total: 0, page, pageSize };
    }

    const { data } = await translationRoomService.history({
      workspaceId: options.workspaceId,
      status: options.status ? options.status.toUpperCase() : "ENDED,CANCELLED",
      search: options.search?.trim() || undefined,
      page,
      pageSize,
    });
    const rooms = data.rooms.map(mapHistoryItem);

    // `artifactStatus` is a client-side refinement of the page the server returned, so it
    // cannot be reflected in `total` — the pager reports the server's count, which is the
    // honest number for the current server-side filters.
    return {
      rooms: options?.artifactStatus
        ? rooms.filter((room) => room.artifacts.some((artifact) => artifact.status === options.artifactStatus))
        : rooms,
      total: data.total ?? rooms.length,
      page: data.page ?? page,
      pageSize: data.pageSize ?? pageSize,
    };
  },
};
