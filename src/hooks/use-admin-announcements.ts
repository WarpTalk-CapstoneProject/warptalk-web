"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminAnnouncementService } from "@/services/admin-announcement.service";
import type { CreateAdminAnnouncementRequest } from "@/lib/notifications/announcement-draft";
import type { AdminAnnouncementQuery } from "@/types/admin-announcement";

export const ADMIN_ANNOUNCEMENT_KEYS = {
  list: (query: AdminAnnouncementQuery) => ["admin-announcements", query] as const,
};

export function useAdminAnnouncements(query: AdminAnnouncementQuery) {
  return useQuery({
    queryKey: ADMIN_ANNOUNCEMENT_KEYS.list(query),
    queryFn: () => adminAnnouncementService.list(query),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

/**
 * Send one, then reload the list.
 *
 * The row lands with `Status: "Pending"` and turns to Sent or Failed as the delivery consumer
 * works through it, so the invalidation is what puts the send on screen at all — and the status
 * the reader sees a moment later is the delivery's, not the request's.
 *
 * No optimistic update: an announcement that appeared on the list and then had not been sent
 * would be the one kind of lie this screen must not tell.
 */
export function useSendAdminAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateAdminAnnouncementRequest) =>
      adminAnnouncementService.send(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-announcements"] }),
  });
}
