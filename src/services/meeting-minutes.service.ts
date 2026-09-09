import apiClient from "@/lib/api/client";
import publicApiClient from "@/lib/api/public-client";
import { API } from "@/lib/api/endpoints";
import type { MeetingMinutesDto } from "@/types/meetingMinutes";
import type { WorkspaceMinutesResponse } from "@/types/workspaceMinutes";
import type { MinutesTemplateId } from "@/lib/meeting/minutes-document";
import type { MinutesShare, MinutesShareMode, SharedMinutes } from "@/types/minutesShare";

/**
 * Biên bản họp — maps to MeetingMinutesController.
 *
 * `content` travels as a JSON string in both directions. The server stores it verbatim, so a
 * field this client does not know about survives a round trip through an older web rather than
 * being quietly dropped by re-serialising through a typed model.
 */
export const meetingMinutesService = {
  /**
   * The workspace's minutes, newest meeting first.
   *
   * Server-side search covers the document's identity — its number and its meeting — which is
   * what the room history search covers too, so one term narrows every kind of record in the
   * library the same way. The body is searched in the browser over the page that came back.
   */
  listForWorkspace(workspaceId: string, params?: {
    search?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    return apiClient.get<WorkspaceMinutesResponse>(API.minutes.forWorkspace(workspaceId), { params });
  },

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
   * The .docx, rendered by the server, in the layout the reader is looking at.
   *
   * The file is built server-side so an approved document does not become a function of the
   * reader's browser, and so a document library is not shipped to every visitor to produce
   * something only the host ever asks for.
   *
   * `template` is passed rather than left to the server's own default: the page has a switcher, so
   * downloading without it produced a file that did not match what was on screen — the reader had
   * chosen a layout and the file ignored the choice.
   */
  async downloadDocx(roomId: string, template?: MinutesTemplateId) {
    const response = await apiClient.get<Blob>(API.minutes.exportDocx(roomId, template), {
      responseType: "blob",
    });
    return response;
  },

  /**
   * The same document as a PDF.
   *
   * The server converts the .docx it just wrote rather than laying the document out a second
   * time, so the file somebody prints and the file somebody edits cannot disagree. 503 means this
   * deployment has no converter — the Word download still works, and the UI says so.
   */
  async downloadPdf(roomId: string, template?: MinutesTemplateId) {
    return apiClient.get<Blob>(API.minutes.exportPdf(roomId, template), { responseType: "blob" });
  },

  // ------------------------------------------------------------------ sharing

  /** The share dialog's state. Creates the link — restricted — on first ask. */
  getShare(roomId: string) {
    return apiClient.get<MinutesShare>(API.minutes.share(roomId));
  },

  /** Omitted fields are left alone, so a downloads toggle does not restate the access mode. */
  updateShare(
    roomId: string,
    patch: { accessMode?: MinutesShareMode; allowDownload?: boolean; expiresAt?: string | null },
  ) {
    return apiClient.patch<MinutesShare>(API.minutes.share(roomId), patch);
  },

  /** Kills the URL already sent. It is not re-issued. */
  revokeShare(roomId: string) {
    return apiClient.delete<MinutesShare>(API.minutes.share(roomId));
  },

  addSharePerson(roomId: string, email: string) {
    return apiClient.post<MinutesShare>(API.minutes.sharePeople(roomId), { email });
  },

  removeSharePerson(roomId: string, email: string) {
    return apiClient.delete<MinutesShare>(API.minutes.sharePerson(roomId, email));
  },

  /**
   * A shared document, read through the token in the URL.
   *
   * publicApiClient, not apiClient: a visitor with no account must not be treated as an expired
   * session and sent to /login.
   */
  getShared(token: string) {
    return publicApiClient.get<SharedMinutes>(API.sharedMinutes.byToken(token));
  },

  downloadShared(token: string, format: "docx" | "pdf", template?: MinutesTemplateId) {
    const path =
      format === "pdf"
        ? API.sharedMinutes.exportPdf(token, template)
        : API.sharedMinutes.exportDocx(token, template);
    return publicApiClient.get<Blob>(path, { responseType: "blob" });
  },
};
