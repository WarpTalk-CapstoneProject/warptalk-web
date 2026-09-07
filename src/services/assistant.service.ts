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

  listPlugins() {
    return apiClient.get<AssistantPluginCatalogItemDto[]>(API.assistant.plugins);
  },

  installPlugin(pluginKey: string) {
    return apiClient.post<AssistantPluginCatalogItemDto>(API.assistant.installPlugin(pluginKey));
  },

  getPluginConnectUrl(pluginKey: string) {
    return apiClient.get<PluginConnectUrlDto>(API.assistant.pluginConnectUrl(pluginKey));
  },

  disconnectPlugin(pluginKey: string) {
    return apiClient.delete<void>(API.assistant.pluginConnection(pluginKey));
  },

  disablePlugin(pluginKey: string) {
    return apiClient.delete<void>(API.assistant.disablePlugin(pluginKey));
  },
};
