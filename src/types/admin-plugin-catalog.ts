/**
 * Contracts for the system-admin plugin catalog (`~/api/v1/assistant/plugins/catalog`).
 *
 * The assistant service could only ever INSERT a catalog row. Everything after that — a wrong
 * OAuth client id, a tool that needed adding, a row that needed retiring — was hand-written SQL
 * against a running database. WT-646 added the rest of the lifecycle; these are its shapes.
 *
 * TWO THINGS TO KNOW BEFORE EDITING THIS FILE.
 *
 * 1. NO ENDPOINT EVER RETURNS A CLIENT SECRET. Not masked, not truncated, not the first four
 *    characters. `hasClientSecret` and `credentialsUpdatedAt` are the whole of what can be learned
 *    about one, and there is deliberately no field here to hold a value — a type with nowhere to
 *    put a secret cannot grow a UI that renders one.
 *
 * 2. THE `oAuth…` PREFIX IS NOT A TYPO. The service serialises with
 *    `JsonSerializerDefaults.Web`, whose camelCase policy lowercases only the leading run of
 *    capitals that is followed by another capital: `OAuthClientSource` on the C# record arrives on
 *    the wire as `oAuthClientSource`, not `oauthClientSource`. Spelling it the "obvious" way here
 *    would compile, typecheck, and silently read `undefined` for every OAuth field on the page —
 *    which is the same class of quiet wrong-value failure that put an empty `client_id` into
 *    production in the first place. `admin-plugin-catalog.service.ts` therefore accepts both
 *    spellings on the way in and normalises to these names.
 */

/** Which integration path serves a row. Dispatch key, not decoration. */
export type AdminPluginKind = "native" | "mcp";

/**
 * Which rung of the MCP client-registration ladder a row settled on.
 *
 * `unresolved` is the honest state of a row nobody has connected yet — the ladder chooses on the
 * first connect. `preregistered` is the only source that asserts the row itself holds a client id.
 */
export type AdminPluginOAuthClientSource = "unresolved" | "preregistered" | "cimd" | "dcr";

/** One tool in a row's manifest, as `tools_json` stores it. */
export interface AdminPluginToolDto {
  name: string;
  pluginKey: string;
  label: string;
  description: string;
  effect: "read" | "write";
  requiredScopes: string[];
  parameters: Record<string, unknown>;
  resourceKey?: string | null;
  resourceLabel?: string | null;
  resourceAvatarUrl?: string | null;
}

/**
 * A row in the admin listing — including rows retired with `isActive: false`, which is exactly the
 * set the user-facing catalog hides and the set an operator most needs to see.
 */
export interface AdminPluginCatalogListItemDto {
  pluginKey: string;
  label: string;
  description: string;
  kind: AdminPluginKind;
  provider: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  category: string | null;
  oAuthClientSource: AdminPluginOAuthClientSource;
  hasClientId: boolean;
  hasClientSecret: boolean;
  toolCount: number;
  installationCount: number;
}

/** One row in full, with the tool manifest `PUT .../tools` replaces. */
export interface AdminPluginCatalogDetailDto {
  pluginKey: string;
  label: string;
  description: string;
  avatarUrl: string | null;
  kind: AdminPluginKind;
  provider: string;
  mcpServerUrl: string | null;
  requiredScopes: string[];
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  category: string | null;
  oAuthClientSource: AdminPluginOAuthClientSource;
  /**
   * Present, while the secret is not, and the asymmetry is the service's decision rather than an
   * oversight: a client id travels in every authorization URL the user's own browser follows, so
   * an operator rotating credentials has to be able to confirm which id the row now holds.
   */
  oAuthClientId: string | null;
  hasClientId: boolean;
  hasClientSecret: boolean;
  /**
   * The row's own `updated_at`, not a dedicated "secret last set" column — the catalog has none.
   * Any edit bumps it, so it is an upper bound on when the secret was written. Null when there is
   * no secret, so nothing is tempted to render "set on …" for a row that never had one.
   */
  credentialsUpdatedAt: string | null;
  oAuthAuthorizationEndpoint: string | null;
  oAuthTokenEndpoint: string | null;
  oAuthRevokeEndpoint: string | null;
  oAuthRegistrationEndpoint: string | null;
  oAuthTokenEndpointAuthMethod: string | null;
  /** When the MCP server last told us its tools. Null after a hand-authored manifest. */
  toolsSyncedAt: string | null;
  tools: AdminPluginToolDto[];
  installationCount: number;
  connectionCount: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A partial edit. Only the properties present are written; see the field notes. */
export interface UpdateAdminPluginRequest {
  label?: string;
  description?: string;
  /** Empty string clears it. Sending null is indistinguishable from omitting the property. */
  avatarUrl?: string;
  mcpServerUrl?: string;
  requiredScopes?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  /** Empty string clears it. */
  category?: string;
}

/**
 * Sets or rotates a row's pre-registered OAuth client.
 *
 * `clientSecret` is TRI-STATE and the type says so: the property absent leaves the stored secret
 * alone, `""` clears it, and a value replaces it. `undefined` must therefore be serialised as an
 * absent property, never as `null` — see the service, which strips it.
 */
export interface SetAdminPluginOAuthClientRequest {
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  revokeEndpoint?: string;
}

/** One entry of a submitted manifest. `pluginKey` is stamped from the route, never sent. */
export interface AdminPluginToolManifestEntry {
  name: string;
  label: string;
  description: string;
  effect: string;
  requiredScopes: string[];
  parameters: Record<string, unknown>;
  resourceKey?: string | null;
  resourceLabel?: string | null;
  resourceAvatarUrl?: string | null;
}

/** Replaces `tools_json` wholesale. An empty array means "this row advertises no tools". */
export interface ReplaceAdminPluginToolsRequest {
  tools: AdminPluginToolManifestEntry[];
}

/** What a delete actually did, so the caller need not infer it from the status code. */
export interface AdminPluginDeleteResultDto {
  pluginKey: string;
  hardDeleted: boolean;
  installationCount: number;
  connectionCount: number;
}

/** One recorded tool invocation. */
export interface AdminPluginToolAuditEntryDto {
  id: string;
  workspaceId: string | null;
  userId: string;
  conversationId: string | null;
  assistantMessageId: string | null;
  pluginKey: string;
  toolName: string;
  /** The leading 500 characters of the tool arguments. Can hold whatever a user typed. */
  inputSummary: string | null;
  /** `"ok"`, or the error code the call failed with — the recorder writes the code as the status. */
  resultStatus: string;
  providerResourceRef: string | null;
  createdAt: string;
}

/** A page of audits, newest first. `totalCount`, not `total` — this endpoint is its own shape. */
export interface AdminPluginToolAuditPageDto {
  items: AdminPluginToolAuditEntryDto[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface AdminPluginToolAuditQuery {
  page?: number;
  pageSize?: number;
  userId?: string;
  outcome?: string;
}
