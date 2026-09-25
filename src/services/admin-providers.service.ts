import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminProviderBreakdownDto,
  AdminProviderSeriesDto,
  AdminProvidersOverviewDto,
  AdminProviderUptimeDto,
  ProviderBreakdownBy,
} from "@/types/admin-providers";

export interface ProviderRangeQuery {
  from: string;
  to: string;
  tz: string;
}

/** The admin Providers page. GET only: nothing here can change a key, a quota or a price. */
export const adminProvidersService = {
  overview: async (tz: string): Promise<AdminProvidersOverviewDto> => {
    const { data } = await apiClient.get<AdminProvidersOverviewDto>(API.adminProviders.base, { params: { tz } });
    return data;
  },
  series: async (
    key: string,
    range: ProviderRangeQuery,
    granularity: "day" | "hour",
  ): Promise<AdminProviderSeriesDto> => {
    const { data } = await apiClient.get<AdminProviderSeriesDto>(API.adminProviders.series(key), {
      params: { ...range, granularity },
    });
    return data;
  },
  breakdown: async (key: string, range: ProviderRangeQuery, by: ProviderBreakdownBy): Promise<AdminProviderBreakdownDto> => {
    const { data } = await apiClient.get<AdminProviderBreakdownDto>(API.adminProviders.breakdown(key), {
      params: { ...range, by },
    });
    return data;
  },
  uptime: async (key: string, tz: string, days = 90): Promise<AdminProviderUptimeDto> => {
    const { data } = await apiClient.get<AdminProviderUptimeDto>(API.adminProviders.uptime(key), { params: { days, tz } });
    return data;
  },
};
