import { create } from "zustand";

import type { MeetingStartedNotice } from "@/lib/notifications/meeting-started-notice";

/**
 * The "a meeting has started" notice currently on screen.
 *
 * WHY A STORE AND NOT A TOAST
 *   This was a sonner toast, which meant it was positioned against the VIEWPORT — bottom-right,
 *   the one corner guaranteed to cover something. The WarpBot launcher lives there, and the mini
 *   meeting dock learned the same lesson before it (see mini-dock-position.ts, which exists
 *   because the dock used to be pinned to that corner). A notice about a meeting belongs inside
 *   the content area it interrupts, not floating over the whole application chrome.
 *
 *   Putting it in the layout's main column instead means the layout has to render it, and the
 *   SignalR handler that learns about the meeting is nowhere near the layout. This store is the
 *   wire between them, and it is deliberately the smallest thing that can be: one nullable value.
 *
 * NEVER PERSISTED
 *   A meeting that started is only news while it is starting. Restoring one from storage on the
 *   next page load would offer a Join button for a meeting that ended an hour ago.
 */
type MeetingStartedState = {
  notice: (MeetingStartedNotice & { key: string }) | null;
  show: (notice: MeetingStartedNotice) => void;
  dismiss: () => void;
};

export const useMeetingStartedStore = create<MeetingStartedState>((set) => ({
  notice: null,
  // Keyed by target so the same meeting arriving twice — a reconnect replays it — replaces the
  // notice rather than restarting its timer from a component that never unmounted.
  show: (notice) => set({ notice: { ...notice, key: notice.joinHref ?? notice.title } }),
  dismiss: () => set({ notice: null }),
}));
