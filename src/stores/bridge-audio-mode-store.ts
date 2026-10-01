import { create } from "zustand";

import type { BridgeAudioMode } from "../lib/meeting/bridge-audio-mode.ts";

/**
 * Text-only bridge: what the SERVER last told this window about this user's audio mode in each
 * bridge room — the claim's `audioMode`, or a switch this window made (PUT .../bridge/audio-mode).
 * Read by the meeting session through `resolveBridgeAudioMode`, ahead of the participant row's
 * `isBridgeTextOnly`, which only catches up on the next participants poll.
 *
 * Not persisted, like useBridgeCapturerStore: a reload claims again, and the claim answers the mode
 * in force.
 */
type BridgeAudioModeState = {
  byRoomId: Record<string, BridgeAudioMode>;
  setMode: (roomId: string, mode: BridgeAudioMode) => void;
  /** Sign-out / sign-in (lib/auth/session-scoped-state): a mode belongs to one account. */
  reset: () => void;
};

export const useBridgeAudioModeStore = create<BridgeAudioModeState>()((set) => ({
  byRoomId: {},
  reset: () => set({ byRoomId: {} }),
  setMode: (roomId, mode) =>
    set((state) =>
      state.byRoomId[roomId] === mode ? state : { byRoomId: { ...state.byRoomId, [roomId]: mode } },
    ),
}));
