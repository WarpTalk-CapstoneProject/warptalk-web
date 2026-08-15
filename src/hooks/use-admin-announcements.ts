"use client";

import { useQuery } from "@tanstack/react-query";

import { adminAnnouncementService } from "@/services/admin-announcement.service";
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
