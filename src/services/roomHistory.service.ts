import { translationRoomService } from "@/services/translationRoom.service";
import type { EndedRoomHistoryItem, RoomArtifactStatus, RoomHistoryResponse } from "@/types/roomHistory";
import type { TranslationRoomArtifactDto, TranslationRoomHistoryItemDto } from "@/types/translationRoom";

function normalizeArtifactStatus(status: string): RoomArtifactStatus {
  const normalized = status.toLowerCase();
  if (["ready", "processing", "expired", "missing", "failed", "deleted"].includes(normalized)) {
    return normalized as RoomArtifactStatus;
  }
  return normalized === "active" ? "ready" : "processing";
}

function normalizeArtifactType(type: string): EndedRoomHistoryItem["artifacts"][number]["type"] {
  const normalized = type.toLowerCase();
  if (normalized === "optional_recording") return "recording";
  if (normalized === "transcript_export" || normalized === "summary_export" || normalized === "debug_log" || normalized === "audio_sample") {
    return normalized;
  }
  return "transcript_export";
}

function mapArtifact(artifact: TranslationRoomArtifactDto): EndedRoomHistoryItem["artifacts"][number] {
  return {
    id: artifact.id,
    type: normalizeArtifactType(artifact.type),
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
    backendSource: "translation_room_recordings",
  };
}

function mapHistoryItem(item: TranslationRoomHistoryItemDto): EndedRoomHistoryItem {
  const room = item.room;
  const artifacts = item.artifacts.map(mapArtifact);
  const firstExpiry = artifacts.find((artifact) => artifact.expiresAt)?.expiresAt;

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
    durationSeconds: room.durationSeconds ?? 0,
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
  async listEndedRooms(options?: {
    state?: "ready" | "empty" | "permission_denied" | "error";
    artifactStatus?: RoomArtifactStatus;
  }): Promise<RoomHistoryResponse> {
    if (options?.state && options.state !== "ready") {
      return { rooms: [] };
    }

    const { data } = await translationRoomService.history({
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
