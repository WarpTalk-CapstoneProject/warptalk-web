import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AssistantConversationDetailDto,
  AssistantConversationDto,
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

  sendMessage(conversationId: string, content: string) {
    return apiClient.post<SendAssistantMessageResponse>(API.assistant.sendMessage(conversationId), { content });
  },

  archiveConversation(id: string) {
    return apiClient.delete<void>(API.assistant.conversation(id));
  },
};
