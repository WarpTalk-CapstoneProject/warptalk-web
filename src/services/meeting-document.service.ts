import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { MeetingDocumentsQuery, MeetingDocumentsResponse } from "@/types/meetingDocument";
import { MEETING_DOCUMENTS_PAGE_SIZE } from "@/types/meetingDocument";

/**
 * The workspace's meeting documents, one page at a time.
 *
 * Thin on purpose. Every filter here is applied by the SERVER — the archive page's habit of
 * fetching a hundred rows and filtering them in a `useMemo` is what made its search silently
 * mean "search the page you happen to be looking at", and its `total` a number that could not
 * be trusted. Nothing in this file narrows a result the server already narrowed.
 */
export const meetingDocumentService = {
  async list(query: MeetingDocumentsQuery): Promise<MeetingDocumentsResponse> {
    const { data } = await apiClient.get<MeetingDocumentsResponse>(API.translationRooms.documents, {
      params: {
        workspaceId: query.workspaceId,
        type: query.type || undefined,
        // Trimmed to undefined rather than sent empty: an empty `search` is not a filter, and
        // sending one would make every request look distinct to the query cache.
        search: query.search?.trim() || undefined,
        page: query.page && query.page > 0 ? Math.floor(query.page) : 1,
        pageSize: query.pageSize ?? MEETING_DOCUMENTS_PAGE_SIZE,
      },
    });

    return data;
  },
};
