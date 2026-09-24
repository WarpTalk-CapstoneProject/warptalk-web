import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { ViewerAnnouncementDto } from "@/types/admin-cms";

/** What the signed-in user is shown. The server has already applied the audience and dismissals. */
export const announcementService = {
  active: async (): Promise<ViewerAnnouncementDto[]> => {
    const { data } = await apiClient.get<ViewerAnnouncementDto[]>(API.announcements.active);
    return data;
  },

  dismiss: async (id: string): Promise<void> => {
    await apiClient.post(API.announcements.dismiss(id));
  },
};
