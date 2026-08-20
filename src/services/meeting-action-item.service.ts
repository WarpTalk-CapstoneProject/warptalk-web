import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { ActionItemStatus, MeetingActionItemDto } from "@/types/meetingActionItem";

/** Maps to MeetingActionItemsController. */
export const meetingActionItemService = {
  forRoom(roomId: string) {
    return apiClient.get<MeetingActionItemDto[]>(API.actionItems.forRoom(roomId));
  },

  /** Everything assigned to the caller in one workspace. */
  mine(workspaceId: string, status?: ActionItemStatus) {
    return apiClient.get<MeetingActionItemDto[]>(API.actionItems.mine(workspaceId), {
      params: status ? { status } : undefined,
    });
  },

  updateStatus(itemId: string, status: ActionItemStatus, dueDate?: string | null) {
    return apiClient.put<MeetingActionItemDto>(API.actionItems.status(itemId), { status, dueDate });
  },
};
