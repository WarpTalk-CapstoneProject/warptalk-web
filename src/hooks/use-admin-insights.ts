"use client";

import { useQuery } from "@tanstack/react-query";

import { adminInsightsService } from "@/services/admin-insights.service";
import type { InsightsQuery } from "@/types/admin-insights";

export const ADMIN_INSIGHTS_KEYS = {
  all: ["admin", "insights"] as const,
  billing: (query: InsightsQuery) => ["admin", "insights", "billing", query] as const,
  billingSnapshot: (tz: string) => ["admin", "insights", "billing-snapshot", tz] as const,
  users: (query: InsightsQuery) => ["admin", "insights", "users", query] as const,
  workspaces: (query: InsightsQuery) => ["admin", "insights", "workspaces", query] as const,
  meetings: (query: InsightsQuery) => ["admin", "insights", "meetings", query] as const,
};

/**
 * The same cadence the old Overview polled at. TanStack pauses interval refetches while the tab
 * is hidden (`refetchIntervalInBackground` defaults to false), so a forgotten tab costs nothing.
 */
export const ADMIN_INSIGHTS_REFRESH_MS = 60_000;

/**
 * No local `retry` on any of these. The global policy already refuses every 4xx, and a 404 is the
 * expected answer from a backend that predates an endpoint — retrying it only delays the moment
 * the card can say "not available yet".
 */
const periodOptions = {
  staleTime: 30_000,
  refetchInterval: ADMIN_INSIGHTS_REFRESH_MS,
};

export function useAdminBillingInsights(query: InsightsQuery) {
  return useQuery({
    queryKey: ADMIN_INSIGHTS_KEYS.billing(query),
    queryFn: () => adminInsightsService.getBilling(query),
    ...periodOptions,
    // Keeps the previous period's figures on screen while the next one loads, so switching the
    // period bar does not flash every card back to a dash.
    placeholderData: (previous) => previous,
  });
}

/** `tz`: the IANA zone whose today, yesterday and month the snapshot reports. */
export function useAdminBillingSnapshot(tz: string) {
  return useQuery({
    queryKey: ADMIN_INSIGHTS_KEYS.billingSnapshot(tz),
    queryFn: () => adminInsightsService.getBillingSnapshot(tz),
    refetchInterval: ADMIN_INSIGHTS_REFRESH_MS,
    placeholderData: (previous) => previous,
  });
}

export function useAdminUsersInsights(query: InsightsQuery) {
  return useQuery({
    queryKey: ADMIN_INSIGHTS_KEYS.users(query),
    queryFn: () => adminInsightsService.getUsers(query),
    ...periodOptions,
    // Keeps the previous period's figures on screen while the next one loads, so switching the
    // period bar does not flash every card back to a dash.
    placeholderData: (previous) => previous,
  });
}

export function useAdminWorkspacesInsights(query: InsightsQuery) {
  return useQuery({
    queryKey: ADMIN_INSIGHTS_KEYS.workspaces(query),
    queryFn: () => adminInsightsService.getWorkspaces(query),
    ...periodOptions,
    // Keeps the previous period's figures on screen while the next one loads, so switching the
    // period bar does not flash every card back to a dash.
    placeholderData: (previous) => previous,
  });
}

export function useAdminMeetingsInsights(query: InsightsQuery) {
  return useQuery({
    queryKey: ADMIN_INSIGHTS_KEYS.meetings(query),
    queryFn: () => adminInsightsService.getMeetings(query),
    ...periodOptions,
    // Keeps the previous period's figures on screen while the next one loads, so switching the
    // period bar does not flash every card back to a dash.
    placeholderData: (previous) => previous,
  });
}
