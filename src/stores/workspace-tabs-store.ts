import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceTab = {
  id: string;
  title: string;
  href: string;
  closable?: boolean;
};

interface WorkspaceTabsState {
  tabsByScope: Record<string, WorkspaceTab[]>;
  addTab: (scope: string, tab: WorkspaceTab) => void;
  closeTab: (scope: string, id: string) => void;
  reorderTabs: (scope: string, tabs: WorkspaceTab[]) => void;
  /**
   * Forget every scope's tabs. Tab titles are room and page names, and this store is
   * persisted, so without this the previous account's open tabs survive a sign-out, a
   * sign-in and a browser restart.
   */
  clearAllTabs: () => void;
}

const MAX_TABS = 8;

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
  persist(
    (set) => ({
      tabsByScope: {},
      addTab: (scope, tab) =>
        set((state) => {
          const existingTabs = state.tabsByScope[scope] ?? [];
          if (existingTabs.some((item) => item.href === tab.href)) return state;

          const nextTabs = [...existingTabs, tab];
          const pinnedTabs = nextTabs.filter((item) => item.closable === false);
          const closableTabs = nextTabs.filter((item) => item.closable !== false);
          const trimmedTabs = [...pinnedTabs, ...closableTabs.slice(Math.max(0, nextTabs.length - MAX_TABS))];

          return {
            tabsByScope: {
              ...state.tabsByScope,
              [scope]: trimmedTabs,
            },
          };
        }),
      closeTab: (scope, id) =>
        set((state) => {
          const existingTabs = state.tabsByScope[scope] ?? [];
          const nextTabs = existingTabs.filter((tab) => tab.id !== id || tab.closable === false);

          return {
            tabsByScope: {
              ...state.tabsByScope,
              [scope]: nextTabs,
            },
          };
        }),
      reorderTabs: (scope, tabs) =>
        set((state) => ({
          tabsByScope: {
            ...state.tabsByScope,
            [scope]: tabs,
          },
        })),
      clearAllTabs: () => set({ tabsByScope: {} }),
    }),
    {
      name: "warptalk-workspace-tabs-v2",
      partialize: (state) => ({ tabsByScope: state.tabsByScope }),
    }
  )
);
