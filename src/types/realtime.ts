/**
 * SignalR realtime DTOs — aligned with Gateway Hub models.
 * Source: WarpTalk.Gateway.Hubs.HubModels
 */

// ── Meeting Hub DTOs ──────────────────────────

export interface ParticipantInfoDto {
  userId: string;
  displayName: string;
  speakLanguage: string;
  listenLanguage: string;
  isMuted: boolean;
  joinedAt: string;
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

export interface ChatMessageDto {
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  sentAt: string;
}

export interface MeetingStateDto {
  meetingId: string;
  meetingCode: string;
  status: string;
  participants: ParticipantInfoDto[];
}
