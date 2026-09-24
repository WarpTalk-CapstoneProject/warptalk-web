import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminAnnouncementCmsDto,
  AdminAnnouncementCmsPageDto,
  AdminAnnouncementCmsQuery,
  PublishAnnouncementRequest,
  UpsertAnnouncementRequest,
} from "@/types/admin-cms";

/** The announcements CMS. Distinct from `adminAnnouncementService`, the one-shot inbox broadcast. */
export const adminAnnouncementCmsService = {
  list: async (query: AdminAnnouncementCmsQuery): Promise<AdminAnnouncementCmsPageDto> => {
    const { data } = await apiClient.get<AdminAnnouncementCmsPageDto>(API.adminAnnouncementCms.base, {
      params: query,
    });
    return data;
  },

  get: async (id: string): Promise<AdminAnnouncementCmsDto> => {
    const { data } = await apiClient.get<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.detail(id));
    return data;
  },

  create: async (request: UpsertAnnouncementRequest): Promise<AdminAnnouncementCmsDto> => {
    const { data } = await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.base, request);
    return data;
  },

  update: async (id: string, request: UpsertAnnouncementRequest): Promise<AdminAnnouncementCmsDto> => {
    const { data } = await apiClient.put<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.detail(id), request);
    return data;
  },

  publish: async (id: string, request: PublishAnnouncementRequest): Promise<AdminAnnouncementCmsDto> => {
    const { data } = await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.publish(id), request);
    return data;
  },

  unpublish: async (id: string): Promise<AdminAnnouncementCmsDto> => {
    const { data } = await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.unpublish(id));
    return data;
  },

  archive: async (id: string): Promise<AdminAnnouncementCmsDto> => {
    const { data } = await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.archive(id));
    return data;
  },

  duplicate: async (id: string): Promise<AdminAnnouncementCmsDto> => {
    const { data } = await apiClient.post<AdminAnnouncementCmsDto>(API.adminAnnouncementCms.duplicate(id));
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(API.adminAnnouncementCms.detail(id));
  },
};
