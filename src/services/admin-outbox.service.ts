import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { WorkspaceOutboxDeadLetterDto } from "@/types/admin-outbox";

/**
 * Dead-lettered events in the workspace service's outbox.
 *
 * Read by the Insights page to count them. The Event outbox page that listed and replayed them
 * was retired on 2026-09-24; the backend's replay endpoint is untouched.
 */
export const adminOutboxService = {
  listDeadLetters: async (limit: number): Promise<WorkspaceOutboxDeadLetterDto[]> => {
    const { data } = await apiClient.get<WorkspaceOutboxDeadLetterDto[]>(
      API.adminWorkspaceOutbox.deadLetters,
      { params: { limit } },
    );
    return data;
  },
};
