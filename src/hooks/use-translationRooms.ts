"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translationRoomService } from "@/services/translationRoom.service";
import type {
  CreateTranslationRoomRequest,
  JoinTranslationRoomByCodeRequest,
  JoinTranslationRoomRequest,
  TranslationRoomDto,
} from "@/types/translationRoom";

const MEETING_KEY = ["translationRooms"] as const;

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

/** Start translationRoom mutation. WT-96 uses a typed mock adapter until the backend endpoint exists. */
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

/** Cancel translationRoom mutation. WT-96 uses a typed mock adapter until the backend endpoint exists. */
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
