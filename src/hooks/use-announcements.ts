"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { announcementService } from "@/services/announcement.service";
import type { ViewerAnnouncementDto } from "@/types/admin-cms";

export const ANNOUNCEMENT_KEYS = {
  active: ["announcements", "active"] as const,
};

/**
 * Live announcements for the signed-in user. Refreshed every five minutes so a scheduled one
 * appears without a reload; `retry: false` because a banner is never worth a retry storm (the
 * notification route shares the inbox rate limit).
 */
export function useActiveAnnouncements(enabled: boolean) {
  return useQuery({
    queryKey: ANNOUNCEMENT_KEYS.active,
    queryFn: () => announcementService.active(),
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Optimistic: the banner closes at once, and a failed dismissal only brings it back next load. */
export function useDismissAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => announcementService.dismiss(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ANNOUNCEMENT_KEYS.active });
      queryClient.setQueryData<ViewerAnnouncementDto[]>(ANNOUNCEMENT_KEYS.active, (current) =>
        (current ?? []).filter((announcement) => announcement.id !== id),
      );
    },
  });
}
