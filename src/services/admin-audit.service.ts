import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { AdminAuditLogEntryDto, AdminAuditLogQuery } from "@/types/admin-audit";
import type { AdminPagedResult } from "@/types/admin-workspace";

/** The platform audit log. Append-only by construction — there is nothing here but a read. */
export const adminAuditService = {
  query: async (
    query: AdminAuditLogQuery,
  ): Promise<AdminPagedResult<AdminAuditLogEntryDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminAuditLogEntryDto>>(
      API.adminAuditLog.base,
      { params: query },
    );
    return data;
  },
};
