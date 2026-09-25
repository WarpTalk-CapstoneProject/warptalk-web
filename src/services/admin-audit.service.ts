import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminAuditLogEntryDto,
  AdminAuditLogFacets,
  AdminAuditLogPage,
  AdminAuditLogQuery,
} from "@/types/admin-audit";

/** The platform audit log. Append-only by construction — reads and an export, nothing else. */
export const adminAuditService = {
  query: async (query: AdminAuditLogQuery): Promise<AdminAuditLogPage> => {
    const { data } = await apiClient.get<AdminAuditLogPage>(API.adminAuditLog.base, { params: query });
    return data;
  },

  get: async (id: string): Promise<AdminAuditLogEntryDto> => {
    const { data } = await apiClient.get<AdminAuditLogEntryDto>(API.adminAuditLog.entry(id));
    return data;
  },

  facets: async (): Promise<AdminAuditLogFacets> => {
    const { data } = await apiClient.get<AdminAuditLogFacets>(API.adminAuditLog.facets);
    return data;
  },

  /**
   * The filtered log as CSV (no cursor: the server walks every page, up to 10,000 rows). The
   * export is itself recorded in the log before the file is returned.
   */
  exportCsv: async (
    query: Omit<AdminAuditLogQuery, "cursor" | "limit">,
  ): Promise<{ blob: Blob; fileName: string; rows: number; truncated: boolean }> => {
    const response = await apiClient.get<Blob>(API.adminAuditLog.export, {
      params: query,
      responseType: "blob",
    });
    const disposition = String(response.headers["content-disposition"] ?? "");
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    return {
      blob: response.data,
      fileName: match ? decodeURIComponent(match[1]) : "warptalk-audit-log.csv",
      rows: Number(response.headers["x-audit-export-rows"] ?? 0),
      truncated: String(response.headers["x-audit-export-truncated"] ?? "") === "true",
    };
  },
};
