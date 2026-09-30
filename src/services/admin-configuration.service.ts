import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminCreateLanguageRequest,
  AdminDisableLanguageRequest,
  AdminSupportedLanguageDto,
  AdminUpdateLanguageRequest,
  AdminVoiceConsentSummaryDto,
} from "@/types/admin-configuration";

/**
 * The reference half of Platform settings. The language catalog is manageable (WT-691): add,
 * rename, enable, soft-disable — never delete — and the server records each change in the audit
 * log before saving it. Voice consent stays read-only.
 */
export const adminConfigurationService = {
  getLanguages: async (): Promise<AdminSupportedLanguageDto[]> => {
    const { data } = await apiClient.get<AdminSupportedLanguageDto[]>(API.adminLanguages.base);
    return data;
  },

  createLanguage: async (request: AdminCreateLanguageRequest): Promise<AdminSupportedLanguageDto> => {
    const { data } = await apiClient.post<AdminSupportedLanguageDto>(API.adminLanguages.base, request);
    return data;
  },

  updateLanguage: async (
    code: string,
    request: AdminUpdateLanguageRequest,
  ): Promise<AdminSupportedLanguageDto> => {
    const { data } = await apiClient.put<AdminSupportedLanguageDto>(
      API.adminLanguages.byCode(code),
      request,
    );
    return data;
  },

  enableLanguage: async (code: string): Promise<AdminSupportedLanguageDto> => {
    const { data } = await apiClient.post<AdminSupportedLanguageDto>(API.adminLanguages.enable(code));
    return data;
  },

  disableLanguage: async (
    code: string,
    request: AdminDisableLanguageRequest = {},
  ): Promise<AdminSupportedLanguageDto> => {
    const { data } = await apiClient.post<AdminSupportedLanguageDto>(
      API.adminLanguages.disable(code),
      request,
    );
    return data;
  },

  getVoiceConsentSummary: async (): Promise<AdminVoiceConsentSummaryDto> => {
    const { data } = await apiClient.get<AdminVoiceConsentSummaryDto>(
      API.adminVoiceConsent.summary,
    );
    return data;
  },
};
