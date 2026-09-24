import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { meetingDirectoryParams } from "@/lib/admin/meeting-directory-params";
import type {
  AdminMeetingCountsDto,
  AdminMeetingDirectoryQuery,
  AdminMeetingSummaryDto,
} from "@/types/admin-meeting";
import type { AdminPagedResult } from "@/types/admin-workspace";

/**
 * Platform meeting directory. Metadata only and read-only — there is no join, no room control and
 * no transcript read, because the API offers none.
 */
export const adminMeetingService = {
  getDirectory: async (
    query: AdminMeetingDirectoryQuery,
  ): Promise<AdminPagedResult<AdminMeetingSummaryDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminMeetingSummaryDto>>(
      API.adminMeetings.base,
      // "all" is sent as no status: the API 400'd it (WT-693).
      { params: meetingDirectoryParams(query) },
    );
    return data;
  },

  getCounts: async (): Promise<AdminMeetingCountsDto> => {
    const { data } = await apiClient.get<AdminMeetingCountsDto>(API.adminMeetings.counts);
    return data;
  },
};
