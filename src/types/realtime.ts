/**
 * SignalR realtime DTOs — aligned with Gateway Hub models.
 * Source: WarpTalk.Gateway.Hubs.HubModels
 */

// ── TranslationRoom Hub DTOs ──────────────────────────

export interface ParticipantInfoDto {
  userId: string;
  displayName: string;
  speakLanguage: string;
  listenLanguage: string;
  isMuted: boolean;
  joinedAt: string;
  role?: "host" | "participant" | "interpreter";
  status?: "joined" | "connected" | "left" | "removed";
  avatarUrl?: string;
  isUsingVoiceClone?: boolean;
}

export interface TranscriptSegmentDto {
  segmentId: string;
  speakerId: string;
  speakerName: string;
  originalText: string;
  originalLanguage: string;
  translatedText?: string;
  targetLanguage?: string;
  confidence: number;
  startTimeMs: number;
  endTimeMs: number;
}

export interface TranslationTextDto {
  segmentId: string;
  speakerId: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

export interface ChatMessageDto {
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  sentAt: string;
}

export interface TranslationRoomStateDto {
  translationRoomId: string;
  translationRoomCode: string;
  status: string;
  participants: ParticipantInfoDto[];
}
