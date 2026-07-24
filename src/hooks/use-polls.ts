"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pollsService } from "@/services/polls.service";
import type { CreatePollRequest, PollDto, VotePollRequest } from "@/types/poll";

export function pollsQueryKey(roomId: string) {
  return ["meeting-polls", roomId] as const;
}

/**
 * Initial/late-joiner load of a room's polls. TranslationRoomHub's PollCreated/PollVoted/
 * PollClosed events (wired in page.tsx) write into this same query's cache via
 * queryClient.setQueryData, so this single cache is the shared source of truth for both
 * the live updates and this panel's own mutations below — no prop drilling needed.
 */
export function usePolls(roomId: string) {
  return useQuery({
    queryKey: pollsQueryKey(roomId),
    queryFn: async () => {
      const { data } = await pollsService.list(roomId);
      return data;
    },
    enabled: !!roomId,
  });
}

export function useCreatePoll(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePollRequest) => {
      const response = await pollsService.create(roomId, data);
      return response.data;
    },
    onSuccess: (poll) => {
      queryClient.setQueryData<PollDto[]>(pollsQueryKey(roomId), (current) => [...(current ?? []), poll]);
    },
  });
}

export function useVotePoll(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId, data }: { pollId: string; data: VotePollRequest }) => {
      const response = await pollsService.vote(roomId, pollId, data);
      return response.data;
    },
    onSuccess: (poll) => {
      // Merge the caller's own updated poll (correct myVotedOptionIds + counts) in directly —
      // the PollVoted broadcast only carries aggregate tallies, not per-viewer vote state.
      queryClient.setQueryData<PollDto[]>(pollsQueryKey(roomId), (current) =>
        (current ?? []).map((p) => (p.id === poll.id ? poll : p))
      );
    },
  });
}

export function useClosePoll(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: string) => {
      const response = await pollsService.close(roomId, pollId);
      return response.data;
    },
    onSuccess: (poll) => {
      queryClient.setQueryData<PollDto[]>(pollsQueryKey(roomId), (current) =>
        (current ?? []).map((p) => (p.id === poll.id ? poll : p))
      );
    },
  });
}
