/**
 * What a workspace member is doing right now.
 *
 * Derived by the Gateway from live hub connections — there is no self-set status, so nothing
 * here can go stale the way a manually-chosen "Busy" does.
 */
export type PresenceState = "Offline" | "Online" | "InMeeting";

export interface PresenceChangedEvent {
  userId: string;
  state: PresenceState;
}

export interface PresenceQueryResponse {
  states: Record<string, PresenceState>;
}
