"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translationRoomService } from "@/services/translationRoom.service";
import type { CreateTranslationRoomRequest, JoinTranslationRoomRequest } from "@/types/translationRoom";

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

/** End translationRoom mutation */
export function useEndTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await translationRoomService.end(id);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, id] });
    },
  });
}
