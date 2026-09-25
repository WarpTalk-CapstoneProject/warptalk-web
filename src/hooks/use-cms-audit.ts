"use client";

import { useQuery } from "@tanstack/react-query";

import { cmsAuditService } from "@/services/cms-audit.service";

export const CMS_AUDIT_KEYS = {
  all: ["cms-audit"] as const,
  entity: (entityType: string, entityId: string) => ["cms-audit", entityType, entityId] as const,
};

/** The audit trail of one CMS item, for its History tab. */
export function useCmsAuditTrail(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: CMS_AUDIT_KEYS.entity(entityType, entityId ?? ""),
    queryFn: () => cmsAuditService.forEntity(entityType, entityId!),
    enabled: Boolean(entityId),
    staleTime: 15_000,
    retry: false,
  });
}
