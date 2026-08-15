import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { AdminPlatformHealthDto } from "@/types/admin-platform-health";

/**
 * The platform's own vitals. One GET, no parameters — the screen shows now, and "now" is not a
 * filter anybody would want to get wrong.
 */
export const adminPlatformHealthService = {
  get: async (): Promise<AdminPlatformHealthDto> => {
    const { data } = await apiClient.get<AdminPlatformHealthDto>(API.adminPlatformHealth.base);
    return data;
  },
};
