import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { MeetingMinutesDto } from "@/types/meetingMinutes";

/**
 * Biên bản họp — maps to MeetingMinutesController.
 *
 * `content` travels as a JSON string in both directions. The server stores it verbatim, so a
 * field this client does not know about survives a round trip through an older web rather than
 * being quietly dropped by re-serialising through a typed model.
 */
export const meetingMinutesService = {
  /** The room's minutes of record. 404 means none has been drawn up yet — not an error. */
  getByRoom(roomId: string) {
    return apiClient.get<MeetingMinutesDto>(API.minutes.byRoom(roomId));
  },

  /** Draw up the draft. Idempotent while one is unapproved, so pressing twice is safe. */
  createDraft(roomId: string) {
    return apiClient.post<MeetingMinutesDto>(API.minutes.draft(roomId));
  },

  updateContent(roomId: string, minutesId: string, content: string) {
    return apiClient.put<MeetingMinutesDto>(API.minutes.update(roomId, minutesId), { content });
  },

  sign(roomId: string, minutesId: string) {
    return apiClient.post<MeetingMinutesDto>(API.minutes.sign(roomId, minutesId));
  },

  approve(roomId: string, minutesId: string) {
    return apiClient.post<MeetingMinutesDto>(API.minutes.approve(roomId, minutesId));
  },

  /** Open version N+1. The approved document stays on record exactly as it was signed. */
  revise(roomId: string, minutesId: string) {
    return apiClient.post<MeetingMinutesDto>(API.minutes.revise(roomId, minutesId));
  },

  /**
   * The .docx, rendered by the server.
   *
   * The file is built server-side so an approved document does not become a function of the
   * reader's browser, and so a document library is not shipped to every visitor to produce
   * something only the host ever asks for.
   */
  async downloadDocx(roomId: string) {
    const response = await apiClient.get<Blob>(API.minutes.exportDocx(roomId), {
      responseType: "blob",
    });
    return response;
  },
};
