import { create } from "zustand";
import type {
  ChatMessageDto,
  TranslationRoomStateDto,
  ParticipantInfoDto,
  TranscriptSegmentDto,
  TranslationTextDto,
} from "@/types/realtime";

interface TranslationRoomStoreState {
  // Current live translationRoom state
  translationRoomState: TranslationRoomStateDto | null;
  participants: ParticipantInfoDto[];
  transcriptSegments: TranscriptSegmentDto[];
  chatMessages: ChatMessageDto[];
  isMuted: boolean;
  // userIds of OTHER participants with a raised hand — TranslationRoomHub.RaiseHand
  // broadcasts via OthersInGroup, so this never includes the caller's own userId; the
  // caller tracks its own raised state locally instead.
  raisedHands: string[];

  // Actions — called from SignalR event handlers
  setTranslationRoomState: (state: TranslationRoomStateDto) => void;
  setParticipants: (participants: ParticipantInfoDto[]) => void;
  addParticipant: (participant: ParticipantInfoDto) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantMute: (userId: string, isMuted: boolean) => void;
  updateParticipantSpeakLanguage: (userId: string, speakLanguage: string) => void;
  addTranscriptSegment: (segment: TranscriptSegmentDto) => void;
  addOrMergeTranslationText: (translation: TranslationTextDto) => void;
  setChatMessages: (messages: ChatMessageDto[]) => void;
  addChatMessage: (message: ChatMessageDto) => void;
  hideChatMessage: (messageId: string) => void;
  setMuted: (muted: boolean) => void;
  setHandRaised: (userId: string, isRaised: boolean) => void;
  reset: () => void;
}

const initialState = {
  translationRoomState: null,
  participants: [],
  transcriptSegments: [],
  chatMessages: [],
  isMuted: false,
  raisedHands: [],
};

export const useTranslationRoomStore = create<TranslationRoomStoreState>()((set) => ({
  ...initialState,

  setTranslationRoomState: (translationRoomState) =>
    set({ translationRoomState, participants: translationRoomState.participants }),

  setParticipants: (participants) => set({ participants }),

  addParticipant: (participant) =>
    set((s) => ({
      participants: [
        ...s.participants.filter((p) => p.userId !== participant.userId),
        participant,
      ],
    })),

  removeParticipant: (userId) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.userId === userId ? { ...p, status: "left" } : p
      ),
    })),

  updateParticipantMute: (userId, isMuted) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.userId === userId ? { ...p, isMuted } : p
      ),
    })),

  updateParticipantSpeakLanguage: (userId, speakLanguage) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.userId === userId ? { ...p, speakLanguage } : p
      ),
    })),

  addTranscriptSegment: (segment) =>
    set((s) => ({
      transcriptSegments: s.transcriptSegments.some((existing) => existing.segmentId === segment.segmentId)
        ? s.transcriptSegments.map((existing) =>
            existing.segmentId === segment.segmentId
              ? {
                  ...segment,
                  translatedText: existing.translatedText || segment.translatedText,
                  targetLanguage: existing.targetLanguage || segment.targetLanguage,
                }
              : existing,
          )
        : [...s.transcriptSegments, segment],
    })),

  addOrMergeTranslationText: (translation) =>
    set((s) => {
      // translation.segmentId is its OWN id ("{sourceSegmentId}-{targetLang}-c{idx}"), never
      // equal to the transcript bubble's segmentId — sourceSegmentId is the actual join key
      // back to the TranscriptSegmentReceived bubble it translates. Falling back to
      // translation.segmentId only covers old/unmigrated messages that never carried it.
      const joinKey = translation.sourceSegmentId || translation.segmentId;
      const chunkIndex = translation.chunkIndex ?? 0;
      const existingIndex = s.transcriptSegments.findIndex((segment) => segment.segmentId === joinKey);

      if (existingIndex === -1) {
        return {
          transcriptSegments: [
            ...s.transcriptSegments,
            {
              segmentId: joinKey,
              speakerId: translation.speakerId,
              speakerName: "Speaker",
              originalText: translation.originalText,
              originalLanguage: translation.sourceLang,
              translatedText: translation.translatedText,
              targetLanguage: translation.targetLang,
              confidence: 1,
              startTimeMs: translation.startTimeMs ?? 0,
              endTimeMs: translation.endTimeMs ?? 0,
            },
          ],
        };
      }

      const segment = s.transcriptSegments[existingIndex];
      // One STT segment can be split into multiple translated sentences (chunk_index >
      // 0 for the 2nd+ sentence) — those must be APPENDED, not overwrite the first
      // sentence's translation. chunk_index 0 always replaces (it's either the only
      // sentence, or a fresh segment's first one).
      const translatedText =
        chunkIndex > 0 && segment.targetLanguage === translation.targetLang && segment.translatedText
          ? `${segment.translatedText} ${translation.translatedText}`.trim()
          : translation.translatedText;

      const updated = {
        ...segment,
        originalText: segment.originalText || translation.originalText,
        originalLanguage: segment.originalLanguage || translation.sourceLang,
        translatedText,
        targetLanguage: translation.targetLang,
        startTimeMs: segment.startTimeMs || translation.startTimeMs || 0,
        endTimeMs: translation.endTimeMs || segment.endTimeMs,
      };

      const transcriptSegments = s.transcriptSegments.slice();
      transcriptSegments[existingIndex] = updated;
      return { transcriptSegments };
    }),

  setChatMessages: (messages) =>
    set((s) => ({
      chatMessages: mergeChatMessages(s.chatMessages, messages),
    })),

  addChatMessage: (message) =>
    set((s) => ({
      chatMessages: s.chatMessages.some((existing) => existing.id === message.id)
        ? s.chatMessages.map((existing) => (existing.id === message.id ? message : existing))
        : [...s.chatMessages, message],
    })),

  hideChatMessage: (messageId) =>
    set((s) => ({
      chatMessages: s.chatMessages.filter((m) => m.id !== messageId),
    })),

  setMuted: (isMuted) => set({ isMuted }),

  setHandRaised: (userId, isRaised) =>
    set((s) => ({
      raisedHands: isRaised
        ? s.raisedHands.includes(userId)
          ? s.raisedHands
          : [...s.raisedHands, userId]
        : s.raisedHands.filter((id) => id !== userId),
    })),

  reset: () => set(initialState),
}));

function mergeChatMessages(current: ChatMessageDto[], incoming: ChatMessageDto[]) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));

  return Array.from(messagesById.values()).sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}
