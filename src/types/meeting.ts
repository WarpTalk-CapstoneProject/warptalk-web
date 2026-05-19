export interface JoinMeetingResponseDto {
  token: string;
  providerRoomName: string;
  participantIdentity: string;
}

export interface TriggerAiRequest {
  participantIdentity: string;
}
