import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminAnnouncementCmsDto,
  AdminAnnouncementCmsPageDto,
  AdminAnnouncementCmsQuery,
  AnnouncementAnalyticsDto,
  AnnouncementAssetDto,
  AnnouncementBulkAction,
  BulkResultDto,
  PublishAnnouncementRequest,
  UpsertAnnouncementRequest,
} from "@/types/admin-cms";

/** The announcements CMS. Distinct from `adminAnnouncementService`, the one-shot inbox broadcast. */
export const adminAnnouncementCmsService = {
  list: async (query: AdminAnnouncementCmsQuery): Promise<AdminAnnouncementCmsPageDto> =>
    (await apiClient.get<AdminAnnouncementCmsPageDto>(API.adminAnnouncementCms.base, { params: query })).data,

  get: async (id: string): Promise<AdminAnnouncementCmsDto> =>
    (await apiClient.get<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.detail(id))).data,

  create: async (request: UpsertAnnouncementRequest): Promise<AdminAnnouncementCmsDto> =>
    (await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.base, request)).data,

  update: async (id: string, request: UpsertAnnouncementRequest): Promise<AdminAnnouncementCmsDto> =>
    (await apiClient.put<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.detail(id), request)).data,

  publish: async (id: string, request: PublishAnnouncementRequest): Promise<AdminAnnouncementCmsDto> =>
    (await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.publish(id), request)).data,

  unpublish: async (id: string): Promise<AdminAnnouncementCmsDto> =>
    (await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.unpublish(id))).data,

  archive: async (id: string): Promise<AdminAnnouncementCmsDto> =>
    (await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.archive(id))).data,

  duplicate: async (id: string): Promise<AdminAnnouncementCmsDto> =>
    (await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.duplicate(id))).data,

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(API.adminAnnouncementCms.detail(id));
  },

  analytics: async (id: string, days: number): Promise<AnnouncementAnalyticsDto> =>
    (await apiClient.get<AnnouncementAnalyticsDto>(API.adminAnnouncementCms.analytics(id), { params: { days } })).data,

  bulk: async (action: AnnouncementBulkAction, ids: string[]): Promise<BulkResultDto> =>
    (await apiClient.post<BulkResultDto>(API.adminAnnouncementCms.bulk, { action, ids })).data,

  uploadAsset: async (file: File): Promise<AnnouncementAssetDto> => {
    const form = new FormData();
    form.append("file", file);
    return (await apiClient.post<AnnouncementAssetDto>(API.adminAnnouncementCms.assets, form)).data;
  },
};
