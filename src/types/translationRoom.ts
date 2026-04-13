/**
 * TranslationRoom domain types — aligned with backend TranslationRoomService DTOs.
 * Source: WarpTalk.TranslationRoomService.Application.DTOs.TranslationRoomDtos
 */

// ── Response DTOs ─────────────────────────────

export type TranslationRoomStatus = "scheduled" | "active" | "completed" | "cancelled";

export interface TranslationRoomDto {
  id: string;
  workspaceId: string;
  hostId: string;
  title: string;
  description?: string;
  translationRoomCode: string;
  status: TranslationRoomStatus;
  translationRoomType: string;
  maxParticipants: number;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface TranslationRoomParticipantDto {
  id: string;
  translationRoomId: string;
  userId: string;
  displayName: string;
  role: "host" | "participant" | "interpreter";
  listenLanguage: string;
  speakLanguage: string;
  status: "joined" | "left" | "removed";
  joinedAt?: string;
}

// ── Request DTOs ──────────────────────────────

export interface CreateTranslationRoomRequest {
  workspaceId?: string;
  title: string;
  description?: string;
  translationRoomType: "one_to_one" | "group" | "webinar" | "b2b_virtual_mic";
  maxParticipants: number;
  sourceLanguage: string;
  targetLanguages: string;
  scheduledAt?: string;
}

export interface JoinTranslationRoomRequest {
  displayName: string;
  listenLanguage: string;
  speakLanguage: string;
}
