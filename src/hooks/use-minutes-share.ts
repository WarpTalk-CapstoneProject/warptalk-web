"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { meetingMinutesService } from "@/services/meeting-minutes.service";
import type { MinutesShare, MinutesShareMode } from "@/types/minutesShare";

export const MINUTES_SHARE_KEY = (roomId: string) => ["minutes-share", roomId] as const;

/**
 * The share dialog's state.
 *
 * Deliberately NOT fetched with the minutes: asking for it creates the link, and a link should
 * come into being when somebody opens the share dialog, not when a page renders. `enabled` is how
 * the caller says the dialog is open.
 */
export function useMinutesShare(roomId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: MINUTES_SHARE_KEY(roomId ?? ""),
    enabled: Boolean(roomId) && enabled,
    queryFn: async (): Promise<MinutesShare> =>
      (await meetingMinutesService.getShare(roomId!)).data,
  });
}

/**
 * Every change to who may open the document, sharing one cache entry.
 *
 * All of them return the whole sharing state, so each writes the response into the cache instead
 * of invalidating: the dialog is a form, and a refetch round trip would blank the list of people
 * while somebody is typing the next address into it.
 */
export function useMinutesShareActions(roomId: string | undefined) {
  const queryClient = useQueryClient();

  const apply = (share: MinutesShare) => {
    queryClient.setQueryData(MINUTES_SHARE_KEY(roomId ?? ""), share);
    return share;
  };

  const setMode = useMutation({
    mutationFn: async (accessMode: MinutesShareMode) =>
      (await meetingMinutesService.updateShare(roomId!, { accessMode })).data,
    onSuccess: apply,
  });

  const setAllowDownload = useMutation({
    mutationFn: async (allowDownload: boolean) =>
      (await meetingMinutesService.updateShare(roomId!, { allowDownload })).data,
    onSuccess: apply,
  });

  const revoke = useMutation({
    mutationFn: async () => (await meetingMinutesService.revokeShare(roomId!)).data,
    onSuccess: apply,
  });

  const addPerson = useMutation({
    mutationFn: async (email: string) =>
      (await meetingMinutesService.addSharePerson(roomId!, email)).data,
    onSuccess: apply,
  });

  const removePerson = useMutation({
    mutationFn: async (email: string) =>
      (await meetingMinutesService.removeSharePerson(roomId!, email)).data,
    onSuccess: apply,
  });

  return { setMode, setAllowDownload, revoke, addPerson, removePerson };
}
