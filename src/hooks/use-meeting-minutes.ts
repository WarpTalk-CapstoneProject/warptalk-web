"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { meetingMinutesService } from "@/services/meeting-minutes.service";
import type { MeetingMinutesDto } from "@/types/meetingMinutes";

export const MEETING_MINUTES_KEY = (roomId: string) => ["meeting-minutes", roomId] as const;

/**
 * The document exists and somebody can read it — just not this viewer (WT-651).
 *
 * Carried as DATA rather than as a query error, for the reason `summary-absence.ts` gives for the
 * Summary tab: "you may not see this" is an answer about permission, not a failure. As an error it
 * would be retried three times for a decision that will not change, and the panel would render a
 * broken-page state over a setting the host owns.
 */
export const MINUTES_WITHHELD = "withheld" as const;

export type MeetingMinutesRead = MeetingMinutesDto | null | typeof MINUTES_WITHHELD;

/**
 * The room's minutes: the document, null when none has been drawn up, or MINUTES_WITHHELD.
 *
 * A 404 is resolved to null rather than thrown. "This meeting has no minutes yet" is the normal
 * state of every meeting until somebody presses the button, and rendering it as a failed query
 * would put an error where an invitation belongs.
 *
 * A 403 is the draft gate (#344): an unsigned biên bản is readable only by the people who can act
 * on it — the host, a workspace Owner/Admin — and signing is what publishes it. Everybody else is
 * refused until then, and told which of the two it is.
 */
export function useMeetingMinutes(roomId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: MEETING_MINUTES_KEY(roomId ?? ""),
    enabled: Boolean(roomId) && enabled,
    queryFn: async (): Promise<MeetingMinutesRead> => {
      try {
        const response = await meetingMinutesService.getByRoom(roomId!);
        return response.data;
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) return null;
        if (isAxiosError(error) && error.response?.status === 403) return MINUTES_WITHHELD;
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
