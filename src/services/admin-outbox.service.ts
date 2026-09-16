import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  WorkspaceOutboxDeadLetterDto,
  WorkspaceOutboxReplayResultDto,
} from "@/types/admin-outbox";

/**
 * Dead-lettered events in the workspace service's outbox.
 *
 * Replay resets the row (attempts to 0, available now, dead-letter mark cleared) and hands it
 * back to the publisher. It does not deliver synchronously: a replayed event that fails again
 * returns to this list once it exhausts its attempts a second time.
 */
export const adminOutboxService = {
  listDeadLetters: async (limit: number): Promise<WorkspaceOutboxDeadLetterDto[]> => {
    const { data } = await apiClient.get<WorkspaceOutboxDeadLetterDto[]>(
      API.adminWorkspaceOutbox.deadLetters,
      { params: { limit } },
    );
    return data;
  },

  replay: async (eventId: string): Promise<WorkspaceOutboxReplayResultDto> => {
    const { data } = await apiClient.post<WorkspaceOutboxReplayResultDto>(
      API.adminWorkspaceOutbox.replay(eventId),
    );
    return data;
  },
};
