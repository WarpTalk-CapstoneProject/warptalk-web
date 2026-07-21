import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { JoinMeetingResponseDto, TriggerAiRequest } from "@/types/meeting";

export const meetingService = {
  join(translationRoomId: string, displayName?: string) {
    return apiClient.post<JoinMeetingResponseDto>(API.meetings.join(translationRoomId), { displayName });
  },

  triggerAi(translationRoomId: string, data: TriggerAiRequest) {
    return apiClient.post<{ message: string }>(API.meetings.triggerAi(translationRoomId), data);
  },

  chatList(roomId: string) {
    return apiClient.get<import("@/types/realtime").ChatMessageDto[]>(API.meetings.chatList(roomId));
  },

  chatSend(roomId: string, data: { originalText: string; originalLanguage: string; translationEnabled: boolean; mentions?: import("@/types/realtime").ChatMentionDto[] }) {
    return apiClient.post<import("@/types/realtime").ChatMessageDto>(API.meetings.chatSend(roomId), data);
  },

  chatTranslate(roomId: string, messageId: string, targetLanguage: string) {
    return apiClient.post<import("@/types/realtime").ChatMessageTranslationDto>(
      API.meetings.chatTranslate(roomId, messageId),
      { targetLanguage }
    );
  },

  chatModerate(roomId: string, messageId: string, reason: string) {
    return apiClient.post<void>(API.meetings.chatModerate(roomId, messageId), { reason });
  },

  rejectParticipant(roomId: string, participantId: string) {
    return apiClient.post<{ message: string }>(API.meetings.rejectParticipant(roomId, participantId));
  },

  transferHost(roomId: string, newHostId: string) {
    return apiClient.post<{ message: string }>(API.meetings.transferHost(roomId, newHostId));
  },

  kickParticipant(roomId: string, participantId: string) {
    return apiClient.post<{ message: string }>(API.meetings.kickParticipant(roomId, participantId));
  },

  endMeeting(roomId: string) {
    return apiClient.post<{ message: string }>(API.meetings.endMeeting(roomId));
  },
};
