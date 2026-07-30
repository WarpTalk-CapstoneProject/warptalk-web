import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { BreakoutJoinInfoDto, CreateBreakoutsRequest, CreateBreakoutsResponse } from "@/types/breakout";

export const breakoutsService = {
  start(roomId: string, data: CreateBreakoutsRequest) {
    return apiClient.post<CreateBreakoutsResponse>(API.meetings.breakoutsStart(roomId), data);
  },

  end(roomId: string) {
    return apiClient.post<{ message: string }>(API.meetings.breakoutsEnd(roomId));
  },

  myAssignment(roomId: string) {
    return apiClient.get<BreakoutJoinInfoDto>(API.meetings.breakoutsMyAssignment(roomId));
  },
};
