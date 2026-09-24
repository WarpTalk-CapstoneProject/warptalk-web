import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { AnnouncementEventType, ViewerAnnouncementDto } from "@/types/admin-cms";

/**
 * What the signed-in user is shown. The server has already applied the audience, the window and
 * each announcement's show frequency — measured against `sessionId`, a random id kept per browser
 * session.
 */
export const announcementService = {
  active: async (locale: string, sessionId: string): Promise<ViewerAnnouncementDto[]> =>
    (await apiClient.get<ViewerAnnouncementDto[]>(API.announcements.active, { params: { locale, sessionId } })).data,

  /** Best-effort: an analytics event never surfaces an error to the viewer. */
  event: async (id: string, type: AnnouncementEventType, sessionId: string): Promise<void> => {
    await apiClient.post(API.announcements.events(id), { type, sessionId });
  },
};
