import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { JoinMeetingResponseDto, TriggerAiRequest } from "@/types/meeting";

export const meetingService = {
  join(translationRoomId: string) {
    return apiClient.post<JoinMeetingResponseDto>(API.meetings.join(translationRoomId));
  },

  triggerAi(translationRoomId: string, data: TriggerAiRequest) {
    return apiClient.post<{ message: string }>(API.meetings.triggerAi(translationRoomId), data);
  },
};
