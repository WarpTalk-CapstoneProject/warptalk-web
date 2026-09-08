"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assistantService } from "@/services/assistant.service";
import type { ChatAttachment } from "@/lib/assistant/attachments";
import type { AssistantMentionDto, AssistantPageContextDto } from "@/types/assistant";

/**
 * Prefix of every plugin-catalog query, whatever workspace it names. Invalidating this invalidates
 * all of them, which is what install/disconnect/disable want: they change the user's own state, and
 * every cached view of the catalog is stale afterwards regardless of whose policy it was read under.
 */
const PLUGINS_QUERY_ROOT = ["assistant", "plugins"] as const;

export const ASSISTANT_KEYS = {
  conversations: (workspaceId: string) => ["assistant", "conversations", workspaceId] as const,
  conversation: (id: string) => ["assistant", "conversation", id] as const,
  skills: ["assistant", "skills"] as const,
  pluginsRoot: PLUGINS_QUERY_ROOT,
  /**
   * Keyed on the workspace because the workspace changes the response: the same rows come back
   * carrying that workspace's `workspacePolicyBlockReason`. Caching two workspaces' verdicts under
   * one key would show a member the refusal from the workspace they left.
   */
  plugins: (workspaceId?: string | null) => [...PLUGINS_QUERY_ROOT, workspaceId ?? null] as const,
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

/**
 * @param workspaceId The workspace the user is browsing from, or null/undefined to list the catalog
 * with no workspace policy applied. See `assistantService.listPlugins`.
 */
export function useAssistantPlugins(workspaceId?: string | null) {
  return useQuery({
    queryKey: ASSISTANT_KEYS.plugins(workspaceId),
    queryFn: async () => {
      const { data } = await assistantService.listPlugins(workspaceId);
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
      workspaceId,
    }: {
      pluginKey: string;
      workspaceId?: string | null;
    }) => {
      const { data } = await assistantService.installPlugin(pluginKey, workspaceId);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.pluginsRoot });
    },
  });
}

export function usePluginConnectUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pluginKey,
      workspaceId,
    }: {
      pluginKey: string;
      workspaceId?: string | null;
    }) => {
      const { data } = await assistantService.getPluginConnectUrl(pluginKey, workspaceId);
      return data;
    },
    // Nothing has changed on the server yet — this only obtained a URL — but the catalog is about
    // to change out from under us at the provider, and `staleTime: 60_000` would otherwise let a
    // user finish consent, come back inside the minute, and be served the pre-consent answer from
    // cache. Marking it stale here is what lets the global `refetchOnWindowFocus` do its job on
    // every plugin surface, not just the one that started the flow.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.pluginsRoot });
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
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.pluginsRoot });
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
      queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.pluginsRoot });
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
