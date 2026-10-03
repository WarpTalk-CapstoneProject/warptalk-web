import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { AdminToolInsightsDto, AdminToolInsightsQuery } from "@/types/admin-warpbot-tools";

/**
 * The admin WarpBot tools page's usage source (`/admin/warpbot-tools`, Usage tab). Read-only,
 * platform staff with `plugins.read`. The server defaults to the last 30 days and refuses more
 * than 180; the page never asks for more.
 */
export const adminWarpbotToolsService = {
  getUsage: async (query: AdminToolInsightsQuery): Promise<AdminToolInsightsDto> => {
    const { data } = await apiClient.get<AdminToolInsightsDto>(API.adminInsights.warpbotTools, {
      params: query,
    });
    return data;
  },
};
