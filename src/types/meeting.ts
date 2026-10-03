export interface JoinMeetingResponseDto {
  token: string;
  providerRoomName: string;
  participantIdentity: string;
  activeHostId?: string | null;
  isWaitingRoom?: boolean;
  /** WT-04: room's mute-on-entry setting — frontend defaults the local mic to muted on first mount when true. */
  muteOnEntry?: boolean;
  /**
   * WT-282 / WT-935: the room is locked right now. Optional because an older backend does not send
   * it — absent means "not told", never "unlocked" (see lib/meeting/join-host-state).
   */
  locked?: boolean;
  /**
   * WT-283 / WT-935: the room is being recorded right now (it has an active egress). Optional for
   * the same reason as `locked`: absent means "not told", never "not recording".
   */
  recording?: boolean;
}

export interface RecordingStateDto {
  recording: boolean;
  egressId?: string | null;
}

export interface TriggerAiRequest {
  participantIdentity: string;
}

export interface MeetingHistoryItemDto {
  id: string;
  title?: string;
  translationRoomCode?: string;
  endedAt?: string;
  createdAt: string;
  durationSeconds?: number;
  participantCount: number;
  languageMode?: string;
  status: string;
  summary?: string;
}

export interface MeetingHistoryListResponseDto {
  items: MeetingHistoryItemDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface MeetingMessageDto {
  id: string;
  createdAt: string;
  senderName?: string;
  originalText: string;
  translatedText?: string;
}

export interface MeetingRoomDetailDto {
  id: string;
  title?: string;
  recentMessages?: MeetingMessageDto[];
}

/**
 * WT-525. The stand-in seat's LiveKit credentials for an EXTERNAL_BRIDGE room.
 *
 * `participantIdentity` comes from the server rather than being spelled here on purpose: the AI
 * pipeline routes on that exact string, and a client-side copy would be a second definition of
 * the identity, free to drift from the one the room was seeded with.
 */
export interface BridgeTokenDto {
  token: string;
  providerRoomName: string;
  participantIdentity: string;
}
