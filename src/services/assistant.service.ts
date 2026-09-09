import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { ChatAttachment } from "@/lib/assistant/attachments";
import type {
  AssistantConversationDetailDto,
  AssistantConversationDto,
  AssistantMentionDto,
  AssistantPageContextDto,
  AssistantPluginCatalogItemDto,
  AssistantSkillDto,
  PluginConnectUrlDto,
  SendAssistantMessageResponse,
} from "@/types/assistant";

export const assistantService = {
  listConversations(workspaceId: string) {
    return apiClient.get<AssistantConversationDto[]>(API.assistant.conversations, {
      params: { workspaceId },
    });
  },

  getConversation(id: string) {
    return apiClient.get<AssistantConversationDetailDto>(API.assistant.conversation(id));
  },

  createConversation(workspaceId: string) {
    return apiClient.post<AssistantConversationDto>(API.assistant.conversations, { workspaceId });
  },

  sendMessage(
    conversationId: string,
    content: string,
    pageContext?: AssistantPageContextDto | null,
    mentions?: AssistantMentionDto[],
    /**
     * WT-474 — files pasted, picked or dropped into the composer: images AND documents.
     *
     * They belong to THIS TURN. Nothing stores them, so a follow-up question cannot see them — the
     * composer says so, because a user who attaches once and then asks "and the red box?" would
     * otherwise get a confident answer about a file the model never received.
     *
     * `size` is dropped on the way out: it is only there for the chip's label.
     */
    attachments?: ChatAttachment[]
  ) {
    return apiClient.post<SendAssistantMessageResponse>(API.assistant.sendMessage(conversationId), {
      content,
      pageContext: pageContext ?? undefined,
      mentions: mentions?.length ? mentions : undefined,
      attachments: attachments?.length
        ? attachments.map(({ dataUrl, name, mimeType }) => ({ dataUrl, name, mimeType }))
        : undefined,
    });
  },

  archiveConversation(id: string) {
    return apiClient.delete<void>(API.assistant.conversation(id));
  },

  getSkills() {
    return apiClient.get<AssistantSkillDto[]>(API.assistant.skills);
  },

  /**
   * WT-646 — `workspaceId` is optional at the endpoint and it changes what comes back, not which
   * rows come back: supplied, every row carries that workspace's verdict in
   * `workspacePolicyBlockReason`; omitted, no workspace policy is applied at all and the field is
   * always absent.
   *
   * The catalog itself stays personal either way. A plugin is installed and connected by a person,
   * not by a workspace, and the workspace only gets to say whether its members may use plugins here
   * — so this names the workspace the user is browsing from rather than scoping the list to it.
   */
  listPlugins(workspaceId?: string | null) {
    return apiClient.get<AssistantPluginCatalogItemDto[]>(API.assistant.plugins, {
      params: workspaceId ? { workspaceId } : undefined,
    });
  },

  /**
   * `workspaceId` is what makes the refusal real rather than advisory: without it the server
   * applies no policy and installs a plugin the page has just told the user their workspace does
   * not permit.
   */
  installPlugin(pluginKey: string, workspaceId?: string | null) {
    return apiClient.post<AssistantPluginCatalogItemDto>(
      API.assistant.installPlugin(pluginKey),
      undefined,
      { params: workspaceId ? { workspaceId } : undefined },
    );
  },

  getPluginConnectUrl(pluginKey: string, client?: string, workspaceId?: string | null) {
    return apiClient.get<PluginConnectUrlDto>(API.assistant.pluginConnectUrl(pluginKey, client), {
      params: workspaceId ? { workspaceId } : undefined,
    });
  },

  disconnectPlugin(pluginKey: string) {
    return apiClient.delete<void>(API.assistant.pluginConnection(pluginKey));
  },

  disablePlugin(pluginKey: string) {
    return apiClient.delete<void>(API.assistant.disablePlugin(pluginKey));
  },
};
