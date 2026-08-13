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
  /**
   * User id → when that person finished or skipped the tour.
   *
   * KEYED BY USER, AND NOT CLEARED ON SIGN-IN. It used to be one timestamp wiped by `reset()`
   * whenever the signed-in account changed — which is correct for isolation and wrong for the
   * person: signing out and back in wiped their own answer, so the tour ran again on every
   * login. Keying by user is the stronger form of the same guarantee. A new account has no
   * entry and gets its tour; the previous account's answer is still theirs when they return.
   */
  tourSeenAtByUser: Record<string, number>;
  /**
   * Whether the tour is on screen right now. Deliberately NOT persisted — a tour that was open
   * when the tab closed should not reopen days later on a page it no longer describes.
   */
  tourOpen: boolean;

  dismissInviteSuggestion: (workspaceId: string, atMs: number) => void;
  openTour: () => void;
  /** True when this person has already finished or skipped it. */
  hasSeenTour: (userId: string | null | undefined) => boolean;
  /** Ends the tour and records that it has been seen — the same act whether finished or skipped. */
  closeTour: (userId: string | null | undefined, atMs: number) => void;
  /** Show the tour again on the next opportunity — what "restart the tour" does. */
  forgetTour: (userId: string | null | undefined) => void;
  /** Called when the signed-in account changes. */
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      inviteDismissedAt: {},
      tourSeenAtByUser: {},
      tourOpen: false,

      dismissInviteSuggestion: (workspaceId, atMs) =>
        set((state) => ({
          inviteDismissedAt: { ...state.inviteDismissedAt, [workspaceId]: atMs },
        })),

      openTour: () => set({ tourOpen: true }),

      hasSeenTour: (userId) =>
        // No user id yet means the shell has not resolved who this is. Treat that as "seen" so
        // the tour never opens against an account we cannot record the answer against — it
        // would run again on the next load, forever.
        !userId || get().tourSeenAtByUser[userId] != null,

      // Skipping and finishing record the same thing on purpose. Someone who left after two
      // steps has decided they do not want this, and re-offering it on every sign-in would be
      // ignoring an answer they already gave.
      closeTour: (userId, atMs) =>
        set((state) => ({
          tourOpen: false,
          tourSeenAtByUser: userId
            ? { ...state.tourSeenAtByUser, [userId]: atMs }
            : state.tourSeenAtByUser,
        })),

      forgetTour: (userId) =>
        set((state) => {
          if (!userId) return state;
          const next = { ...state.tourSeenAtByUser };
          delete next[userId];
          return { tourSeenAtByUser: next };
        }),

      // Only the ephemeral bit. The per-user records ARE the isolation — clearing them would
      // hand the next sign-in a tour the previous person had already dismissed, and take away
      // the answer they gave. Keying by user is the stronger guarantee, not a weaker one.
      reset: () => set({ tourOpen: false }),
    }),
    {
      name: "warptalk-onboarding",
      // `tourOpen` is window state, not a preference; persisting it would reopen the tour in
      // every new tab until somebody closed it in the right one.
      partialize: (state) => ({
        inviteDismissedAt: state.inviteDismissedAt,
        tourSeenAtByUser: state.tourSeenAtByUser,
      }),
    },
  ),
);
