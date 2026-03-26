"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meetingService } from "@/services/meeting.service";
import type { CreateMeetingRequest, JoinMeetingRequest } from "@/types/meeting";

const MEETING_KEY = ["meetings"] as const;

/** Fetch a single meeting by ID */
export function useMeeting(id: string) {
  return useQuery({
    queryKey: [...MEETING_KEY, id],
    queryFn: async () => {
      const { data } = await meetingService.get(id);
      return data;
    },
    enabled: !!id,
  });
}

/** Create meeting mutation */
export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateMeetingRequest) => {
      const { data: meeting } = await meetingService.create(data);
      return meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

/** Join meeting mutation */
export function useJoinMeeting() {
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: JoinMeetingRequest;
    }) => {
      const { data: participant } = await meetingService.join(id, data);
      return participant;
    },
  });
}

/** End meeting mutation */
export function useEndMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await meetingService.end(id);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, id] });
    },
  });
}
