/**
 * TranslationRoom domain types — aligned with backend TranslationRoomService DTOs.
 * Source: WarpTalk.TranslationRoomService.Application.DTOs.TranslationRoomDtos
 */

// ── Response DTOs ─────────────────────────────

export type TranslationRoomStatus =
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "paused"
  | "ended"
  | "cancelled"
  | "expired"
  | "failed"
  | "timeout";

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
  targetLanguages: string[];
  scheduledAt?: string;
  invitedEmails?: string[];
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  createdAt: string;
  settings?: {
    requiresApproval: boolean;
  };
  participantCount?: number;
  isHost?: boolean;
}

/** One Start→Pause (or Start→End) window — "Translation N" in the transcript is this
 * list's chronological position (oldest first). */
export interface TranslationRoomSessionDto {
  id: string;
  translationRoomId: string;
  mainLanguage: string;
  audioUrl?: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface TranslationRoomParticipantDto {
  id: string;
  translationRoomId: string;
  userId: string;
  displayName: string;
  role: "host" | "participant" | "interpreter" | "HOST" | "PARTICIPANT" | "INTERPRETER";
  listenLanguage: string;
  speakLanguage: string;
  status: "invited" | "waiting" | "joined" | "connected" | "disconnected" | "left" | "removed" | "kicked" | "rejected";
  isTranslationAudioEnabled?: boolean;
  isUsingVoiceClone?: boolean;
  avatarUrl?: string;
  joinedAt?: string;
  isExternal?: boolean;
}

// ── Request DTOs ──────────────────────────────

export interface CreateTranslationRoomRequest {
  workspaceId: string;
  title: string;
  description?: string;
  /** One of MEETING_TYPES' `value` (src/lib/meeting-types.ts). */
  translationRoomType: string;
  /** Omit to let the meeting type decide the seat count. */
  maxParticipants?: number;
  sourceLanguage: string;
  targetLanguages: string[];
  /**
   * Every field optional and only sent when the user overrides it — the meeting type seeds
   * whatever is left out, so sending `false` is not the same as sending nothing.
   */
  settings?: {
    requiresApproval?: boolean;
    artifactAccess?: string;
    muteOnEntry?: boolean;
    autoRecord?: boolean;
    breakoutsEnabled?: boolean;
  };
  scheduledAt?: string;
  invitedEmails?: string[];
}

export interface TranslationRoomListResponse {
  rooms: TranslationRoomDto[];
  total: number;
  page: number;
  pageSize: number;
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
  updatedAt: string;
}

export interface TranslationRoomInvitationDto {
  id: string;
  translationRoomId: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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

export interface TranslationRoomArtifactDto {
  id: string;
  translationRoomId: string;
  type: string;
  title: string;
  fileUrl?: string;
  fileFormat?: string;
  fileSizeBytes?: number;
  containsRawAudio: boolean;
  containsRawVideo: boolean;
  consentRequired: boolean;
  retentionUntil?: string;
  status: string;
  createdAt: string;
  /** Inline artifact payload (e.g. the AI meeting-summary JSON). Null for artifact types
   * that only carry a fileUrl (transcript export, recording). */
  content?: string | null;
}

export interface TranslationRoomHistoryItemDto {
  room: TranslationRoomDto;
  participants: TranslationRoomParticipantDto[];
  artifacts: TranslationRoomArtifactDto[];
}

export interface TranslationRoomHistoryResponse {
  rooms: TranslationRoomHistoryItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateRoomSettingsRequest {
  title?: string;
  description?: string;
  maxParticipants?: number;
  scheduledAt?: string;
  invitedEmails?: string[];
  sourceLanguage?: string;
  targetLanguages?: string[];
  settings?: Record<string, unknown>;
}

export interface RoomPreflightResponse {
  roomCode: string;
  requiresJoinRequest: boolean;
  isUserMember: boolean;
  isDomainMatched: boolean;
  allowExternalCollaboration: boolean;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
  isAuthenticated: boolean;
}
