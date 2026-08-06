import apiClient from "@/lib/api/client";
import type { MeetingHistoryListResponseDto, MeetingRoomDetailDto } from "@/types/meeting";

export const meetingHistoryService = {
  getMeetingHistory: async (page = 1, pageSize = 20, search?: string) => {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (search) params.append("search", search);
    return apiClient.get<MeetingHistoryListResponseDto>(`/meetings/history?${params.toString()}`);
  },

  getMeetingRoomDetail: async (roomId: string) => {
    return apiClient.get<MeetingRoomDetailDto>(`/meetings/history/${roomId}`);
  },
};
