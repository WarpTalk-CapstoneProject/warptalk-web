"use client";

import { useQuery } from "@tanstack/react-query";

import { adminAuditService } from "@/services/admin-audit.service";
import type { AdminAuditLogQuery } from "@/types/admin-audit";

export const ADMIN_AUDIT_KEYS = {
  query: (query: AdminAuditLogQuery) => ["admin-audit", query] as const,
};

export function useAdminAuditLog(query: AdminAuditLogQuery) {
  return useQuery({
    queryKey: ADMIN_AUDIT_KEYS.query(query),
    queryFn: () => adminAuditService.query(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}
