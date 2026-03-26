import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateMeetingRequest,
  JoinMeetingRequest,
  MeetingDto,
  MeetingParticipantDto,
} from "@/types/meeting";

/** Meeting service — maps to MeetingsController endpoints */
export const meetingService = {
  create(data: CreateMeetingRequest) {
    return apiClient.post<MeetingDto>(API.meetings.create, data);
  },

  get(id: string) {
    return apiClient.get<MeetingDto>(API.meetings.get(id));
  },

  join(id: string, data: JoinMeetingRequest) {
    return apiClient.post<MeetingParticipantDto>(API.meetings.join(id), data);
  },

  end(id: string) {
    return apiClient.post<void>(API.meetings.end(id));
  },
};
