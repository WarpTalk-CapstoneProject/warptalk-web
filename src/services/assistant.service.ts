import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AssistantConversationDetailDto,
  AssistantConversationDto,
  AssistantMentionDto,
  AssistantPageContextDto,
  AssistantSkillDto,
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
     * WT-474 — screenshots pasted into the composer, as `data:image/...;base64,...` strings.
     *
     * They belong to THIS TURN. Nothing stores them, so a follow-up question cannot see the
     * picture — the composer says so, because a user who pastes once and then asks "and the red
     * box?" would otherwise get a confident answer about nothing.
     */
    images?: string[]
  ) {
    return apiClient.post<SendAssistantMessageResponse>(API.assistant.sendMessage(conversationId), {
      content,
      pageContext: pageContext ?? undefined,
      mentions: mentions?.length ? mentions : undefined,
      images: images?.length ? images : undefined,
    });
  },

  archiveConversation(id: string) {
    return apiClient.delete<void>(API.assistant.conversation(id));
  },

  getSkills() {
    return apiClient.get<AssistantSkillDto[]>(API.assistant.skills);
  },
};
