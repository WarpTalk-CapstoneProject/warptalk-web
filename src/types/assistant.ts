export type AssistantMessageRole = "user" | "assistant" | "system" | "tool";
export type AssistantMessageStatus = "pending" | "streaming" | "completed" | "failed";

export interface AssistantMessageDto {
  id: string;
  conversationId: string;
  role: AssistantMessageRole;
  content: string;
  status: AssistantMessageStatus;
  createdAt: string;
  completedAt?: string | null;
  /**
   * The sources this answer cited, as the JSON array warptalk-ai published — see
   * lib/assistant/answer-sources. Absent on everything the user wrote, and on an answer that
   * cited nothing.
   */
  sourcesJson?: string | null;
}

export interface AssistantConversationDto {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt?: string | null;
  isArchived: boolean;
}

export interface AssistantConversationDetailDto extends AssistantConversationDto {
  messages: AssistantMessageDto[];
}

export interface SendAssistantMessageResponse {
  messageId: string;
  assistantMessageId: string;
}

export interface AssistantSkillDto {
  name: string;
  label: string;
  description: string;
}

/**
 * Ambient "what page is the user looking at" hint sent alongside a chat message.
 * Snapshot must stay a thin, display-only projection (id/title/status) — never raw
 * sensitive data; anything the assistant needs beyond that is fetched server-side by a
 * tool using the caller's own bearer token.
 */
export interface AssistantPageContextDto {
  pageType: string;
  entityId?: string;
  workspaceId?: string;
  snapshot?: Record<string, string>;
}

/**
 * An explicit "@mention" the user attached to this message (a room, document, or member
 * picked from the widget's @ menu) — as opposed to AssistantPageContextDto's ambient,
 * automatic page context. No workspaceId here: the backend scopes every mention to the
 * conversation's own workspace server-side.
 */
export interface AssistantMentionDto {
  entityType: "room" | "document" | "member";
  entityId: string;
  label?: string;
}
