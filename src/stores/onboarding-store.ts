import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * What this person has already been shown, and what they have already sent away.
 *
 * PERSISTED, NOT SESSION-SCOPED STORAGE
 *   Both facts here have to outlive the tab. A tour marked "finished" in `sessionStorage` runs
 *   again in the next tab and again after every restart, which is precisely the experience the
 *   tour exists to avoid inflicting twice. Same for a dismissed suggestion: "not now" that only
 *   lasts until you open a second tab is not a dismissal.
 *
 *   Outliving the tab means it also outlives the SIGNED-IN ACCOUNT unless something intervenes,
 *   which is the leak `lib/auth/session-scoped-state.ts` exists to close — so `reset()` is
 *   called from there. A new account on a shared browser gets its own tour and its own
 *   suggestions, not the previous one's "already seen".
 */
interface OnboardingState {
  /** Workspace id → when its invite suggestion was last dismissed (epoch ms). */
  inviteDismissedAt: Record<string, number>;
  /** When the product tour was last finished or skipped, or null if it never has been. */
  tourSeenAt: number | null;
  /**
   * Whether the tour is on screen right now. Deliberately NOT persisted — a tour that was open
   * when the tab closed should not reopen days later on a page it no longer describes.
   */
  tourOpen: boolean;

  dismissInviteSuggestion: (workspaceId: string, atMs: number) => void;
  openTour: () => void;
  /** Ends the tour and records that it has been seen — the same act whether finished or skipped. */
  closeTour: (atMs: number) => void;
  markTourSeen: (atMs: number) => void;
  /** Show the tour again on the next opportunity — what "restart the tour" does. */
  forgetTour: () => void;
  /** Called when the signed-in account changes. */
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      inviteDismissedAt: {},
      tourSeenAt: null,
      tourOpen: false,

      dismissInviteSuggestion: (workspaceId, atMs) =>
        set((state) => ({
          inviteDismissedAt: { ...state.inviteDismissedAt, [workspaceId]: atMs },
        })),

      openTour: () => set({ tourOpen: true }),

      // Skipping and finishing record the same thing on purpose. Someone who left after two
      // steps has decided they do not want this, and re-offering it on every sign-in would be
      // ignoring an answer they already gave.
      closeTour: (atMs) => set({ tourOpen: false, tourSeenAt: atMs }),

      markTourSeen: (atMs) => set({ tourSeenAt: atMs }),

      forgetTour: () => set({ tourSeenAt: null }),

      reset: () => set({ inviteDismissedAt: {}, tourSeenAt: null, tourOpen: false }),
    }),
    {
      name: "warptalk-onboarding",
      // `tourOpen` is window state, not a preference; persisting it would reopen the tour in
      // every new tab until somebody closed it in the right one.
      partialize: (state) => ({
        inviteDismissedAt: state.inviteDismissedAt,
        tourSeenAt: state.tourSeenAt,
      }),
    },
  ),
);
