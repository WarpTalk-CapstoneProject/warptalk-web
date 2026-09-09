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

/**
 * How much of a transcript can be read in one language.
 *
 * The live pipeline only translates into whatever target was selected at that moment, so a
 * meeting that switched languages half way through has a different subset covered for each of
 * them, and one where translation was never started has none. `missing` is the work a backfill
 * would do; `status` says whether one is already doing it.
 */
export interface TranscriptLanguageCoverage {
  targetLanguage: string;
  /** Real lines only — control markers and system notices are not part of the meeting. */
  totalSegments: number;
  /** Lines already spoken in this language; their own words are the answer. */
  spokenInTarget: number;
  translated: number;
  missing: number;
  status: "idle" | "running" | "complete" | "failed";
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

/**
 * One stretch during which the transcript was deliberately not written down. WT-605.
 *
 * `endedAt` null means the pause is still in force — that is how anyone joining mid-pause learns
 * the state, since the broadcast that told everybody else fired before they arrived.
 */
export interface TranscriptPauseWindowDto {
  id: string;
  translationRoomId: string;
  startedAt: string;
  endedAt: string | null;
}
