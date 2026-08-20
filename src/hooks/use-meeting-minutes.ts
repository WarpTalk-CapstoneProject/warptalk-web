"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { meetingMinutesService } from "@/services/meeting-minutes.service";
import type { MeetingMinutesDto } from "@/types/meetingMinutes";

export const MEETING_MINUTES_KEY = (roomId: string) => ["meeting-minutes", roomId] as const;

/**
 * The room's minutes, or null when none has been drawn up.
 *
 * A 404 is resolved to null rather than thrown. "This meeting has no minutes yet" is the normal
 * state of every meeting until somebody presses the button, and rendering it as a failed query
 * would put an error where an invitation belongs.
 */
export function useMeetingMinutes(roomId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: MEETING_MINUTES_KEY(roomId ?? ""),
    enabled: Boolean(roomId) && enabled,
    queryFn: async (): Promise<MeetingMinutesDto | null> => {
      try {
        const response = await meetingMinutesService.getByRoom(roomId!);
        return response.data;
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
  });
}

/**
 * Every write to the minutes, sharing one cache entry.
 *
 * All of them return the whole document, so each writes the response straight into the cache
 * rather than invalidating: the panel is a form, and a refetch round trip after "sign" would
 * blank the fields the secretary is looking at.
 */
export function useMeetingMinutesActions(roomId: string | undefined) {
  const queryClient = useQueryClient();

  const apply = (minutes: MeetingMinutesDto) => {
    queryClient.setQueryData(MEETING_MINUTES_KEY(roomId ?? ""), minutes);
    return minutes;
  };

  const createDraft = useMutation({
    mutationFn: async () => (await meetingMinutesService.createDraft(roomId!)).data,
    onSuccess: apply,
  });

  const save = useMutation({
    mutationFn: async ({ minutesId, content }: { minutesId: string; content: string }) =>
      (await meetingMinutesService.updateContent(roomId!, minutesId, content)).data,
    onSuccess: apply,
  });

  const sign = useMutation({
    mutationFn: async (minutesId: string) =>
      (await meetingMinutesService.sign(roomId!, minutesId)).data,
    onSuccess: apply,
  });

  const approve = useMutation({
    mutationFn: async (minutesId: string) =>
      (await meetingMinutesService.approve(roomId!, minutesId)).data,
    onSuccess: apply,
  });

  const revise = useMutation({
    mutationFn: async (minutesId: string) =>
      (await meetingMinutesService.revise(roomId!, minutesId)).data,
    onSuccess: apply,
  });

  return { createDraft, save, sign, approve, revise };
}
