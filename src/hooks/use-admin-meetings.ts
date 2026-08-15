"use client";

import { useQuery } from "@tanstack/react-query";

import { adminMeetingService } from "@/services/admin-meeting.service";
import type { AdminMeetingDirectoryQuery } from "@/types/admin-meeting";

export const ADMIN_MEETING_KEYS = {
  directory: (query: AdminMeetingDirectoryQuery) =>
    ["admin-meetings", "directory", query] as const,
  counts: ["admin-meetings", "counts"] as const,
};

export function useAdminMeetingDirectory(query: AdminMeetingDirectoryQuery) {
  return useQuery({
    queryKey: ADMIN_MEETING_KEYS.directory(query),
    queryFn: () => adminMeetingService.getDirectory(query),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

/**
 * Polled, unlike every other admin query. "How many meetings are running right now" is the one
 * figure on this portal that is worthless if it is a minute old.
 */
export function useAdminMeetingCounts() {
  return useQuery({
    queryKey: ADMIN_MEETING_KEYS.counts,
    queryFn: () => adminMeetingService.getCounts(),
    refetchInterval: 30_000,
  });
}
