import axios from "axios";

import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  PlatformIntegrationsDto,
  PlatformIntegrationTestResultDto,
  PlatformSettingChangeDto,
  PlatformSettingDto,
  PlatformSettingResetRequest,
  PlatformSettingsConsoleDto,
  PlatformSettingsExportDto,
  PlatformSettingsImportRequest,
  PlatformSettingsImportResultDto,
  PlatformSettingWriteRequest,
  PlatformStatusDto,
} from "@/types/admin-platform-settings";

/** The platform settings console (workspace service, `/api/v1/admin/settings`). */
export const adminPlatformSettingsService = {
  get: async (): Promise<PlatformSettingsConsoleDto> => {
    const { data } = await apiClient.get<PlatformSettingsConsoleDto>(API.adminPlatformSettings.base);
    return data;
  },
  history: async (key: string | null, limit = 50): Promise<PlatformSettingChangeDto[]> => {
    const { data } = await apiClient.get<PlatformSettingChangeDto[]>(API.adminPlatformSettings.history, {
      params: { ...(key ? { key } : {}), limit },
    });
    return data;
  },
  set: async (key: string, request: PlatformSettingWriteRequest): Promise<PlatformSettingDto> => {
    const { data } = await apiClient.put<PlatformSettingDto>(API.adminPlatformSettings.byKey(key), request);
    return data;
  },
  reset: async (key: string, request: PlatformSettingResetRequest): Promise<PlatformSettingDto> => {
    const { data } = await apiClient.post<PlatformSettingDto>(API.adminPlatformSettings.reset(key), request);
    return data;
  },
  revert: async (changeId: string, reason?: string): Promise<PlatformSettingDto> => {
    const { data } = await apiClient.post<PlatformSettingDto>(API.adminPlatformSettings.revert(changeId), {
      reason: reason ?? null,
    });
    return data;
  },
  export: async (): Promise<PlatformSettingsExportDto> => {
    const { data } = await apiClient.post<PlatformSettingsExportDto>(API.adminPlatformSettings.export);
    return data;
  },
  import: async (request: PlatformSettingsImportRequest): Promise<PlatformSettingsImportResultDto> => {
    const { data } = await apiClient.post<PlatformSettingsImportResultDto>(API.adminPlatformSettings.import, request);
    return data;
  },
  integrations: async (): Promise<PlatformIntegrationsDto> => {
    const { data } = await apiClient.get<PlatformIntegrationsDto>(API.adminPlatformSettings.integrations);
    return data;
  },
  testIntegration: async (key: string): Promise<PlatformIntegrationTestResultDto> => {
    const { data } = await apiClient.post<PlatformIntegrationTestResultDto>(API.adminPlatformSettings.testIntegration(key));
    return data;
  },
};

/**
 * Anonymous platform status: maintenance, support address, Google sign-in.
 *
 * Deliberately NOT through `apiClient`: its request interceptor refreshes (and, with nothing to
 * redeem, ends) the session before every call, and this one is polled on the sign-in page by
 * people who have no session at all. A bare, credential-less GET is all the endpoint needs.
 */
export const platformStatusService = {
  get: async (): Promise<PlatformStatusDto> => {
    const { data } = await axios.get<PlatformStatusDto>(`${apiClient.defaults.baseURL ?? ""}${API.platformStatus.base}`, {
      timeout: 10_000,
      withCredentials: false,
    });
    return data;
  },
};
