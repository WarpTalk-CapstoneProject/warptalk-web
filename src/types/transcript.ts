/**
 * Transcript domain types — aligned with backend TranscriptService DTOs.
 * Source: WarpTalk.TranscriptService.Application.DTOs.TranscriptDtos
 */

// ── Response DTOs ─────────────────────────────

export type TranscriptStatus = "recording" | "processing" | "completed" | "failed";

export interface TranscriptDto {
  id: string;
  translationRoomId: string;
  version: number;
  status: TranscriptStatus;
  sourceLanguage: string;
  totalSegments: number;
  totalDurationMs: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
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
