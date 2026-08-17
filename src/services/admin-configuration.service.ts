import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminSupportedLanguageDto,
  AdminVoiceConsentSummaryDto,
} from "@/types/admin-configuration";

/** Both surfaces of the Configuration screen. Read-only — neither endpoint has a write path. */
export const adminConfigurationService = {
  getLanguages: async (): Promise<AdminSupportedLanguageDto[]> => {
    const { data } = await apiClient.get<AdminSupportedLanguageDto[]>(API.adminLanguages.base);
    return data;
  },

  getVoiceConsentSummary: async (): Promise<AdminVoiceConsentSummaryDto> => {
    const { data } = await apiClient.get<AdminVoiceConsentSummaryDto>(
      API.adminVoiceConsent.summary,
    );
    return data;
  },
};
