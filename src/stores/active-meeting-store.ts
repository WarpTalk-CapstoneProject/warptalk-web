import { create } from "zustand";

type ActiveMeetingState = {
  activeRoomId: string | null;
  openMeeting: (roomId: string) => void;
  closeMeeting: () => void;
};

export const useActiveMeetingStore = create<ActiveMeetingState>((set) => ({
  activeRoomId: null,
  openMeeting: (roomId) => set({ activeRoomId: roomId }),
  closeMeeting: () => set({ activeRoomId: null }),
}));
