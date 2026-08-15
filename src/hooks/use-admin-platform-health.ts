"use client";

import { useQuery } from "@tanstack/react-query";

import { adminPlatformHealthService } from "@/services/admin-platform-health.service";

export const ADMIN_PLATFORM_HEALTH_KEY = ["admin", "platform-health"] as const;

/**
 * Polled every 30s. Health is the one screen in the portal whose whole value is being current —
 * a stale copy of "everything is fine" is worse than an empty page, because it is believed.
 */
export function useAdminPlatformHealth() {
  return useQuery({
    queryKey: ADMIN_PLATFORM_HEALTH_KEY,
    queryFn: () => adminPlatformHealthService.get(),
    refetchInterval: 30_000,
    // Keeps the previous frame on screen while the next poll is in flight, so the page does not
    // flash a skeleton over itself twice a minute.
    placeholderData: (previous) => previous,
  });
}
