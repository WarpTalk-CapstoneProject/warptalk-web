import { create } from "zustand";
import type { PresenceState } from "@/types/presence";

interface PresenceStoreState {
  /** userId -> state. A user absent from this map has not been resolved yet, which is not the
   * same as being offline — components render nothing rather than a wrong dot. */
  states: Record<string, PresenceState>;

  setState: (userId: string, state: PresenceState) => void;
  setMany: (states: Record<string, PresenceState>) => void;
  /** Dropped on workspace switch: presence is scoped to the workspace you are looking at. */
  clear: () => void;
}

export const usePresenceStore = create<PresenceStoreState>()((set) => ({
  states: {},

  setState: (userId, state) =>
    set((current) => ({ states: { ...current.states, [userId]: state } })),

  setMany: (states) =>
    set((current) => ({ states: { ...current.states, ...states } })),

  clear: () => set({ states: {} }),
}));
