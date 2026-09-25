import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { InboxDto, InboxItemDto, InboxNoteDto, InboxSummaryDto } from "@/types/admin-inbox";

/** G12 pending-work inbox (workspace service). */
export const adminInboxService = {
  get: async (refresh = false): Promise<InboxDto> => {
    const { data } = await apiClient.get<InboxDto>(API.adminInbox.base, { params: refresh ? { refresh: true } : undefined });
    return data;
  },
  summary: async (): Promise<InboxSummaryDto> => {
    const { data } = await apiClient.get<InboxSummaryDto>(API.adminInbox.summary);
    return data;
  },
  notes: async (key: string): Promise<InboxNoteDto[]> => {
    const { data } = await apiClient.get<InboxNoteDto[]>(API.adminInbox.notes, { params: { key } });
    return data;
  },
  addNote: async (key: string, body: string): Promise<InboxNoteDto> => {
    const { data } = await apiClient.post<InboxNoteDto>(API.adminInbox.notes, { key, body });
    return data;
  },
  assign: async (key: string, assigneeId: string | null): Promise<InboxItemDto> => {
    const { data } = await apiClient.post<InboxItemDto>(API.adminInbox.assign, { key, assigneeId });
    return data;
  },
  snooze: async (key: string, until: string | null): Promise<InboxItemDto> => {
    const { data } = await apiClient.post<InboxItemDto>(API.adminInbox.snooze, { key, until });
    return data;
  },
  done: async (key: string): Promise<InboxItemDto> => {
    const { data } = await apiClient.post<InboxItemDto>(API.adminInbox.done, { key });
    return data;
  },
  reopen: async (key: string): Promise<InboxItemDto> => {
    const { data } = await apiClient.post<InboxItemDto>(API.adminInbox.reopen, { key });
    return data;
  },
};
