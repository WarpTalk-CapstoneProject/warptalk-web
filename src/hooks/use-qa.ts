"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qaService } from "@/services/qa.service";
import type { CreateQuestionRequest, QuestionDto } from "@/types/question";

export function questionsQueryKey(roomId: string) {
  return ["meeting-questions", roomId] as const;
}

/**
 * Initial/late-joiner load of a room's questions. TranslationRoomHub's QuestionAsked/
 * QuestionUpvoted/QuestionAnswered events (wired in page.tsx) write into this same query's
 * cache via queryClient.setQueryData — see usePolls for the same pattern.
 */
export function useQuestions(roomId: string) {
  return useQuery({
    queryKey: questionsQueryKey(roomId),
    queryFn: async () => {
      const { data } = await qaService.list(roomId);
      return data;
    },
    enabled: !!roomId,
  });
}

export function useAskQuestion(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateQuestionRequest) => {
      const response = await qaService.ask(roomId, data);
      return response.data;
    },
    onSuccess: (question) => {
      queryClient.setQueryData<QuestionDto[]>(questionsQueryKey(roomId), (current) => [...(current ?? []), question]);
    },
  });
}

export function useUpvoteQuestion(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (questionId: string) => {
      const response = await qaService.upvote(roomId, questionId);
      return response.data;
    },
    onSuccess: (question) => {
      // Merge the caller's own updated question (correct upvotedByMe) in directly — the
      // QuestionUpvoted broadcast only carries the aggregate count, not per-viewer state.
      queryClient.setQueryData<QuestionDto[]>(questionsQueryKey(roomId), (current) =>
        (current ?? []).map((q) => (q.id === question.id ? question : q))
      );
    },
  });
}

export function useAnswerQuestion(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (questionId: string) => {
      const response = await qaService.answer(roomId, questionId);
      return response.data;
    },
    onSuccess: (question) => {
      queryClient.setQueryData<QuestionDto[]>(questionsQueryKey(roomId), (current) =>
        (current ?? []).map((q) => (q.id === question.id ? question : q))
      );
    },
  });
}
