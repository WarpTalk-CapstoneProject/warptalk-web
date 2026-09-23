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
  /**
   * The @mentions a USER message was sent with, as the JSON array the send path stored:
   * [{ entityType, entityId, label, workspaceId }] — see lib/assistant/message-mentions. Absent on
   * every answer, on a message sent with no mentions, and on anything sent before the column
   * existed.
   */
  mentionsJson?: string | null;
}

/**
 * One turn a new conversation starts with — how a meeting's WarpBot thread continues in the
 * widget (see lib/assistant/meeting-handoff.ts). The service accepts "user" and "assistant" only.
 */
export interface AssistantSeedMessageDto {
  role: "user" | "assistant";
  content: string;
}

export interface CreateAssistantConversationOptions {
  /** Named after where it came from, so history does not list it as one more "New chat". */
  title?: string;
  seedMessages?: AssistantSeedMessageDto[];
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

/**
 * What a user allows WarpBot to do with one tool. WT-687.
 *
 * `allow` runs without asking, `approval` shows a confirmation card first, `blocked` is never
 * offered to WarpBot and refused if called.
 */
export type PluginToolPolicy = "allow" | "approval" | "blocked";

export interface McpToolDescriptorDto {
  name: string;
  pluginKey: string;
  label: string;
  description: string;
  effect: "read" | "write";
  requiredScopes: string[];
  parameters: Record<string, unknown>;
  /**
   * This user's resolved choice for the tool. WT-687. Optional on the type because a server older
   * than the setting sends nothing; `toolPolicyOf` falls back to the effect in that case.
   */
  policy?: PluginToolPolicy;
}

/**
 * One recorded plugin tool call in a workspace, as its Owner or Admin sees it. WT-646.
 *
 * Mirrors `PluginToolAuditDto` in the assistant service. Deliberately carries no argument text:
 * the row's `input_summary` holds what a member typed (search terms, event titles, file names),
 * and the server leaves it out of this view on purpose. Do not add it here.
 */
export interface WorkspacePluginToolAuditDto {
  id: string;
  userId: string;
  conversationId?: string | null;
  pluginKey: string;
  toolName: string;
  /** "success", or the error code the call failed with (e.g. `permission_denied`). */
  resultStatus: string;
  /** What the provider says the call touched — a file or event id — when it says anything. */
  providerResourceRef?: string | null;
  createdAt: string;
}

export interface WorkspacePluginToolAuditQuery {
  workspaceId: string;
  pluginKey?: string;
  userId?: string;
  skip: number;
  take: number;
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
   * Optional on the type, not on the wire: `PluginCatalogItemMapper.ToCatalogItem` copies it as of
   * WT-646, but a server older than that sends nothing here, and so does any row an operator adds
   * without one. `pluginConnectionGroupKey` falls back to the shared issuer of a row's required
   * scopes in those cases; see src/lib/assistant/plugin-connection.ts.
   */
  provider?: string | null;
  /**
   * Operator curation, set from the admin catalog surface. Optional on the type because a server
   * older than WT-646 sends none of them, in which case ordering falls back to label alone.
   */
  isFeatured?: boolean;
  /** Ascending. Ties are broken by label. */
  sortOrder?: number;
  /** Null on every row today; grouping by it is only worth doing once rows carry one. */
  category?: string | null;
  /**
   * Why the active workspace's plugin policy refuses this row, or absent when nothing refuses it.
   *
   * A blocked row is still returned rather than hidden, deliberately: a user whose workspace
   * switched plugins off under an already-connected one has to be able to see the row to revoke
   * the grant. Install and connect are refused; disconnect and disable are not.
   *
   * Present only when the catalog was listed with a `workspaceId`. The plugins page supplies the
   * active workspace, so it gets a verdict; a caller that omits it gets no workspace policy at all
   * and this field is always absent.
   */
  workspacePolicyBlockReason?: string | null;
  /**
   * Whether the workspace the catalog was listed for has this plugin (plugin marketplace,
   * 2026-09-17). `added`: a marketplace plugin the workspace has. `private`: an MCP plugin the
   * workspace's Owner created, visible only there. `not_added`: a member may ask the Owner for it.
   * Absent when the catalog was listed without a workspace, or by a server older than the marketplace.
   */
  workspaceAvailability?: WorkspacePluginAvailability | null;
  /** `pending` when the caller has already asked this workspace's Owner for the plugin. */
  requestStatus?: PluginRequestStatus | null;
  /**
   * How a user connects. `oauth`: the provider's own sign-in page. `api_key`: each user pastes a
   * key of their own, which the server checks against the MCP server before saving. Absent from a
   * server older than API-key auth, which only knows OAuth.
   */
  authMode?: PluginAuthMode;
}

export type PluginAuthMode = "oauth" | "api_key";

export type WorkspacePluginAvailability = "added" | "private" | "not_added";

export type PluginRequestStatus = "pending" | "approved" | "declined";

/** One plugin as the workspace Owner's Plugins page shows it. */
export interface WorkspacePluginItemDto {
  key: string;
  provider: string;
  label: string;
  description: string;
  avatarUrl?: string | null;
  kind: string;
  availability: WorkspacePluginAvailability;
  /** Only for a private plugin, which the Owner created and may edit. */
  mcpServerUrl?: string | null;
  /** Null for a row seeded by the transition, and for every marketplace candidate. */
  addedBy?: string | null;
  addedAt?: string | null;
  /**
   * Distinct members who have run one of its tools in this workspace. Connections are personal, so
   * "members connected" is not something the server can count per workspace; this is.
   */
  membersUsedCount: number;
}

export interface WorkspacePluginRequestDto {
  id: string;
  workspaceId: string;
  pluginKey: string;
  pluginLabel: string;
  pluginAvatarUrl?: string | null;
  requestedBy: string;
  reason?: string | null;
  status: PluginRequestStatus;
  createdAt: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
}

/** GET /assistant/workspaces/{id}/plugins — Owner or Admin. */
export interface WorkspacePluginsOverviewDto {
  workspaceId: string;
  /**
   * False while the workspace is still on the pre-marketplace "Allow personal plugins" default:
   * every marketplace plugin then reads as added (or none does, if the switch was off), and the
   * Owner's first change turns that into an explicit list.
   */
  isCurated: boolean;
  /** Only the Owner changes the list; an Admin reads it. */
  canManage: boolean;
  inWorkspace: WorkspacePluginItemDto[];
  marketplace: WorkspacePluginItemDto[];
  pendingRequests: WorkspacePluginRequestDto[];
}

export interface CreatePrivatePluginRequest {
  label: string;
  mcpServerUrl: string;
  description?: string;
}

export interface UpdatePrivatePluginRequest {
  label?: string;
  description?: string;
  mcpServerUrl?: string;
}

/**
 * The answer to "connect this plugin".
 *
 * `connected: true` means the provider's existing grant already covered the plugin, so the server
 * connected it on the spot and there is no consent page to open (`url` is null). Otherwise `url`
 * is the provider's consent page.
 */
export interface PluginConnectResultDto {
  connected: boolean;
  url: string | null;
  /** An `api_key` plugin: no consent page exists, the user pastes a key on the plugins page. */
  apiKeyRequired?: boolean;
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
