import { translationRoomService } from "@/services/translation-room.service";
import { calculateMeetingDurationSeconds } from "@/lib/meeting/meeting-duration";
import type { EndedRoomHistoryItem, RoomArtifactStatus, RoomHistoryResponse, TranslationRoomSummaryArtifact } from "@/types/roomHistory";
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
  const firstExpiry = artifacts.find((artifact) => artifact.expiresAt)?.expiresAt;
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
    status: room.status === "cancelled" ? "cancelled" : "ended",
    startedAt: room.startedAt ?? room.createdAt,
    endedAt: room.endedAt ?? room.startedAt ?? room.createdAt,
    durationSeconds: calculateMeetingDurationSeconds(
      room.createdAt,
      room.endedAt ?? room.createdAt,
    ),
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
    retention: {
      policyName: "Workspace retention",
      expiresAt: firstExpiry ?? room.endedAt ?? room.createdAt,
      transcriptRetentionDays: 30,
      recordingRetentionDays: 7,
      deleteAfterExpiry: true,
    },
    consent: {
      recording: artifacts.some((artifact) => artifact.consentRequired) ? "granted" : "not_required",
      transcript: "not_required",
      summary: "not_required",
    },
  };
}

export const roomHistoryService = {
  async listEndedRooms(options: {
    workspaceId: string;
    state?: "ready" | "empty" | "permission_denied" | "error";
    artifactStatus?: RoomArtifactStatus;
  }): Promise<RoomHistoryResponse> {
    if (options?.state && options.state !== "ready") {
      return { rooms: [] };
    }

    const { data } = await translationRoomService.history({
      workspaceId: options.workspaceId,
      status: "ENDED,CANCELLED",
      pageSize: 100,
    });
    const rooms = data.rooms.map(mapHistoryItem);

    return {
      rooms: options?.artifactStatus
        ? rooms.filter((room) => room.artifacts.some((artifact) => artifact.status === options.artifactStatus))
        : rooms,
    };
  },
};
