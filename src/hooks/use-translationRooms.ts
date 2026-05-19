"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translationRoomService } from "@/services/translationRoom.service";
import type {
  CreateTranslationRoomRequest,
  JoinTranslationRoomByCodeRequest,
  SubmitTranslationRoomFeedbackRequest,
  TranslationRoomFeedbackDto,
  TranslationRoomFeedbackStateDto,
  TranslationRoomDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";

const MEETING_KEY = ["translationRooms"] as const;
const ROOM_FEEDBACK_KEY = ["translationRoomFeedback"] as const;

export function useTranslationRooms(params?: {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: [...MEETING_KEY, params],
    queryFn: async () => {
      const { data } = await translationRoomService.list(params);
      return data;
    },
  });
}

/** Fetch a single translationRoom by ID */
export function useTranslationRoom(id: string) {
  return useQuery({
    queryKey: [...MEETING_KEY, id],
    queryFn: async () => {
      const { data } = await translationRoomService.get(id);
      return data;
    },
    enabled: !!id,
  });
}

/** Create translationRoom mutation */
export function useCreateTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTranslationRoomRequest) => {
      const { data: translationRoom } = await translationRoomService.create(data);
      return translationRoom;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

/** Join translationRoom by room code for the web preflight flow */
export function useJoinTranslationRoomByCode() {
  return useMutation({
    mutationFn: async (data: JoinTranslationRoomByCodeRequest) => {
      const { data: joinResult } = await translationRoomService.joinByCode(data);
      return joinResult;
    },
  });
}

export function useStartTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: translationRoom } = await translationRoomService.start(id);
      return translationRoom;
    },
    onSuccess: (translationRoom, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], translationRoom);
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

/** End translationRoom mutation */
export function useEndTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await translationRoomService.end(id);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], (current) =>
        current
          ? {
              ...current,
              status: "ended",
              endedAt: current.endedAt ?? new Date().toISOString(),
            }
          : current
      );
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, id] });
    },
  });
}

export function useCancelTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: translationRoom } = await translationRoomService.cancel(id);
      return translationRoom;
    },
    onSuccess: (translationRoom, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], translationRoom);
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

export function useTranslationRoomParticipants(roomId: string) {
  return useQuery({
    queryKey: [...MEETING_KEY, roomId, "participants"],
    queryFn: async () => {
      const { data } = await translationRoomService.participants(roomId);
      return data;
    },
    enabled: Boolean(roomId),
  });
}

export function useUpdateParticipantAudio(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      participantId,
      isTranslationAudioEnabled,
    }: {
      participantId: string;
      isTranslationAudioEnabled: boolean;
    }) => {
      await translationRoomService.updateParticipantAudio(roomId, participantId, isTranslationAudioEnabled);
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<TranslationRoomParticipantDto[]>([...MEETING_KEY, roomId, "participants"], (current) =>
        current?.map((participant) =>
          participant.id === variables.participantId
            ? { ...participant, isTranslationAudioEnabled: variables.isTranslationAudioEnabled }
            : participant
        )
      );
    },
  });
}

export function useAdmitParticipant(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participantId: string) => {
      await translationRoomService.admitParticipant(roomId, participantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, roomId, "participants"] });
    },
  });
}

export function useKickParticipant(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participantId: string) => {
      await translationRoomService.kickParticipant(roomId, participantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, roomId, "participants"] });
    },
  });
}

export function useLeaveTranslationRoom(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await translationRoomService.leave(roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, roomId, "participants"] });
    },
  });
}

export function useTranslationRoomFeedbackState(roomId: string) {
  return useQuery({
    queryKey: [...ROOM_FEEDBACK_KEY, roomId],
    queryFn: async () => {
      const { data } = await translationRoomService.getFeedbackState(roomId);
      return data;
    },
    enabled: Boolean(roomId),
  });
}

export function useSubmitTranslationRoomFeedback(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SubmitTranslationRoomFeedbackRequest) => {
      const { data: feedback } = await translationRoomService.submitFeedback(roomId, data);
      return feedback;
    },
    onSuccess: (feedback) => {
      queryClient.setQueryData<TranslationRoomFeedbackStateDto>(
        [...ROOM_FEEDBACK_KEY, roomId],
        {
          hasSubmitted: true,
          feedback,
        }
      );
      queryClient.setQueryData<TranslationRoomFeedbackDto>(
        [...ROOM_FEEDBACK_KEY, roomId, "submission"],
        feedback
      );
    },
  });
}
