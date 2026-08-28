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

export type AssistantPluginInstallationStatus =
  | "not_installed"
  | "installed"
  | "disabled";

export type AssistantPluginConnectionStatus =
  | "not_connected"
  | "connected"
  | "expired"
  | "revoked";

export interface McpToolDescriptorDto {
  name: string;
  pluginKey: string;
  label: string;
  description: string;
  effect: "read" | "write";
  requiredScopes: string[];
  parameters: Record<string, unknown>;
  /**
   * Groups this tool with its siblings for catalog display (e.g. a plugin whose single OAuth
   * connection covers two distinct products can render one tile per product). Absent when the
   * plugin's tools are not grouped.
   */
  resourceKey?: string | null;
  resourceLabel?: string | null;
  resourceAvatarUrl?: string | null;
}

export interface AssistantPluginCatalogItemDto {
  key: string;
  label: string;
  description: string;
  avatarUrl?: string | null;
  requiredScopes: string[];
  installationStatus: AssistantPluginInstallationStatus;
  connectionStatus: AssistantPluginConnectionStatus;
  connectedAccountEmail?: string | null;
  tools: McpToolDescriptorDto[];
  /** Scopes actually granted at the provider's consent screen — a subset of requiredScopes when the user declined some. */
  grantedScopes: string[];
}

export interface PluginConnectUrlDto {
  url: string;
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
 * An explicit "@mention" the user attached to this message (a room, document, member, or
 * installed plugin picked from the widget's @ menu) — as opposed to AssistantPageContextDto's
 * ambient, automatic page context. No workspaceId here: the backend scopes every mention to the
 * conversation's own workspace server-side.
 *
 * A "plugin" mention's entityId is the plugin's catalog key, or `${pluginKey}:${resourceKey}`
 * for a split tile (e.g. "google_workspace:drive") — see PluginDisplayTile.tileId. It names a
 * capability the user wants used for this turn, not a record to look up.
 */
export interface AssistantMentionDto {
  entityType: "room" | "document" | "member" | "plugin";
  entityId: string;
  label?: string;
}
