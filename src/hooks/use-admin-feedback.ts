"use client";

import { useQuery } from "@tanstack/react-query";

import { adminFeedbackService } from "@/services/admin-feedback.service";
import type { AdminFeedbackQuery } from "@/types/admin-feedback";

export const ADMIN_FEEDBACK_KEYS = {
  summary: (query: AdminFeedbackQuery) => ["admin-feedback", "summary", query] as const,
  comments: (query: AdminFeedbackQuery) => ["admin-feedback", "comments", query] as const,
};

export function useAdminFeedbackSummary(query: AdminFeedbackQuery) {
  return useQuery({
    queryKey: ADMIN_FEEDBACK_KEYS.summary(query),
    queryFn: () => adminFeedbackService.getSummary(query),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

export function useAdminFeedbackComments(query: AdminFeedbackQuery) {
  return useQuery({
    queryKey: ADMIN_FEEDBACK_KEYS.comments(query),
    queryFn: () => adminFeedbackService.getComments(query),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}
