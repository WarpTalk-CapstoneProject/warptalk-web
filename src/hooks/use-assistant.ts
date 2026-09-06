"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assistantService } from "@/services/assistant.service";
import type { ChatAttachment } from "@/lib/assistant/attachments";
import type { AssistantMentionDto, AssistantPageContextDto } from "@/types/assistant";

export const ASSISTANT_KEYS = {
  conversations: (workspaceId: string) => ["assistant", "conversations", workspaceId] as const,
  conversation: (id: string) => ["assistant", "conversation", id] as const,
  skills: ["assistant", "skills"] as const,
  plugins: ["assistant", "plugins"] as const,
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

export function useAssistantPlugins() {
  return useQuery({
    queryKey: ASSISTANT_KEYS.plugins,
    queryFn: async () => {
      const { data } = await assistantService.listPlugins();
      return data;
    },
    staleTime: 60 * 1000,
  });
}

export function useInstallAssistantPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginKey,
    }: {
      pluginKey: string;
    }) => {
      const { data } = await assistantService.installPlugin(pluginKey);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.plugins });
    },
  });
}

export function usePluginConnectUrl() {
  return useMutation({
    mutationFn: async ({
      pluginKey,
    }: {
      pluginKey: string;
    }) => {
      const { data } = await assistantService.getPluginConnectUrl(pluginKey);
      return data;
    },
  });
}

export function useDisconnectAssistantPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginKey,
    }: {
      pluginKey: string;
    }) => {
      await assistantService.disconnectPlugin(pluginKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.plugins });
    },
  });
}

export function useDisableAssistantPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginKey,
    }: {
      pluginKey: string;
    }) => {
      await assistantService.disablePlugin(pluginKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.plugins });
    },
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
      attachments,
    }: {
      conversationId: string;
      content: string;
      pageContext?: AssistantPageContextDto | null;
      mentions?: AssistantMentionDto[];
      /** WT-474: attachments for this turn only. Not persisted. */
      attachments?: ChatAttachment[];
    }) => {
      const { data } = await assistantService.sendMessage(conversationId, content, pageContext, mentions, attachments);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.conversation(variables.conversationId) });
    },
  });
}
