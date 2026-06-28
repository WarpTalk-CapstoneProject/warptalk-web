export interface JoinMeetingResponseDto {
  token: string;
  providerRoomName: string;
  participantIdentity: string;
  isWaitingRoom?: boolean;
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
