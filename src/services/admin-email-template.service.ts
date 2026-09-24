import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  BulkResultDto,
  EmailBulkRequest,
  EmailCmsVersionDto,
  EmailPreviewDto,
  EmailPreviewRequest,
  EmailSampleDataSetDto,
  EmailStatsDto,
  EmailTemplateDetailDto,
  EmailTemplateListItemDto,
  EmailTestSendDto,
  EmailTestSendRequest,
  EmailVariantDto,
  PublishEmailRequest,
  SaveEmailDraftRequest,
  SaveSampleDataSetRequest,
} from "@/types/admin-cms";

/**
 * Email content. Saving a draft changes nothing any recipient receives; publishing is what every
 * sender reads (within ~30s, the senders' cache).
 */
export const adminEmailTemplateService = {
  list: async (): Promise<EmailTemplateListItemDto[]> =>
    (await apiClient.get<EmailTemplateListItemDto[]>(API.adminEmailTemplates.base)).data,

  get: async (key: string): Promise<EmailTemplateDetailDto> =>
    (await apiClient.get<EmailTemplateDetailDto>(API.adminEmailTemplates.detail(key))).data,

  saveDraft: async (key: string, locale: string, request: SaveEmailDraftRequest): Promise<EmailVariantDto> =>
    (await apiClient.put<EmailVariantDto>(API.adminEmailTemplates.locale(key, locale, "draft"), request)).data,

  publish: async (key: string, locale: string, request: PublishEmailRequest): Promise<EmailVariantDto> =>
    (await apiClient.post<EmailVariantDto>(API.adminEmailTemplates.locale(key, locale, "publish"), request)).data,

  discardDraft: async (key: string, locale: string): Promise<EmailVariantDto | null> =>
    (await apiClient.post<EmailVariantDto | null>(API.adminEmailTemplates.locale(key, locale, "discard-draft"))).data ?? null,

  archive: async (key: string, locale: string): Promise<EmailVariantDto> =>
    (await apiClient.post<EmailVariantDto>(API.adminEmailTemplates.locale(key, locale, "archive"))).data,

  unarchive: async (key: string, locale: string): Promise<EmailVariantDto> =>
    (await apiClient.post<EmailVariantDto>(API.adminEmailTemplates.locale(key, locale, "unarchive"))).data,

  duplicate: async (key: string, locale: string, targetLocale: string, overwrite: boolean): Promise<EmailVariantDto> =>
    (await apiClient.post<EmailVariantDto>(API.adminEmailTemplates.locale(key, locale, "duplicate"), { targetLocale, overwrite })).data,

  resetToDefault: async (key: string, locale: string): Promise<EmailVariantDto> =>
    (await apiClient.post<EmailVariantDto>(API.adminEmailTemplates.locale(key, locale, "reset-to-default"))).data,

  versions: async (key: string, locale: string): Promise<EmailCmsVersionDto[]> =>
    (await apiClient.get<EmailCmsVersionDto[]>(API.adminEmailTemplates.locale(key, locale, "versions"))).data,

  restore: async (key: string, locale: string, version: number): Promise<EmailVariantDto> =>
    (await apiClient.post<EmailVariantDto>(API.adminEmailTemplates.restore(key, locale, version))).data,

  preview: async (key: string, request: EmailPreviewRequest): Promise<EmailPreviewDto> =>
    (await apiClient.post<EmailPreviewDto>(API.adminEmailTemplates.preview(key), request)).data,

  sendTest: async (key: string, request: EmailTestSendRequest): Promise<EmailTestSendDto> =>
    (await apiClient.post<EmailTestSendDto>(API.adminEmailTemplates.test(key), request)).data,

  saveSampleSet: async (key: string, id: string | null, request: SaveSampleDataSetRequest): Promise<EmailSampleDataSetDto> =>
    id
      ? (await apiClient.put<EmailSampleDataSetDto>(API.adminEmailTemplates.sampleSet(key, id), request)).data
      : (await apiClient.post<EmailSampleDataSetDto>(API.adminEmailTemplates.sampleSets(key), request)).data,

  deleteSampleSet: async (key: string, id: string): Promise<void> => {
    await apiClient.delete(API.adminEmailTemplates.sampleSet(key, id));
  },

  stats: async (key: string, days: number): Promise<EmailStatsDto> =>
    (await apiClient.get<EmailStatsDto>(API.adminEmailTemplates.stats(key), { params: { days } })).data,

  bulk: async (request: EmailBulkRequest): Promise<BulkResultDto> =>
    (await apiClient.post<BulkResultDto>(API.adminEmailTemplates.bulk, request)).data,
};
