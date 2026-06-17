import { useQuery } from "@tanstack/react-query";
import { meetingHistoryService } from "@/services/meetingHistory.service";

export function useMeetingHistory(page = 1, pageSize = 20, search?: string) {
  return useQuery({
    queryKey: ["meeting-history", page, pageSize, search],
    queryFn: async () => {
      const { data } = await meetingHistoryService.getMeetingHistory(page, pageSize, search);
      return data;
    },
    refetchInterval: 30000, // Refresh every 30s in case new meetings end
  });
}

export function useMeetingRoomDetail(roomId: string | undefined) {
  return useQuery({
    queryKey: ["meeting-room-detail", roomId],
    queryFn: async () => {
      if (!roomId) return Promise.reject(new Error("No room id"));
      const { data } = await meetingHistoryService.getMeetingRoomDetail(roomId);
      return data;
    },
    enabled: !!roomId,
  });
}
