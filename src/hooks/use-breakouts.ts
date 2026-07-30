"use client";

import { useMutation } from "@tanstack/react-query";
import { breakoutsService } from "@/services/breakouts.service";
import type { CreateBreakoutsRequest } from "@/types/breakout";

export function useStartBreakouts(roomId: string) {
  return useMutation({
    mutationFn: async (data: CreateBreakoutsRequest) => {
      const { data: response } = await breakoutsService.start(roomId, data);
      return response;
    },
  });
}

export function useEndBreakouts(roomId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await breakoutsService.end(roomId);
      return data;
    },
  });
}

/** Fetches a fresh join token for the caller's own current breakout assignment — called from
 * room/[id]/page.tsx's BreakoutsStarted handler, not from a component (no useQuery — this is a
 * one-shot mint, not cached/polled data). */
export async function fetchMyBreakoutAssignment(roomId: string) {
  const { data } = await breakoutsService.myAssignment(roomId);
  return data;
}
