"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { translationRoomService } from "@/services/translation-room.service";
import type { UpdateSeriesRequest } from "@/types/translationRoom";

const SERIES_KEY = ["translationRoomSeries"] as const;

export const seriesKey = (seriesId: string) => [...SERIES_KEY, seriesId] as const;

/** WT-327: the booking, its rule, and the occurrences this viewer may see. */
export function useSeries(seriesId: string) {
  return useQuery({
    queryKey: seriesKey(seriesId),
    queryFn: () => translationRoomService.getSeries(seriesId),
    enabled: Boolean(seriesId),
  });
}

/**
 * Edits the booking and every occurrence still ahead of it.
 *
 * Invalidates the meetings list as well as the series: the edit rewrote real rooms, so a list
 * still showing the old title is showing rooms that no longer have it.
 */
export function useUpdateSeries(seriesId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSeriesRequest) =>
      translationRoomService.updateSeries(seriesId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seriesKey(seriesId) });
      queryClient.invalidateQueries({ queryKey: ["translationRooms"] });
    },
  });
}

// Cancelling is deliberately NOT re-implemented here. `useCancelTranslationRoomSeries` (stop the
// whole booking) and `useCancelTranslationRoom` (skip one occurrence) already exist in
// use-translationRooms.ts, and a second pair would be two places to keep the cache invalidation
// right. This file adds only what the booking view genuinely needs that they do not cover.
