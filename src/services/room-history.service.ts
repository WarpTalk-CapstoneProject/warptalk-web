import { translationRoomService } from "@/services/translation-room.service";
import { calculateMeetingDurationSeconds } from "@/lib/meeting/meeting-duration";
import type { EndedRoomHistoryItem, RoomArtifactStatus, RoomHistoryResponse, TranslationRoomSummaryArtifact } from "@/types/roomHistory";
import {
  resolveArtifactStatus,
  resolveHistoryStatus,
  resolveMeetingDurationSeconds,
  resolveRetention,
} from "@/lib/meeting/room-history-mapping";
import type { TranslationRoomArtifactDto, TranslationRoomHistoryItemDto } from "@/types/translationRoom";
import { parseMeetingSummaryContent } from "@/types/meetingSummary";

function normalizeArtifactStatus(status: string): RoomArtifactStatus {
  const normalized = status.toLowerCase();
  if (["ready", "processing", "expired", "missing", "failed", "deleted"].includes(normalized)) {
    return normalized as RoomArtifactStatus;
  }
  // Backend TranslationRoomArtifact.Status is set from ArtifactStatus/"COMPLETED" (see
  // ArtifactMapper.ToEntity), never "active" or "ready" directly — without this mapping
  // every finished artifact fell into the `processing` fallback below and never showed as
  // ready, leaving downloads (and the AI summary) stuck looking like they never finished.
  if (normalized === "active" || normalized === "completed") return "ready";
  return "processing";
}

function normalizeArtifactType(type: string): EndedRoomHistoryItem["artifacts"][number]["type"] {
  const normalized = type.toLowerCase();
  if (normalized === "optional_recording") return "recording";
  if (normalized === "transcript_export" || normalized === "summary_export" || normalized === "debug_log" || normalized === "audio_sample") {
    return normalized;
  }
  return "transcript_export";
}

/**
 * WT-333: exported, not moved. The personal timeline needs the same artifact shape the archive
 * builds, and the `completed` → `ready` mapping above is a fix that took a bug to find — a second
 * copy of it in another service is a second place for it to be lost. Nothing else here changes.
 */
export function mapArtifact(artifact: TranslationRoomArtifactDto): EndedRoomHistoryItem["artifacts"][number] {
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
    status: normalizeArtifactStatus(artifact.status),
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
    templateKey: parsed.templateKey,
    sections: parsed.sections,
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
    status: resolveHistoryStatus(room.status),
    startedAt: room.startedAt ?? room.createdAt,
    endedAt: room.endedAt ?? room.startedAt ?? room.createdAt,
    // createdAt is when the ROW was inserted. The demo-prep checklist has the team
    // pre-creating meetings the night before, so measuring from it reported ~14h for a
    // twenty-minute call — wrong by exactly the amount that is most visible.
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
    // Nothing in warptalk-backend writes an artifact retention date and there is no purge
    // job, so the old block was three invented numbers and a "policy name" no policy backed.
    // Worse, expiresAt fell back to the meeting's own end time, which rendered "Retention
    // ends <the moment it ended>" for every meeting ever held.
    retention: resolveRetention(artifacts),
    consent: {
      recording: artifacts.some((artifact) => artifact.consentRequired) ? "granted" : "not_required",
      transcript: "not_required",
      summary: "not_required",
    },
  };
}

/**
 * Deliberately still the old 100 until the history page grows a pager.
 *
 * The plumbing below now forwards page/pageSize and surfaces the server's total, but no
 * screen drives it yet. Dropping this to a screenful first would shrink the archive from
 * 100 meetings to 20 with no way to reach the rest — a worse cap than the one being fixed.
 * The pager change lowers it.
 */
export const ROOM_HISTORY_PAGE_SIZE = 100;

export const roomHistoryService = {
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

    // pageSize used to be a hardcoded 100 with no page, which is not "no pagination" — it is
    // a silent cap. A workspace with more than a hundred ended meetings simply could not
    // reach the rest of its own archive, and nothing on screen said so.
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
      page,
      pageSize,
    };
  },
};
