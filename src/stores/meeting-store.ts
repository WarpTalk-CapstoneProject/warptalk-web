import { create } from "zustand";
import type {
  ChatMessageDto,
  MeetingStateDto,
  ParticipantInfoDto,
  TranscriptSegmentDto,
} from "@/types/realtime";

interface MeetingStoreState {
  // Current live meeting state
  meetingState: MeetingStateDto | null;
  participants: ParticipantInfoDto[];
  transcriptSegments: TranscriptSegmentDto[];
  chatMessages: ChatMessageDto[];
  isMuted: boolean;

  // Actions — called from SignalR event handlers
  setMeetingState: (state: MeetingStateDto) => void;
  setParticipants: (participants: ParticipantInfoDto[]) => void;
  addParticipant: (participant: ParticipantInfoDto) => void;
  removeParticipant: (userId: string) => void;
  addTranscriptSegment: (segment: TranscriptSegmentDto) => void;
  addChatMessage: (message: ChatMessageDto) => void;
  setMuted: (muted: boolean) => void;
  reset: () => void;
}

const initialState = {
  meetingState: null,
  participants: [],
  transcriptSegments: [],
  chatMessages: [],
  isMuted: false,
};

export const useMeetingStore = create<MeetingStoreState>()((set) => ({
  ...initialState,

  setMeetingState: (meetingState) =>
    set({ meetingState, participants: meetingState.participants }),

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
      participants: s.participants.filter((p) => p.userId !== userId),
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
