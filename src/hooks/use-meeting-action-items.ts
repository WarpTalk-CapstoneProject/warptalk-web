"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { meetingActionItemService } from "@/services/meeting-action-item.service";
import type { ActionItemStatus, MeetingActionItemDto } from "@/types/meetingActionItem";

export const ACTION_ITEMS_KEY = (roomId: string) => ["action-items", "room", roomId] as const;

/**
 * The tasks one meeting produced.
 *
 * Rows exist only once the minutes are approved, so an empty list on an unapproved meeting is the
 * correct answer rather than a missing one — the caller renders nothing, not an error.
 */
export function useRoomActionItems(roomId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ACTION_ITEMS_KEY(roomId ?? ""),
    enabled: Boolean(roomId) && enabled,
    queryFn: async (): Promise<MeetingActionItemDto[]> =>
      (await meetingActionItemService.forRoom(roomId!)).data,
  });
}

/**
 * Moving a task between OPEN, DONE and DROPPED.
 *
 * The server answers with the whole row, so the cache is written from the response rather than
 * invalidated: a checkbox that empties the list for a moment while it refetches reads as the task
 * disappearing.
 */
export function useUpdateActionItemStatus(roomId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: ActionItemStatus }) =>
      (await meetingActionItemService.updateStatus(itemId, status)).data,
    onSuccess: (updated) => {
      queryClient.setQueryData<MeetingActionItemDto[]>(
        ACTION_ITEMS_KEY(roomId ?? ""),
        (current) => current?.map((item) => (item.id === updated.id ? updated : item)),
      );
    },
  });
}
