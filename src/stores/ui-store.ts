import { create } from "zustand";

interface UIState {
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
  createRoomModalOpen: boolean;
  setCreateRoomModalOpen: (open: boolean) => void;
  searchMeetingModalOpen: boolean;
  setSearchMeetingModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  rightSidebarOpen: false,
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
  createRoomModalOpen: false,
  setCreateRoomModalOpen: (open) => set({ createRoomModalOpen: open }),
  searchMeetingModalOpen: false,
  setSearchMeetingModalOpen: (open) => set({ searchMeetingModalOpen: open }),
}));
