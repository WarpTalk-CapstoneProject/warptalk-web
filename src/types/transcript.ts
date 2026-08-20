/**
 * Transcript domain types — aligned with backend TranscriptService DTOs.
 * Source: WarpTalk.TranscriptService.Application.DTOs.TranscriptDtos
 */

// ── Response DTOs ─────────────────────────────

export type TranscriptStatus =
  | "recording"
  | "finalizing"
  | "finalized"
  | "archived"
  | "processing"
  | "completed"
  | "failed";

export interface PagedResult<T> {
  totalCount: number;
  items: T[];
}

export interface TranscriptDto {
  id: string;
  workspaceId?: string;
  translationRoomId: string;
  version: number;
  status: TranscriptStatus;
  sourceLanguage: string;
  totalSegments: number;
  totalDurationMs: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  /** WT-473: the UTC instant startTimeMs values are measured from. Absent means the
   *  transcript CANNOT be aligned to a recording — never substitute createdAt. */
  timelineAnchorAt?: string | null;
}

export interface TranscriptSegmentDto {
  id: string;
  speakerParticipantId?: string;
  speakerName: string;
  originalText: string;
  originalLanguage: string;
  confidence?: number;
  startTimeMs: number;
  endTimeMs: number;
  sequenceOrder: number;
  /** A human has corrected this line. Also what tells the summary it is behind the record. */
  isCorrected?: boolean;
  /** When the row last changed — moved by a correction. */
  updatedAt?: string | null;
}

export interface TranscriptTranslationDto {
  id: string;
  segmentId: string;
  targetLanguage: string;
  translatedText: string;
  translatorModel: string;
  confidence?: number;
  isRetranslated: boolean;
  latencyMs?: number;
}

export interface TranscriptExportDto {
  id: string;
  transcriptId: string;
  userId: string;
  format: string;
  fileUrl: string;
  includedLanguages: string[];
  createdAt: string;
}

// ── Request DTOs ──────────────────────────────

export interface CreateTranscriptRequest {
  translationRoomId: string;
  sourceLanguage: string;
}

export interface ProcessAudioChunkRequest {
  base64AudioData: string;
}

export interface UpdateTranscriptStatusRequest {
  status: string;
  totalSegments: number;
  totalDurationMs: number;
}

export interface CreateTranscriptExportRequest {
  format: "txt" | "csv";
  includedLanguages?: string[];
}

export interface CreateCorrectionRequest {
  originalText: string;
  correctedText: string;
  correctionType: "stt" | "translation" | "speaker" | "timing";
}
