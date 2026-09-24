import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  EmailTemplateContentDto,
  EmailTemplateDetailDto,
  EmailTemplatePreviewDto,
  EmailTemplateSummaryDto,
  EmailTemplateTestSendDto,
  EmailTemplateVersionDto,
  SaveEmailTemplateRequest,
} from "@/types/admin-cms";

/**
 * The email template CMS. A save here is read by the sender on its next email (within ~30s, the
 * senders' cache), so the editor treats Save as publishing, not as drafting.
 */
export const adminEmailTemplateService = {
  list: async (): Promise<EmailTemplateSummaryDto[]> => {
    const { data } = await apiClient.get<EmailTemplateSummaryDto[]>(API.adminEmailTemplates.base);
    return data;
  },

  get: async (key: string): Promise<EmailTemplateDetailDto> => {
    const { data } = await apiClient.get<EmailTemplateDetailDto>(API.adminEmailTemplates.detail(key));
    return data;
  },

  save: async (key: string, request: SaveEmailTemplateRequest): Promise<EmailTemplateDetailDto> => {
    const { data } = await apiClient.put<EmailTemplateDetailDto>(API.adminEmailTemplates.detail(key), request);
    return data;
  },

  reset: async (key: string): Promise<EmailTemplateDetailDto> => {
    const { data } = await apiClient.delete<EmailTemplateDetailDto>(API.adminEmailTemplates.detail(key));
    return data;
  },

  preview: async (key: string, draft: EmailTemplateContentDto): Promise<EmailTemplatePreviewDto> => {
    const { data } = await apiClient.post<EmailTemplatePreviewDto>(API.adminEmailTemplates.preview(key), draft);
    return data;
  },

  sendTest: async (key: string, draft: EmailTemplateContentDto): Promise<EmailTemplateTestSendDto> => {
    const { data } = await apiClient.post<EmailTemplateTestSendDto>(API.adminEmailTemplates.test(key), draft);
    return data;
  },

  versions: async (key: string): Promise<EmailTemplateVersionDto[]> => {
    const { data } = await apiClient.get<EmailTemplateVersionDto[]>(API.adminEmailTemplates.versions(key));
    return data;
  },

  restore: async (key: string, version: number): Promise<EmailTemplateDetailDto> => {
    const { data } = await apiClient.post<EmailTemplateDetailDto>(API.adminEmailTemplates.restore(key, version));
    return data;
  },
};
