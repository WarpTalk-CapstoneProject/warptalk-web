export interface JoinMeetingResponseDto {
  token: string;
  providerRoomName: string;
  participantIdentity: string;
  isWaitingRoom?: boolean;
}

export interface TriggerAiRequest {
  participantIdentity: string;
}
