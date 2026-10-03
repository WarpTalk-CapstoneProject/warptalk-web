import { create } from "zustand";

import type { BridgeRole } from "@/lib/meeting/bridge-capturer";

/**
 * W4b: what the SERVER last told this window about its role in each bridge room — the claim, a
 * heartbeat that lost the lease, a takeover. Read by the meeting session (useBridgeCapturerLease),
 * written by the claim in the app shell (useBridgeAutoRoom) and by the lease hook itself.
 *
 * Not persisted, on purpose. A reload claims again (the claim is idempotent and re-offers a stale
 * lease); a role remembered across a reload could be one somebody else has since taken over, and
 * the room record (`bridgeCapturerUserId`) answers until the claim does.
 */
export type BridgeCapturerEntry = {
  role: BridgeRole;
  heartbeatIntervalSeconds: number;
  leaseSeconds: number;
};

type BridgeCapturerState = {
  byRoomId: Record<string, BridgeCapturerEntry>;
  setEntry: (roomId: string, entry: BridgeCapturerEntry) => void;
  setRole: (roomId: string, role: BridgeRole) => void;
  /** Sign-out / sign-in (lib/auth/session-scoped-state): a role belongs to one account. */
  reset: () => void;
};

export const useBridgeCapturerStore = create<BridgeCapturerState>()((set) => ({
  byRoomId: {},
  reset: () => set({ byRoomId: {} }),
  setEntry: (roomId, entry) =>
    set((state) => ({ byRoomId: { ...state.byRoomId, [roomId]: entry } })),
  setRole: (roomId, role) =>
    set((state) => {
      const previous = state.byRoomId[roomId];
      if (previous?.role === role) return state;
      return {
        byRoomId: {
          ...state.byRoomId,
          [roomId]: {
            heartbeatIntervalSeconds: previous?.heartbeatIntervalSeconds ?? 15,
            leaseSeconds: previous?.leaseSeconds ?? 45,
            role,
          },
        },
      };
    }),
}));
