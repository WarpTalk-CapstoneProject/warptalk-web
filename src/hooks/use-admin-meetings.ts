"use client";

import { useQuery } from "@tanstack/react-query";

import { adminMeetingService } from "@/services/admin-meeting.service";

export const ADMIN_MEETING_KEYS = {
  counts: ["admin-meetings", "counts"] as const,
};

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
