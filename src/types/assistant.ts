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
  /**
   * Who the OAuth grant is with. Several rows share one provider — google_drive, google_calendar
   * and google_meet are all `google` — and since WT-646 a connection is keyed by this, not by
   * `key`, so disconnecting any one of them ends the grant for all of them.
   *
   * OPTIONAL BECAUSE THE BACKEND DOES NOT SEND IT YET. `Provider` is on `PluginDefinitionDto` and
   * on both admin catalog DTOs, but `PluginCatalogItemMapper.ToCatalogItem` does not copy it onto
   * `PluginCatalogItemDto`. Until it does, `pluginConnectionGroupKey` falls back to the shared
   * issuer of a row's required scopes; see src/lib/assistant/plugin-connection.ts.
   */
  provider?: string | null;
  /**
   * Why the active workspace's plugin policy refuses this row, or absent when nothing refuses it.
   *
   * A blocked row is still returned rather than hidden, deliberately: a user whose workspace
   * narrowed its allowlist under an already-connected plugin has to be able to see the row to
   * revoke the grant. Install and connect are refused; disconnect and disable are not.
   *
   * Always absent on the personal plugins page, which lists the catalog without naming a
   * workspace — the backend applies no workspace policy when no workspaceId is supplied.
   */
  workspacePolicyBlockReason?: string | null;
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
 * A "plugin" mention's entityId is the plugin's catalog key (e.g. "google_drive") — the same key
 * every install/connect/disconnect call takes. It names a capability the user wants used for this
 * turn, not a record to look up.
 */
export interface AssistantMentionDto {
  entityType: "room" | "document" | "member" | "plugin";
  entityId: string;
  label?: string;
}
