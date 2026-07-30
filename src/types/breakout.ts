export interface BreakoutGroupRequest {
  label: string;
  userIds: string[];
}

export interface CreateBreakoutsRequest {
  groups: BreakoutGroupRequest[];
  durationSeconds?: number | null;
}

export interface BreakoutSessionDto {
  id: string;
  label: string;
  providerRoomName: string;
  userIds: string[];
}

export interface CreateBreakoutsResponse {
  sessions: BreakoutSessionDto[];
  durationSeconds?: number | null;
  startedAt: string;
}

/** Payload of TranslationRoomHub's "BreakoutsStarted" event — one entry per assigned user,
 * broadcast to EVERYONE in the room. Carries no LiveKit token (see breakouts.service.ts). */
export interface BreakoutAssignmentRelay {
  userId: string;
  sessionId: string;
  label: string;
}

/** Response of GET .../breakouts/my-assignment — the caller's own fresh join info. */
export interface BreakoutJoinInfoDto {
  sessionId: string;
  label: string;
  providerRoomName: string;
  token: string;
  participantIdentity: string;
  durationSeconds?: number | null;
  startedAt?: string | null;
}
