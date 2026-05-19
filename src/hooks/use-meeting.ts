"use client";

import { useMutation } from "@tanstack/react-query";
import { meetingService } from "@/services/meeting.service";
import type { TriggerAiRequest } from "@/types/meeting";

export function useJoinMeeting() {
  return useMutation({
    mutationFn: async (translationRoomId: string) => {
      const { data } = await meetingService.join(translationRoomId);
      return data;
    },
  });
}

export function useTriggerMeetingAi(translationRoomId: string) {
  return useMutation({
    mutationFn: async (data: TriggerAiRequest) => {
      const response = await meetingService.triggerAi(translationRoomId, data);
      return response.data;
    },
  });
}
