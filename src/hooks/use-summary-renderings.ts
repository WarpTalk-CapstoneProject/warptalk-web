"use client";

import { useQuery } from "@tanstack/react-query";

import { translationRoomService } from "@/services/translation-room.service";

export const SUMMARY_RENDERINGS_KEY = (roomId: string) => ["summary-renderings", roomId] as const;

/**
 * WT-705 — which (template, language) pairs this room's summary already exists in.
 *
 * Existing renderings are READ, never re-filtered by the workspace's current languages: a summary
 * written in French stays readable after the workspace drops French. The picker uses this list to
 * say which choices are instant and which would have to be written first.
 */
export function useSummaryRenderings(roomId?: string) {
  return useQuery({
    queryKey: SUMMARY_RENDERINGS_KEY(roomId ?? ""),
    queryFn: async () => {
      const { data } = await translationRoomService.getSummaryRenderings(roomId!);
      return data;
    },
    enabled: !!roomId,
  });
}
