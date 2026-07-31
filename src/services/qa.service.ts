import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { CreateQuestionRequest, QuestionDto } from "@/types/question";

export const qaService = {
  list(roomId: string) {
    return apiClient.get<QuestionDto[]>(API.meetings.questionsList(roomId));
  },

  ask(roomId: string, data: CreateQuestionRequest) {
    return apiClient.post<QuestionDto>(API.meetings.questionsAsk(roomId), data);
  },

  upvote(roomId: string, questionId: string) {
    return apiClient.post<QuestionDto>(API.meetings.questionsUpvote(roomId, questionId));
  },

  answer(roomId: string, questionId: string) {
    return apiClient.post<QuestionDto>(API.meetings.questionsAnswer(roomId, questionId));
  },
};
