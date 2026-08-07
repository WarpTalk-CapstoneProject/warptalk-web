import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ActiveMeetingState = {
  activeRoomId: string | null;
  openMeeting: (roomId: string) => void;
  closeMeeting: () => void;
};

/**
 * WT-306: which meeting this TAB is in.
 *
 * sessionStorage, not localStorage, and deliberately so: the value decides which LiveKit
 * identity this browsing context holds. localStorage is shared by every tab of the origin, so
 * two tabs would rehydrate the same room id and race for one identity — LiveKit resolves that
 * by evicting the older publisher, which is exactly the "someone kicked me out" report we are
 * fixing. sessionStorage is per-tab, so a second tab starts with no meeting until it opens one.
 *
 * Only `activeRoomId` is persisted — the actions are recreated on every load and must never be
 * read back from storage.
 *
 * Persisted state is untrusted input: it can name a room that ended, was cancelled, or that
 * this account can no longer see. Rehydration therefore only restores the ID; the mounted
 * session validates the room against the API and calls closeMeeting() when it is no longer
 * joinable (see PersistentMeetingSession's stale-session effect).
 */
export const ACTIVE_MEETING_STORAGE_KEY = "warptalk.meeting.active";

export const useActiveMeetingStore = create<ActiveMeetingState>()(
  persist(
    (set) => ({
      activeRoomId: null,
      openMeeting: (roomId) => set({ activeRoomId: roomId }),
      closeMeeting: () => set({ activeRoomId: null }),
    }),
    {
      name: ACTIVE_MEETING_STORAGE_KEY,
      // createJSONStorage swallows the ReferenceError on the server and yields an undefined
      // storage, so this module stays importable from SSR'd trees.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ activeRoomId: state.activeRoomId }),
    },
  ),
);
