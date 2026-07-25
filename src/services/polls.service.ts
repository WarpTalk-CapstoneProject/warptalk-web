import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { CreatePollRequest, PollDto, VotePollRequest } from "@/types/poll";

export const pollsService = {
  list(roomId: string) {
    return apiClient.get<PollDto[]>(API.meetings.pollsList(roomId));
  },

  create(roomId: string, data: CreatePollRequest) {
    return apiClient.post<PollDto>(API.meetings.pollsCreate(roomId), data);
  },

  vote(roomId: string, pollId: string, data: VotePollRequest) {
    return apiClient.post<PollDto>(API.meetings.pollsVote(roomId, pollId), data);
  },

  close(roomId: string, pollId: string) {
    return apiClient.post<PollDto>(API.meetings.pollsClose(roomId, pollId));
  },
};
