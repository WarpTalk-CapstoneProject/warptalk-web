import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminAnnouncementPageDto,
  AdminAnnouncementQuery,
} from "@/types/admin-announcement";

/**
 * Platform announcements.
 *
 * Read-only here on purpose. `POST /admin/notifications` exists and delivers to every targeted
 * user at once — an outward-facing send with no undo. That deserves its own release and its own
 * confirmation design rather than arriving as a button on a list nobody has reviewed yet.
 */
export const adminAnnouncementService = {
  list: async (query: AdminAnnouncementQuery): Promise<AdminAnnouncementPageDto> => {
    const { data } = await apiClient.get<AdminAnnouncementPageDto>(
      API.adminAnnouncements.base,
      { params: query },
    );
    return data;
  },
};
