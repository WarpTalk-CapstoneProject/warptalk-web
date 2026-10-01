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
  /**
   * Which store the conversation lives in: "workspace", or "platform" for a system admin's
   * WarpBot in the admin portal. Absent from an older backend, which only had workspace ones.
   */
  scope?: "workspace" | "platform";
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
  /**
   * The workspace Owner's rule for this tool, beside the member's own `policy` (wave 2). Present
   * only on a catalog read with a workspace; absent or null is "member's choice". WarpBot gets the
   * stricter of the two, so `policy` stays what the member chose and this is what they cannot loosen.
   */
  workspacePolicy?: WorkspaceToolRule | null;
}

/**
 * What a workspace Owner may set for one tool across the workspace: ask every time, or never.
 * There is no workspace "allow" — it would overrule a member who blocked the tool themselves.
 * No rule (null) is "member's choice".
 */
export type WorkspaceToolRule = "approval" | "blocked";

/** One tool of a plugin with the workspace's rule for it. Mirrors `WorkspaceToolPolicyItemDto`. */
export interface WorkspaceToolPolicyItemDto {
  name: string;
  label: string;
  description: string;
  effect: "read" | "write";
  workspacePolicy: WorkspaceToolRule | null;
}

/**
 * GET/PUT /assistant/workspaces/{id}/plugins/{key}/tool-policies — Owner or Admin read; `canManage`
 * is true for the Owner only. PUT answers with the whole list again.
 */
export interface WorkspaceToolPoliciesDto {
  pluginKey: string;
  pluginLabel: string;
  canManage: boolean;
  tools: WorkspaceToolPolicyItemDto[];
}

/** PUT body. A null `policy` clears the rule back to "member's choice". */
export interface UpdateWorkspaceToolPolicyRequest {
  toolName: string;
  policy: WorkspaceToolRule | null;
}

/**
 * GET /assistant/tools?workspaceId= — what WarpBot is offered right now, for the caller, in that
 * workspace (/{slug}/tools). Built-in rows come from the AI worker's own tool registry (its manifest
 * in Redis, served by AssistantService); `platform_staff` rows are already filtered out server-side
 * for everyone else.
 */
export type WarpBotToolEffect = "read" | "write";
export type WarpBotToolAudience = "member" | "host" | "platform_staff";

export interface WarpBotBuiltInToolDto {
  name: string;
  /** One of the web's category ids (warpbot-tools-catalog.ts); anything else is shown as "other". */
  category: string;
  effect: WarpBotToolEffect;
  audience: WarpBotToolAudience;
  /** English one-liner from the tool schema. */
  description: string;
}

/**
 * `on`/`off`: the worker can search and a platform setting says whether it may. `unavailable`: the
 * worker has no web search configured. `unknown`: no manifest to tell.
 */
export type WarpBotWebSearchState = "on" | "off" | "unavailable" | "unknown";

export interface WarpBotPluginToolDto {
  name: string;
  label: string;
  description: string;
  effect: WarpBotToolEffect;
  /** The member's own choice. Never `blocked` here: blocked tools are not offered. */
  policy: PluginToolPolicy;
  /** The workspace Owner's rule; always present, null when there is none. */
  workspacePolicy: WorkspaceToolRule | null;
}

export interface WarpBotPluginToolsDto {
  pluginKey: string;
  label: string;
  tools: WarpBotPluginToolDto[];
}

export interface WarpBotToolsDto {
  manifestAvailable: boolean;
  manifestGeneratedAt: string | null;
  builtIn: WarpBotBuiltInToolDto[];
  webSearch: { state: WarpBotWebSearchState };
  plugins: WarpBotPluginToolsDto[];
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
   * `platform_disabled`: WarpTalk turned it off for this workspace — listed only for a member who
   * already installed it, whose connection is kept but unused.
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
  /**
   * True when the caller may add this plugin to the workspace the catalog was listed for — the
   * workspace Owner. Their row then offers Add instead of Request: an Owner asking themselves only
   * leaves a request nobody is notified about.
   *
   * Optional, and absent reads as "not the Owner": a server older than the flag gets the member's
   * Request, which it already accepts. Only meaningful on a `not_added` row.
   */
  canAdd?: boolean;
}

export type PluginAuthMode = "oauth" | "api_key";

export type WorkspacePluginAvailability = "added" | "private" | "not_added" | "platform_disabled";

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
  /**
   * Who `addedBy` is, when the server resolved it. Optional: without it the page looks the id up
   * among the workspace's members, and says nothing when neither knows.
   */
  addedByName?: string | null;
  addedAt?: string | null;
  /**
   * How members connect it. Absent from a server older than API-key auth, which only knows OAuth;
   * the page then says nothing about it rather than guessing.
   */
  authMode?: PluginAuthMode | null;
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

/**
 * GET /assistant/workspaces/{id}/plugins/{key}/members — Owner or Admin. One member who has the
 * plugin connected. Connection metadata only: no token, no provider account. Name and avatar come
 * from the workspace's member list (`useWorkspaceMemberProfiles`).
 */
export interface WorkspacePluginMemberDto {
  userId: string;
  /** `connected`, `expired` or `revoked`. */
  connectionStatus: "connected" | "expired" | "revoked" | string;
  connectedAt: string;
  /** Their last successful tool call through it in this workspace; null when they never made one here. */
  lastUsedAt?: string | null;
  toolCallCount: number;
}

/** GET /assistant/workspaces/{id}/plugins — Owner or Admin. */
export interface WorkspacePluginsOverviewDto {
  workspaceId: string;
  /**
   * False while the Owner has never edited the list. Such a workspace has the marketplace plugins
   * its members already use there (while the old "Allow personal plugins" switch is on) and no
   * others; the Owner's first change turns that into an explicit list.
   */
  isCurated: boolean;
  /**
   * Only the Owner changes the list; an Admin reads it. Optional on the type so a response without
   * it falls back to the caller's workspace role (see `canManageWorkspacePlugins`) instead of
   * reading as a yes.
   */
  canManage?: boolean;
  inWorkspace: WorkspacePluginItemDto[];
  marketplace: WorkspacePluginItemDto[];
  pendingRequests: WorkspacePluginRequestDto[];
  /**
   * Plugins this workspace had (on its list, or used by members) that the platform admin has since
   * turned off here. Not addable; members' connections are kept but unused. Optional for an older
   * server.
   */
  disabledByPlatform?: WorkspacePluginItemDto[];
}

export interface CreatePrivatePluginRequest {
  label: string;
  mcpServerUrl: string;
  description?: string;
  /** How members connect. Omitted means OAuth, which is all a server older than API-key auth knows. */
  authMode?: PluginAuthMode;
}

export interface UpdatePrivatePluginRequest {
  label?: string;
  description?: string;
  mcpServerUrl?: string;
  /** Sent only when the Owner changes it, so an unchanged form never rewrites how members connect. */
  authMode?: PluginAuthMode;
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
 *
 * WT-887: "summary" and "transcript" point at one meeting's summary or transcript. Their entityId
 * is the meeting's ROOM id — the same id a "room" mention carries — and the label is the meeting
 * title; the AI worker reads the artifact off the room. The worker also accepts "minutes", but has
 * no tool that reads minutes content, so the web never offers or sends it.
 */
export interface AssistantMentionDto {
  entityType: "room" | "document" | "member" | "plugin" | "summary" | "transcript";
  entityId: string;
  label?: string;
}
