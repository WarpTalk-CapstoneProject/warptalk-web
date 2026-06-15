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

  // Actions — called from SignalR event handlers
  setTranslationRoomState: (state: TranslationRoomStateDto) => void;
  setParticipants: (participants: ParticipantInfoDto[]) => void;
  addParticipant: (participant: ParticipantInfoDto) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantMute: (userId: string, isMuted: boolean) => void;
  addTranscriptSegment: (segment: TranscriptSegmentDto) => void;
  addOrMergeTranslationText: (translation: TranslationTextDto) => void;
  setChatMessages: (messages: ChatMessageDto[]) => void;
  addChatMessage: (message: ChatMessageDto) => void;
  setMuted: (muted: boolean) => void;
  reset: () => void;
}

const initialState = {
  translationRoomState: null,
  participants: [],
  transcriptSegments: [],
  chatMessages: [],
  isMuted: false,
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
    set((s) => ({
      transcriptSegments: s.transcriptSegments.some((segment) => segment.segmentId === translation.segmentId)
        ? s.transcriptSegments.map((segment) =>
            segment.segmentId === translation.segmentId
              ? {
                  ...segment,
                  originalText: segment.originalText || translation.originalText,
                  originalLanguage: segment.originalLanguage || translation.sourceLang,
                  translatedText: translation.translatedText,
                  targetLanguage: translation.targetLang,
                }
              : segment,
          )
        : [
            ...s.transcriptSegments,
            {
              segmentId: translation.segmentId,
              speakerId: translation.speakerId,
              speakerName: "Speaker",
              originalText: translation.originalText,
              originalLanguage: translation.sourceLang,
              translatedText: translation.translatedText,
              targetLanguage: translation.targetLang,
              confidence: 1,
              startTimeMs: 0,
              endTimeMs: 0,
            },
          ],
    })),

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

  setMuted: (isMuted) => set({ isMuted }),

  reset: () => set(initialState),
}));

function mergeChatMessages(current: ChatMessageDto[], incoming: ChatMessageDto[]) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));

  return Array.from(messagesById.values()).sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}
