"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assistantService } from "@/services/assistant.service";
import type { AssistantMentionDto, AssistantPageContextDto } from "@/types/assistant";

export const ASSISTANT_KEYS = {
  conversations: (workspaceId: string) => ["assistant", "conversations", workspaceId] as const,
  conversation: (id: string) => ["assistant", "conversation", id] as const,
  skills: ["assistant", "skills"] as const,
};

export function useAssistantConversations(workspaceId: string | null) {
  return useQuery({
    queryKey: ASSISTANT_KEYS.conversations(workspaceId ?? ""),
    queryFn: async () => {
      const { data } = await assistantService.listConversations(workspaceId!);
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useAssistantConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ASSISTANT_KEYS.conversation(conversationId ?? ""),
    queryFn: async () => {
      const { data } = await assistantService.getConversation(conversationId!);
      return data;
    },
    enabled: !!conversationId,
  });
}

/**
 * Imperative counterpart to useAssistantConversation, for "open this one from chat history":
 * the widget only knows which conversation to load at click time, and re-keying a query on
 * the live conversationId would re-fetch (and clobber) a conversation that is mid-stream.
 */
export function useLoadAssistantConversation() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data } = await assistantService.getConversation(conversationId);
      return data;
    },
  });
}

export function useCreateAssistantConversation() {
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data } = await assistantService.createConversation(workspaceId);
      return data;
    },
  });
}

export function useAssistantSkills() {
  return useQuery({
    queryKey: ASSISTANT_KEYS.skills,
    queryFn: async () => {
      const { data } = await assistantService.getSkills();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSendAssistantMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      pageContext,
      mentions,
      images,
    }: {
      conversationId: string;
      content: string;
      pageContext?: AssistantPageContextDto | null;
      mentions?: AssistantMentionDto[];
      /** WT-474: pasted screenshots for this turn only. Not persisted. */
      images?: string[];
    }) => {
      const { data } = await assistantService.sendMessage(conversationId, content, pageContext, mentions, images);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.conversation(variables.conversationId) });
    },
  });
}
