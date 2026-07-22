"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assistantService } from "@/services/assistant.service";

export const ASSISTANT_KEYS = {
  conversations: (workspaceId: string) => ["assistant", "conversations", workspaceId] as const,
  conversation: (id: string) => ["assistant", "conversation", id] as const,
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

export function useCreateAssistantConversation() {
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data } = await assistantService.createConversation(workspaceId);
      return data;
    },
  });
}

export function useSendAssistantMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const { data } = await assistantService.sendMessage(conversationId, content);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.conversation(variables.conversationId) });
    },
  });
}
