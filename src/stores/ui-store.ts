import { create } from "zustand";

interface UIState {
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  toggleLeftSidebar: () => void;
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
  createRoomModalOpen: boolean;
  setCreateRoomModalOpen: (open: boolean) => void;
  searchMeetingModalOpen: boolean;
  setSearchMeetingModalOpen: (open: boolean) => void;
  setupRoomModalOpen: boolean;
  setSetupRoomModalOpen: (open: boolean) => void;
  setupRoomId: string | null;
  setSetupRoomId: (id: string | null) => void;
  editRoomId: string | null;
  setEditRoomId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  leftSidebarOpen: true,
  setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
  toggleLeftSidebar: () => set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
  rightSidebarOpen: false,
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
  createRoomModalOpen: false,
  setCreateRoomModalOpen: (open) => set({ createRoomModalOpen: open }),
  searchMeetingModalOpen: false,
  setSearchMeetingModalOpen: (open) => set({ searchMeetingModalOpen: open }),
  setupRoomModalOpen: false,
  setSetupRoomModalOpen: (open) => set({ setupRoomModalOpen: open }),
  setupRoomId: null,
  setSetupRoomId: (id) => set({ setupRoomId: id }),
  editRoomId: null,
  setEditRoomId: (id) => set({ editRoomId: id }),
}));
