"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { adminAuditService } from "@/services/admin-audit.service";
import type { AdminAuditLogQuery } from "@/types/admin-audit";

export const ADMIN_AUDIT_KEYS = {
  all: ["admin-audit"] as const,
  list: (query: Omit<AdminAuditLogQuery, "cursor">) => ["admin-audit", "list", query] as const,
  entry: (id: string) => ["admin-audit", "entry", id] as const,
  facets: ["admin-audit", "facets"] as const,
};

/** How often live mode asks for new entries. */
export const AUDIT_LIVE_INTERVAL_MS = 15_000;

/**
 * The log, newest first, one cursor page at a time. Live mode re-reads every loaded page on an
 * interval (TanStack refetches an infinite query page by page from the first cursor), so a new
 * entry appears at the top without the reader losing their place further down.
 */
export function useAdminAuditLog(query: Omit<AdminAuditLogQuery, "cursor">, options: { live: boolean }) {
  return useInfiniteQuery({
    queryKey: ADMIN_AUDIT_KEYS.list(query),
    queryFn: ({ pageParam }) => adminAuditService.query({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: options.live ? AUDIT_LIVE_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
}

export function useAdminAuditEntry(id: string | null) {
  return useQuery({
    queryKey: ADMIN_AUDIT_KEYS.entry(id ?? ""),
    queryFn: () => adminAuditService.get(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useAdminAuditFacets() {
  return useQuery({
    queryKey: ADMIN_AUDIT_KEYS.facets,
    queryFn: adminAuditService.facets,
    staleTime: 60_000,
  });
}
