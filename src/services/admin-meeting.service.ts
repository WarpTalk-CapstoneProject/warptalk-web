import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { AdminMeetingCountsDto } from "@/types/admin-meeting";

/**
 * Platform meeting counts for the Insights page. Metadata only and read-only. (The directory list
 * this service also fetched belonged to the retired /admin/meetings page.)
 */
export const adminMeetingService = {
  getCounts: async (): Promise<AdminMeetingCountsDto> => {
    const { data } = await apiClient.get<AdminMeetingCountsDto>(API.adminMeetings.counts);
    return data;
  },
};
