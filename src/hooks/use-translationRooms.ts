"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translationRoomService } from "@/services/translationRoom.service";
import type {
  CreateTranslationRoomRequest,
  JoinTranslationRoomByCodeRequest,
  JoinTranslationRoomRequest,
  SubmitTranslationRoomFeedbackRequest,
  TranslationRoomFeedbackDto,
  TranslationRoomFeedbackStateDto,
  TranslationRoomDto,
} from "@/types/translationRoom";

const MEETING_KEY = ["translationRooms"] as const;
const ROOM_FEEDBACK_KEY = ["translationRoomFeedback"] as const;

/** List translation rooms for the Module 1 demo flow.
 * WT-92/WT-106 backend gap: service currently returns a typed mock plus local demo cache until GET /translationRooms exists.
 */
export function useTranslationRooms() {
  return useQuery({
    queryKey: MEETING_KEY,
    queryFn: async () => {
      const { data } = await translationRoomService.list();
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

/** Join translationRoom mutation */
export function useJoinTranslationRoom() {
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: JoinTranslationRoomRequest;
    }) => {
      const { data: participant } = await translationRoomService.join(id, data);
      return participant;
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

/** Start translationRoom mutation.
 * WT-96 backend gap: service currently uses a typed mock adapter until POST /start exists.
 */
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

/** Cancel translationRoom mutation.
 * WT-96 backend gap: service currently uses a typed mock adapter until POST /cancel exists.
 */
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

/** Fetch the current user's feedback submission state for one ended room.
 * WT-98 backend gap: service uses a typed mock adapter until feedback endpoints exist.
 */
export function useTranslationRoomFeedbackState(roomId: string, userId: string) {
  return useQuery({
    queryKey: [...ROOM_FEEDBACK_KEY, roomId, userId],
    queryFn: async () => {
      const { data } = await translationRoomService.getFeedbackState(roomId, userId);
      return data;
    },
    enabled: Boolean(roomId && userId),
  });
}

/** Submit post-room feedback for the current user.
 * WT-98 backend gap: service uses a typed mock adapter until POST /feedback exists.
 */
export function useSubmitTranslationRoomFeedback(roomId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SubmitTranslationRoomFeedbackRequest) => {
      const { data: feedback } = await translationRoomService.submitFeedback(roomId, userId, data);
      return feedback;
    },
    onSuccess: (feedback) => {
      queryClient.setQueryData<TranslationRoomFeedbackStateDto>(
        [...ROOM_FEEDBACK_KEY, roomId, userId],
        {
          hasSubmitted: true,
          feedback,
        }
      );
      queryClient.setQueryData<TranslationRoomFeedbackDto>(
        [...ROOM_FEEDBACK_KEY, roomId, userId, "submission"],
        feedback
      );
    },
  });
}
