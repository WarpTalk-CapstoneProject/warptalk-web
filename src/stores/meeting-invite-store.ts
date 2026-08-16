import { create } from "zustand";

import type { MeetingInviteNotice } from "@/lib/notifications/meeting-started-notice";

/**
 * The "you were invited to a meeting" notice currently on screen.
 *
 * WHY IT IS ITS OWN STORE, NEXT TO meeting-started-store
 *   The two notices arrive from the same SignalR handler and look alike, but they are not the same
 *   news and must be able to be on screen at the same time: being invited to Thursday's review
 *   does not stop this morning's standup from going live. One shared slot would mean whichever
 *   arrived second silently replaced the first.
 *
 *   They also end differently. A started notice expires on its own — a meeting is only "starting"
 *   for so long. An invitation waits for an ANSWER, so it stays until Accept or dismiss: a timer
 *   that quietly removed the Accept button would turn "I did not answer" into "I never saw it".
 *
 * NEVER PERSISTED
 *   Same reason as its sibling: restoring one from storage on the next page load would offer an
 *   Accept button for an invitation that has already been answered somewhere else.
 */
type MeetingInviteState = {
  notice: (MeetingInviteNotice & { key: string }) | null;
  show: (notice: MeetingInviteNotice) => void;
  dismiss: () => void;
};

export const useMeetingInviteStore = create<MeetingInviteState>((set) => ({
  notice: null,
  // Keyed by room so the same invitation arriving twice — a reconnect replays it — replaces the
  // notice rather than stacking a second copy of the same question.
  show: (notice) => set({ notice: { ...notice, key: notice.roomId ?? notice.joinHref ?? notice.title } }),
  dismiss: () => set({ notice: null }),
}));
