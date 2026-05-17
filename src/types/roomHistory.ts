import type { TranscriptDto } from "@/types/transcript";
import type { TranslationRoomStatus } from "@/types/translationRoom";

export type RoomHistoryLoadState = "ready" | "loading" | "empty" | "permission_denied" | "error";

export type RoomArtifactType =
  | "transcript_export"
  | "summary_export"
  | "recording"
  | "debug_log"
  | "audio_sample";

export type RoomArtifactStatus = "ready" | "processing" | "expired" | "missing" | "failed" | "deleted";

export type RoomConsentStatus = "granted" | "limited" | "declined" | "not_required";

export interface RoomHistoryParticipant {
  id: string;
  userId: string;
  displayName: string;
  role: "host" | "co_host" | "participant" | "observer";
  speakLanguage: string;
  listenLanguage: string;
  joinedAt?: string;
  leftAt?: string;
}

export interface TranslationRoomRecordingArtifact {
  id: string;
  translationRoomId: string;
  recordingType: "audio" | "video" | "transcript" | "debug_log" | "audio_sample";
  fileUrl?: string;
  fileFormat: string;
  fileSizeBytes: number;
  durationSeconds: number;
  language?: string;
  status: RoomArtifactStatus;
  createdAt: string;
  expiresAt?: string;
  consentRequired: boolean;
  consentStatus: RoomConsentStatus;
}

export interface TranslationRoomSummaryArtifact {
  id: string;
  translationRoomId: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  modelUsed: string;
  processingTimeMs: number;
  generatedAt: string;
}

export interface TranscriptExportArtifact {
  id: string;
  transcriptId: string;
  userId: string;
  format: "txt" | "srt" | "vtt" | "pdf" | "docx";
  fileUrl?: string;
  includedLanguages: string[];
  status: RoomArtifactStatus;
  createdAt: string;
  expiresAt?: string;
  retentionDays: number;
}

export interface RoomHistoryArtifact {
  id: string;
  type: RoomArtifactType;
  title: string;
  description: string;
  status: RoomArtifactStatus;
  format?: string;
  fileUrl?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  language?: string;
  createdAt?: string;
  expiresAt?: string;
  retentionDays?: number;
  consentRequired?: boolean;
  consentStatus?: RoomConsentStatus;
  backendSource:
    | "translation_room_recordings"
    | "translation_room_summaries"
    | "transcript_exports"
    | "transcripts";
}

export interface EndedRoomHistoryItem {
  id: string;
  workspaceId: string;
  hostId: string;
  hostName: string;
  title: string;
  description?: string;
  translationRoomCode: string;
  status: Extract<TranslationRoomStatus, "ended" | "archived">;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  sourceLanguage: string;
  targetLanguages: string[];
  participants: RoomHistoryParticipant[];
  participantCount: number;
  transcript?: TranscriptDto;
  summary?: TranslationRoomSummaryArtifact;
  artifacts: RoomHistoryArtifact[];
  retention: {
    policyName: string;
    expiresAt: string;
    transcriptRetentionDays: number;
    recordingRetentionDays: number;
    deleteAfterExpiry: boolean;
  };
  consent: {
    recording: RoomConsentStatus;
    transcript: RoomConsentStatus;
    summary: RoomConsentStatus;
  };
}

export interface RoomHistoryResponse {
  rooms: EndedRoomHistoryItem[];
}
