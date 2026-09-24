/**
 * What the plugin marketplace's workspace verdict means on screen (2026-09-17).
 *
 * The server answers one question per catalog row — does the workspace the list was read for have
 * this plugin (`added`), own it (`private`), or not (`not_added`) — plus whether the caller already
 * asked for it. Everything the two plugin pages render from that answer is decided here, so the
 * member page and the owner page cannot disagree about it and the rules have node tests.
 *
 * Imports are type-only and relative: these files run under plain `node --test`.
 */

import type {
  AssistantPluginCatalogItemDto,
  CreatePrivatePluginRequest,
  PluginAuthMode,
  UpdatePrivatePluginRequest,
  WorkspacePluginItemDto,
  WorkspacePluginMemberDto,
  WorkspacePluginsOverviewDto,
} from "../../types/assistant.ts";

export type MemberPluginActionKind = "connect" | "request" | "requested" | "add";

export interface MemberPluginAction {
  kind: MemberPluginActionKind;
  /** The small line under the row, or null when the row needs none. */
  caption: string | null;
  /** Replaces the row's description, or null to keep the description. */
  subtitle: string | null;
}

/** Optional translator, defaulted to English so the node:test contract for this file (and any
 * caller that has not been migrated to next-intl) keeps working unchanged. */
export type MemberPluginActionTranslator = (key: string, values?: Record<string, string>) => string;

/**
 * The same optional-translator pattern for the owner page's copy, widened to interpolate numbers
 * (the usage line and the "N waiting" counts are ICU plurals in the catalog).
 *
 * Every function below takes one of these, already scoped to its own group in
 * `messages/{locale}/workspacePlugins.json` — the caller passes
 * `(key, values) => t(`facts.${key}`, values)`, exactly as `memberPluginAction` is called. The
 * default keeps the pre-i18n English, which is what this file's `node --test` contract asserts and
 * what any not-yet-migrated caller keeps rendering.
 */
export type WorkspacePluginCopyTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const DEFAULT_MEMBER_ACTION_COPY: Record<string, (values?: Record<string, string>) => string> = {
  addedByWorkspace: () => "Added by your workspace",
  notAddedYet: (v) => `Not added to ${v!.workspaceName} yet`,
  waitingForOwner: () => "Waiting for your workspace owner",
  thisWorkspace: () => "this workspace",
};

function defaultMemberActionT(key: string, values?: Record<string, string>): string {
  return DEFAULT_MEMBER_ACTION_COPY[key]?.(values) ?? key;
}

/**
 * The action on a member's catalog row.
 *
 * `request` only for a row the workspace does not have AND the member has not installed. An
 * installed row the workspace does not have stays `connect` — its dialog is where Disconnect and
 * Remove live, and a member holding a live grant must be able to revoke it whatever the workspace
 * decides. The page's own label logic (Connect / Manage / Reconnect) still applies to `connect`.
 *
 * `add` is the Owner's version of `request`: asking yourself for a plugin files a request nobody is
 * told about. It needs the server to say so (`canAdd`); absent, the row is a member's.
 */
export function memberPluginAction(
  plugin: Pick<
    AssistantPluginCatalogItemDto,
    "workspaceAvailability" | "requestStatus" | "installationStatus" | "canAdd"
  >,
  workspaceName: string | null | undefined,
  t: MemberPluginActionTranslator = defaultMemberActionT,
): MemberPluginAction {
  const availability = plugin.workspaceAvailability ?? null;

  if (availability === "private") {
    return { kind: "connect", caption: null, subtitle: t("addedByWorkspace") };
  }

  if (availability !== "not_added") {
    return { kind: "connect", caption: null, subtitle: null };
  }

  const notAdded = t("notAddedYet", { workspaceName: workspaceName?.trim() || t("thisWorkspace") });

  if (plugin.installationStatus === "installed") {
    return { kind: "connect", caption: notAdded, subtitle: null };
  }

  if (plugin.canAdd === true) {
    return { kind: "add", caption: notAdded, subtitle: null };
  }

  if (plugin.requestStatus === "pending") {
    return { kind: "requested", caption: t("waitingForOwner"), subtitle: null };
  }

  return { kind: "request", caption: notAdded, subtitle: null };
}

/**
 * Whether WarpBot's chat surfaces may offer this row — the plugin menu and the @mention list.
 *
 * A plugin the workspace has not added cannot run here: the server refuses its tools. Offering it
 * in chat is a switch that does nothing and a mention that goes nowhere. A member who connected it
 * earlier still finds it on their Plugins page, which is where it gets revoked. A row with no
 * verdict (no workspace, or a server older than the marketplace) is offered as before.
 */
export function isOfferedInWorkspaceChat(
  plugin: Pick<AssistantPluginCatalogItemDto, "workspaceAvailability">,
): boolean {
  return plugin.workspaceAvailability !== "not_added";
}

/**
 * Whether the caller may change the workspace's plugin list.
 *
 * The server's `canManage` wins whenever it is sent — it asked the workspace service. Without it
 * (an older response), only the Owner role reads as yes: an Admin may view the page, never act.
 */
export function canManageWorkspacePlugins(
  overview: Pick<WorkspacePluginsOverviewDto, "canManage"> | null | undefined,
  role: string | null | undefined,
): boolean {
  if (typeof overview?.canManage === "boolean") return overview.canManage;
  return role?.trim().toLowerCase() === "owner";
}

/**
 * The sidebar badge: pending requests, or null for none (no "0" badge).
 *
 * Null for a caller who cannot answer them, too. An Admin sees the page, but a count they can do
 * nothing about is a notification that never clears.
 */
export function pendingRequestBadge(
  overview: Pick<WorkspacePluginsOverviewDto, "pendingRequests"> | null | undefined,
  canAct: boolean,
): string | null {
  if (!canAct) return null;
  const count = overview?.pendingRequests?.length ?? 0;
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/**
 * The line under the header while the Owner has never edited the workspace's list.
 *
 * Until the first change, the server carries over only the marketplace plugins members already use
 * in this workspace (and none if the old "Allow personal plugins" switch is off). The rows say which
 * — so this names how many, and never claims the whole marketplace. It used to: "Every marketplace
 * plugin is available here", over a list the Owner had never chosen, which read as fake.
 *
 * Nothing carried over means nothing to explain: the empty state and the marketplace below say it.
 */
export function workspacePluginsTransitionNote(
  overview: Pick<WorkspacePluginsOverviewDto, "isCurated" | "inWorkspace" | "marketplace">,
  t: WorkspacePluginCopyTranslator = defaultTransitionT,
): string | null {
  if (overview.isCurated) return null;
  const carried = overview.inWorkspace.filter((plugin) => plugin.availability === "added").length;
  return carried > 0 ? t("carriedOver", { count: carried }) : null;
}

const DEFAULT_TRANSITION_COPY: Record<string, (values?: Record<string, string | number>) => string> = {
  carriedOver: (v) =>
    `Nothing has been chosen for this workspace yet, so it keeps the ${v!.count === 1 ? "plugin" : `${v!.count} plugins`} members already use here until you change this list.`,
};

function defaultTransitionT(key: string, values?: Record<string, string | number>): string {
  return DEFAULT_TRANSITION_COPY[key]?.(values) ?? key;
}

const DEFAULT_FACTS_COPY: Record<string, (values?: Record<string, string | number>) => string> = {
  notUsedYet: () => "Not used by any member yet",
  usedBy: (v) => `Used by ${v!.count} member${v!.count === 1 ? "" : "s"}`,
  addedBy: (v) => `added by ${v!.name}`,
  onlyThisWorkspace: () => "only this workspace",
  apiKeyPerMember: () => "each member pastes an API key",
  onlyThisWorkspaceAlone: () => "Only this workspace",
};

function defaultFactsT(key: string, values?: Record<string, string | number>): string {
  return DEFAULT_FACTS_COPY[key]?.(values) ?? key;
}

/** The Manage dialog's usage line. Never claims connections the server cannot count per workspace. */
export function describeMembersUsed(
  count: number | null | undefined,
  t: WorkspacePluginCopyTranslator = defaultFactsT,
): string {
  if (!count || count <= 0) return t("notUsedYet");
  return t("usedBy", { count });
}

/** Who added a plugin: the server's name for them, else the member lookup's, else nobody. */
export function pluginAddedByName(
  plugin: Pick<WorkspacePluginItemDto, "addedBy" | "addedByName">,
  memberNames: Readonly<Record<string, string>>,
): string | null {
  const fromServer = plugin.addedByName?.trim();
  if (fromServer) return fromServer;
  return plugin.addedBy ? memberNames[plugin.addedBy] ?? null : null;
}

/** The Manage dialog's one line of facts, e.g. "Used by 5 members · added by Linh". */
export function workspacePluginFacts(
  plugin: Pick<WorkspacePluginItemDto, "availability" | "membersUsedCount" | "authMode">,
  addedByName: string | null,
  t: WorkspacePluginCopyTranslator = defaultFactsT,
): string {
  return [
    describeMembersUsed(plugin.membersUsedCount, t),
    addedByName ? t("addedBy", { name: addedByName }) : null,
    plugin.availability === "private" ? t("onlyThisWorkspace") : null,
    plugin.authMode === "api_key" ? t("apiKeyPerMember") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The owner page's second line for a row in "In this workspace". */
export function workspacePluginSubtitle(
  plugin: Pick<WorkspacePluginItemDto, "availability" | "description" | "mcpServerUrl">,
  t: WorkspacePluginCopyTranslator = defaultFactsT,
): string {
  if (plugin.availability !== "private") return plugin.description;
  const host = hostOf(plugin.mcpServerUrl);
  const where = host ?? plugin.description;
  return where ? `${where} · ${t("onlyThisWorkspace")}` : t("onlyThisWorkspaceAlone");
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return null;
  }
}

export interface PrivatePluginDraft {
  label: string;
  mcpServerUrl: string;
  description: string;
  /** How members connect: their own OAuth sign-in, or an API key each of them pastes. */
  authMode: PluginAuthMode;
}

export type PrivatePluginDraftErrors = Partial<Record<keyof PrivatePluginDraft, string>>;

/**
 * The form's own check before a private plugin is sent. The server re-checks all of it and also
 * refuses private and internal addresses; this only catches what can be told from the text.
 */
export function validatePrivatePluginDraft(
  draft: PrivatePluginDraft,
  t: WorkspacePluginCopyTranslator = defaultDraftErrorT,
): PrivatePluginDraftErrors {
  const errors: PrivatePluginDraftErrors = {};
  const label = draft.label.trim();
  if (!label) errors.label = t("labelRequired");
  else if (label.length > 150) errors.label = t("labelTooLong");

  const url = draft.mcpServerUrl.trim();
  let parsed: URL | null = null;
  try {
    parsed = url ? new URL(url) : null;
  } catch {
    parsed = null;
  }
  if (!url) errors.mcpServerUrl = t("urlRequired");
  else if (!parsed || parsed.protocol !== "https:") errors.mcpServerUrl = t("urlNotHttps");

  if (draft.description.trim().length > 500) errors.description = t("descriptionTooLong");
  return errors;
}

const DEFAULT_DRAFT_ERROR_COPY: Record<string, string> = {
  labelRequired: "Give the plugin a name.",
  labelTooLong: "Keep the name under 150 characters.",
  urlRequired: "Enter the MCP server URL.",
  urlNotHttps: "Use an https:// URL.",
  descriptionTooLong: "Keep the description under 500 characters.",
};

function defaultDraftErrorT(key: string): string {
  return DEFAULT_DRAFT_ERROR_COPY[key] ?? key;
}

/** The create body. `authMode` is always sent; a server older than API-key auth ignores it. */
export function createPrivatePluginRequest(draft: PrivatePluginDraft): CreatePrivatePluginRequest {
  return {
    label: draft.label.trim(),
    mcpServerUrl: draft.mcpServerUrl.trim(),
    description: draft.description.trim() || undefined,
    authMode: draft.authMode,
  };
}

/**
 * The edit body. `authMode` only when the Owner changed it: switching how members connect can
 * leave their existing connections unusable, so an edit to the name must never do it by accident.
 * A row with no `authMode` is an OAuth row — the only kind a server without the field has.
 */
export function privatePluginUpdateRequest(
  plugin: Pick<WorkspacePluginItemDto, "authMode">,
  draft: PrivatePluginDraft,
): UpdatePrivatePluginRequest {
  const request: UpdatePrivatePluginRequest = {
    label: draft.label.trim(),
    description: draft.description.trim(),
    mcpServerUrl: draft.mcpServerUrl.trim(),
  };
  if ((plugin.authMode ?? "oauth") !== draft.authMode) request.authMode = draft.authMode;
  return request;
}

/** Matches plugin_requests.reason VARCHAR(500). */
export const PLUGIN_REQUEST_REASON_MAX = 500;

/**
 * A failed request's plain-text body, when that is how the server explained it.
 *
 * ASP.NET's `Conflict("...")` and friends answer text/plain, which `getErrorMessage` does not read:
 * it looks for `{ error }` / `{ message }` and otherwise falls back to a status sentence — for a 503
 * that is "Too many requests…", the opposite of what the server said. Markup (a proxy's HTML
 * error page) and anything too long to be a sentence are not a message.
 */
export function plainTextErrorBody(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } } | null | undefined)?.response?.data;
  if (typeof data !== "string") return null;
  const text = data.trim();
  if (!text || text.length > 300 || text.startsWith("<")) return null;
  return text;
}

export interface MemberNamePage {
  items: ReadonlyArray<{
    userId: string;
    fullName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  }>;
  total?: number | null;
}

/** A member as the Manage dialog shows them: a name to read and, when they have one, a face. */
export interface MemberProfile {
  name: string;
  avatarUrl: string | null;
}

/**
 * Display names for the given user ids, read from the workspace's member list a page at a time.
 *
 * The owner page used to read only the first 100 members, so every request from member 101 on read
 * "A member asked for…". This pages until every id is found, the list runs out, or `maxPages` is
 * reached. An id that is never found (the member left) is simply absent from the answer.
 */
export async function collectMemberNames(
  userIds: readonly (string | null | undefined)[],
  fetchPage: (page: number, pageSize: number) => Promise<MemberNamePage>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<Record<string, string>> {
  const profiles = await collectMemberProfiles(userIds, fetchPage, options);
  return Object.fromEntries(Object.entries(profiles).map(([userId, profile]) => [userId, profile.name]));
}

/**
 * Name and avatar for the given user ids, from the workspace's member list a page at a time — the
 * same walk as `collectMemberNames`, for the Manage dialog's "who connected this". An id never found
 * (the member left) is absent, and a member with neither a name nor an email is absent too: the
 * dialog then says "A former member" rather than printing an id.
 */
export async function collectMemberProfiles(
  userIds: readonly (string | null | undefined)[],
  fetchPage: (page: number, pageSize: number) => Promise<MemberNamePage>,
  { pageSize = 100, maxPages = 50 }: { pageSize?: number; maxPages?: number } = {},
): Promise<Record<string, MemberProfile>> {
  const missing = new Set(userIds.filter((id): id is string => !!id));
  const profiles: Record<string, MemberProfile> = {};
  let fetched = 0;

  for (let page = 1; missing.size > 0 && page <= maxPages; page += 1) {
    const { items, total } = await fetchPage(page, pageSize);
    for (const member of items) {
      if (!missing.has(member.userId)) continue;
      missing.delete(member.userId);
      const name = member.fullName?.trim() || member.email?.trim();
      if (name) profiles[member.userId] = { name, avatarUrl: member.avatarUrl?.trim() || null };
    }
    fetched += items.length;
    if (items.length === 0) break;
    if (typeof total === "number" ? fetched >= total : items.length < pageSize) break;
  }

  return profiles;
}

/** One row of the Manage dialog's "who connected this". */
export interface WorkspacePluginMemberRow extends WorkspacePluginMemberDto {
  /** Null when the member is no longer in the list (they left since connecting). */
  name: string | null;
  avatarUrl: string | null;
}

/**
 * The server's members, in the server's order (most recently used first), with the names and faces
 * only the workspace's member list knows. The server sends ids and connection metadata only.
 */
export function workspacePluginMemberRows(
  members: readonly WorkspacePluginMemberDto[] | null | undefined,
  profiles: Readonly<Record<string, MemberProfile>>,
): WorkspacePluginMemberRow[] {
  return (members ?? []).map((member) => ({
    ...member,
    name: profiles[member.userId]?.name ?? null,
    avatarUrl: profiles[member.userId]?.avatarUrl ?? null,
  }));
}
