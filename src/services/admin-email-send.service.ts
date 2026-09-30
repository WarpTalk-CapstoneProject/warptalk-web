import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateEmailSendRequest,
  EmailAudienceDto,
  EmailCampaignDto,
  EmailCampaignRecipientPageDto,
  EmailSendEstimateDto,
} from "@/types/admin-cms";

/**
 * Audience sends of custom email templates (content.email_send). The server resolves the audience,
 * sends only published content, rate-limits, and logs every recipient.
 */
export const adminEmailSendService = {
  estimate: async (key: string, audience: EmailAudienceDto): Promise<EmailSendEstimateDto> =>
    (await apiClient.post<EmailSendEstimateDto>(API.adminEmailSends.estimate(key), { audience })).data,

  start: async (key: string, request: CreateEmailSendRequest): Promise<EmailCampaignDto> =>
    (await apiClient.post<EmailCampaignDto>(API.adminEmailSends.forTemplate(key), request)).data,

  list: async (key: string): Promise<EmailCampaignDto[]> =>
    (await apiClient.get<EmailCampaignDto[]>(API.adminEmailSends.forTemplate(key))).data,

  get: async (id: string): Promise<EmailCampaignDto> =>
    (await apiClient.get<EmailCampaignDto>(API.adminEmailSends.detail(id))).data,

  recipients: async (id: string, status: string | null, page: number, pageSize: number): Promise<EmailCampaignRecipientPageDto> =>
    (
      await apiClient.get<EmailCampaignRecipientPageDto>(API.adminEmailSends.recipients(id), {
        params: { status: status || undefined, page, pageSize },
      })
    ).data,

  cancel: async (id: string): Promise<EmailCampaignDto> =>
    (await apiClient.post<EmailCampaignDto>(API.adminEmailSends.cancel(id))).data,
};
