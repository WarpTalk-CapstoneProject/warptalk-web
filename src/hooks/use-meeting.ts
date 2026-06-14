"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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

export function useMeetingChat(roomId: string) {
  return useQuery({
    queryKey: ["meeting-chat", roomId],
    queryFn: async () => {
      const { data } = await meetingService.chatList(roomId);
      return data;
    },
    enabled: !!roomId,
  });
}

export function useSendMeetingChat() {
  return useMutation({
    mutationFn: async ({ roomId, data }: { roomId: string; data: { originalText: string; originalLanguage: string; translationEnabled: boolean; mentions?: import("@/types/realtime").ChatMentionDto[] } }) => {
      const response = await meetingService.chatSend(roomId, data);
      return response.data;
    },
  });
}

export function useRejectMeetingParticipant(roomId: string) {
  return useMutation({
    mutationFn: async (participantId: string) => {
      const { data } = await meetingService.rejectParticipant(roomId, participantId);
      return data;
    },
  });
}

export function useTransferMeetingHost(roomId: string) {
  return useMutation({
    mutationFn: async (newHostId: string) => {
      const { data } = await meetingService.transferHost(roomId, newHostId);
      return data;
    },
  });
}

export function useKickMeetingParticipant(roomId: string) {
  return useMutation({
    mutationFn: async (participantId: string) => {
      const { data } = await meetingService.kickParticipant(roomId, participantId);
      return data;
    },
  });
}

export function useEndMeetingForAll(roomId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await meetingService.endMeeting(roomId);
      return data;
    },
  });
}
