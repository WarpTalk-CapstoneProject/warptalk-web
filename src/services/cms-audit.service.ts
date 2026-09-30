import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { CmsAuditEntryDto } from "@/types/admin-cms";

/**
 * The platform audit log, read for one CMS item's History tab. Every CMS write is recorded there
 * by the notification service ([AdminAudited]); this only reads.
 *
 * The newest `limit` entries only: a History tab is for "what happened to this lately", and the
 * full record, with its filters and export, is /admin/audit-log.
 */
export const cmsAuditService = {
  forEntity: async (entityType: string, entityId: string, limit = 50): Promise<CmsAuditEntryDto[]> => {
    const { data } = await apiClient.get<{ items?: CmsAuditEntryDto[] }>(API.adminAuditLog.base, {
      params: { entityType, entityId, limit },
    });
    return data.items ?? [];
  },
};
