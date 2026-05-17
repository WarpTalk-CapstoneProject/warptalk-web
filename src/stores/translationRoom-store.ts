import { create } from "zustand";
import type {
  ChatMessageDto,
  TranslationRoomStateDto,
  ParticipantInfoDto,
  TranscriptSegmentDto,
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
      transcriptSegments: [...s.transcriptSegments, segment],
    })),

  addChatMessage: (message) =>
    set((s) => ({
      chatMessages: [...s.chatMessages, message],
    })),

  setMuted: (isMuted) => set({ isMuted }),

  reset: () => set(initialState),
}));
