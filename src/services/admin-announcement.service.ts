import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminAnnouncementPageDto,
  AdminAnnouncementQuery,
  AdminAnnouncementSummaryDto,
} from "@/types/admin-announcement";
import type { CreateAdminAnnouncementRequest } from "@/lib/notifications/announcement-draft";

/**
 * Platform announcements.
 *
 * `send` is the only write, and it is the sharpest one in the portal: the service persists the
 * row and immediately publishes chunked delivery events onto a Redis stream a live consumer is
 * reading. There is no draft, no schedule, no recall and no delete — nothing downstream will wait
 * for a second thought. The composer's confirmation step is not decoration.
 *
 * It cannot address everyone. The validator accepts SPECIFIC_USERS alone until a segment resolver
 * exists, so the audience is always a named list of user ids.
 */
export const adminAnnouncementService = {
  list: async (query: AdminAnnouncementQuery): Promise<AdminAnnouncementPageDto> => {
    const { data } = await apiClient.get<AdminAnnouncementPageDto>(
      API.adminAnnouncements.base,
      { params: query },
    );
    return data;
  },

  send: async (
    request: CreateAdminAnnouncementRequest,
  ): Promise<AdminAnnouncementSummaryDto> => {
    const { data } = await apiClient.post<AdminAnnouncementSummaryDto>(
      API.adminAnnouncements.base,
      request,
    );
    return data;
  },
};
