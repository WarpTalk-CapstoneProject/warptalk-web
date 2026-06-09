import { create } from "zustand";

interface UIState {
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  rightSidebarOpen: false,
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  toggleRightSidebar: () => set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),
}));
