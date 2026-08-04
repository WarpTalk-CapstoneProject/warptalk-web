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
  startTimeMs?: number;
  endTimeMs?: number;
  /** Links back to the TranscriptSegmentDto.segmentId this translation belongs to. */
  sourceSegmentId?: string;
  /** Position within the source segment's sentence split — 0 for the first (usual) sentence. */
  chunkIndex?: number;
}

export interface TranslatedAudioDto {
  segmentId: string;
  speakerId: string;
  audioBase64: string;
  voiceType: "default" | "blended" | "cloned";
  durationMs: number;
  voiceMode?: "standard" | "blended" | "cloned" | "caption_only";
  cloneStrength?: number;
  anchorProvider?: string;
  cloneProvider?: string;
  renderLocation?: "server" | "desktop";
  cacheKey?: string;
  cacheHit?: boolean;
  synthesisLatencyMs?: number;
  conversionLatencyMs?: number;
  fallbackReason?: string;
}

/**
 * An unprompted one-line hint about a transcript segment — pushed by the gateway as
 * "AiSuggestionReceived", produced by warptalk-ai/suggestion_worker.
 *
 * `segmentId` is the STT segment that triggered it, which is NOT necessarily the
 * `segmentId` of the bubble it belongs to: consecutive segments from one speaker are
 * merged into a single bubble whose id is the first segment's. Resolve it through
 * `findSuggestionForUtterance` rather than a direct lookup.
 *
 * Ephemeral — nothing about this is persisted, so it is gone after a reload.
 */
export interface AiSuggestionDto {
  translationRoomId: string;
  segmentId: string;
  category: "clarification" | "term" | "action" | "correction" | "fact" | (string & {});
  content: string;
  detail?: string | null;
  confidence: number;
  language: string;
  createdAt: string;
}

export interface ChatMentionDto {
  id: string;
  display: string;
  type: string;
}

export interface ChatMessageDto {
  id: string;
  meetingRoomId: string;
  senderUserId?: string;
  senderDisplayName: string;
  senderType: string;
  messageType: string;
  originalLanguage: string;
  originalText: string;
  translationEnabled: boolean;
  containsWarpbotMention?: boolean;
  mentions?: ChatMentionDto[];
  createdAt: string;
}

export interface ChatMessageTranslationDto {
  messageId: string;
  targetLanguage: string;
  translatedText: string;
  cached: boolean;
}

export interface TranslationRoomStateDto {
  translationRoomId: string;
  translationRoomCode: string;
  status: string;
  participants: ParticipantInfoDto[];
}

/** One selectable TTS voice — from TranslationRoomHub.GetVoiceCatalog. `id` is a real
 * Cartesia voice id, safe to round-trip straight into SetVoicePreference. */
export interface VoiceOptionDto {
  id: string;
  name: string;
  gender: string;
}
