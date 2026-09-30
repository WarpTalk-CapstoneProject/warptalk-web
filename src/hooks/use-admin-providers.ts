"use client";

import { useQuery } from "@tanstack/react-query";

import { adminProvidersService, type ProviderRangeQuery } from "@/services/admin-providers.service";
import type { ProviderBreakdownBy } from "@/types/admin-providers";

const ROOT = ["admin", "providers"] as const;

/** Polled every 60s: the status chips and the live success rate are the part worth being current. */
export function useAdminProviders(tz: string) {
  return useQuery({
    queryKey: [...ROOT, "overview", tz],
    queryFn: () => adminProvidersService.overview(tz),
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useAdminProviderSeries(key: string, range: ProviderRangeQuery | null, granularity: "day" | "hour") {
  return useQuery({
    queryKey: [...ROOT, "series", key, range, granularity],
    queryFn: () => adminProvidersService.series(key, range!, granularity),
    enabled: range !== null,
    placeholderData: (previous) => previous,
  });
}

export function useAdminProviderBreakdown(key: string, range: ProviderRangeQuery | null, by: ProviderBreakdownBy, enabled = true) {
  return useQuery({
    queryKey: [...ROOT, "breakdown", key, range, by],
    queryFn: () => adminProvidersService.breakdown(key, range!, by),
    enabled: enabled && range !== null,
    placeholderData: (previous) => previous,
  });
}

export function useAdminProviderUptime(key: string, tz: string) {
  return useQuery({
    queryKey: [...ROOT, "uptime", key, tz],
    queryFn: () => adminProvidersService.uptime(key, tz),
    refetchInterval: 5 * 60_000,
  });
}
