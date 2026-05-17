/**
 * TranslationRoom domain types — aligned with backend TranslationRoomService DTOs.
 * Source: WarpTalk.TranslationRoomService.Application.DTOs.TranslationRoomDtos
 */

// ── Response DTOs ─────────────────────────────

export type TranslationRoomStatus =
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "ended"
  | "archived"
  | "cancelled";

export type TranslationRoomLifecycleAction = "start" | "end" | "cancel";

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
  sourceLanguage?: string;
  targetLanguages?: string;
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
  status: "joined" | "connected" | "left" | "removed";
  isMuted?: boolean;
  isUsingVoiceClone?: boolean;
  avatarUrl?: string;
  joinedAt?: string;
}

// ── Request DTOs ──────────────────────────────

export interface CreateTranslationRoomRequest {
  workspaceId?: string;
  title: string;
  description?: string;
  translationRoomType:
    | "instant"
    | "scheduled"
    | "one_to_one"
    | "group"
    | "webinar"
    | "b2b_virtual_mic";
  maxParticipants: number;
  sourceLanguage: string;
  targetLanguages: string;
  scheduledAt?: string;
}

export interface TranslationRoomListResponse {
  rooms: TranslationRoomDto[];
  source: "mock" | "api";
  knownLimitations: string[];
}

export interface JoinTranslationRoomRequest {
  displayName: string;
  listenLanguage: string;
  speakLanguage: string;
}

export type JoinTranslationRoomAccessStatus =
  | "idle"
  | "loading"
  | "invalid_code"
  | "room_unavailable"
  | "room_full"
  | "kicked"
  | "rejected"
  | "success";

export interface JoinTranslationRoomByCodeRequest extends JoinTranslationRoomRequest {
  translationRoomCode: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
}

export interface TranslationRoomPreflightDto {
  id: string;
  title: string;
  translationRoomCode: string;
  status: TranslationRoomStatus;
  maxParticipants: number;
  currentParticipants: number;
  topics: string[];
  keyTerms: string[];
  sourceLanguage: string;
  targetLanguages: string[];
  defaultTargetLanguage: string;
  translationMode: "single" | "multi";
  desktopAppRequired: boolean;
}

export interface JoinTranslationRoomResultDto {
  status: JoinTranslationRoomAccessStatus;
  message: string;
  room?: TranslationRoomPreflightDto;
  participant?: TranslationRoomParticipantDto;
}

export interface TranslationRoomFeedbackDto {
  id: string;
  translationRoomId: string;
  userId: string;
  overallRating: number;
  translationQuality?: number;
  audioQuality?: number;
  voiceCloneQuality?: number;
  aiSummaryQuality?: number;
  comments?: string;
  communicationInsights?: Record<string, unknown>;
  createdAt: string;
}

export interface SubmitTranslationRoomFeedbackRequest {
  overallRating: number;
  translationQuality?: number;
  audioQuality?: number;
  voiceCloneQuality?: number;
  aiSummaryQuality?: number;
  comments?: string;
}

export interface TranslationRoomFeedbackStateDto {
  hasSubmitted: boolean;
  feedback?: TranslationRoomFeedbackDto;
}
