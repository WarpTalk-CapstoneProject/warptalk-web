import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminFeedbackCommentDto,
  AdminFeedbackQuery,
  AdminFeedbackSummaryDto,
} from "@/types/admin-feedback";
import type { AdminPagedResult } from "@/types/admin-workspace";

/** Product feedback across the platform. Read-only — there is no write path on this controller. */
export const adminFeedbackService = {
  getSummary: async (query: AdminFeedbackQuery): Promise<AdminFeedbackSummaryDto> => {
    const { data } = await apiClient.get<AdminFeedbackSummaryDto>(API.adminFeedback.summary, {
      params: query,
    });
    return data;
  },

  getComments: async (
    query: AdminFeedbackQuery,
  ): Promise<AdminPagedResult<AdminFeedbackCommentDto>> => {
    const { data } = await apiClient.get<AdminPagedResult<AdminFeedbackCommentDto>>(
      API.adminFeedback.comments,
      { params: query },
    );
    return data;
  },
};
