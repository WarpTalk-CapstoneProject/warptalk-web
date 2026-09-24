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
 * The line under the header while the workspace is still on the pre-marketplace default.
 *
 * Until the first change, the server judges the workspace by its old "Allow personal plugins"
 * switch: on, every marketplace plugin reads as added; off, none does. The rows already say which,
 * so no second field is needed — and claiming "every plugin is available" for a workspace whose
 * switch was off told the Owner the opposite of what members see.
 */
export function workspacePluginsTransitionNote(
  overview: Pick<WorkspacePluginsOverviewDto, "isCurated" | "inWorkspace" | "marketplace">,
): string | null {
  if (overview.isCurated) return null;
  if (overview.inWorkspace.some((plugin) => plugin.availability === "added")) {
    return "Every marketplace plugin is available here until this list is changed.";
  }
  if (overview.marketplace.length > 0) {
    return "No marketplace plugin is available here yet. Plugins were switched off in this workspace's old settings.";
  }
  return null;
}

/** The Manage dialog's usage line. Never claims connections the server cannot count per workspace. */
export function describeMembersUsed(count: number | null | undefined): string {
  if (!count || count <= 0) return "Not used by any member yet";
  return `Used by ${count} member${count === 1 ? "" : "s"}`;
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
): string {
  return [
    describeMembersUsed(plugin.membersUsedCount),
    addedByName ? `added by ${addedByName}` : null,
    plugin.availability === "private" ? "only this workspace" : null,
    plugin.authMode === "api_key" ? "each member pastes an API key" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The owner page's second line for a row in "In this workspace". */
export function workspacePluginSubtitle(
  plugin: Pick<WorkspacePluginItemDto, "availability" | "description" | "mcpServerUrl">,
): string {
  if (plugin.availability !== "private") return plugin.description;
  const host = hostOf(plugin.mcpServerUrl);
  const where = host ?? plugin.description;
  return where ? `${where} · only this workspace` : "Only this workspace";
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
export function validatePrivatePluginDraft(draft: PrivatePluginDraft): PrivatePluginDraftErrors {
  const errors: PrivatePluginDraftErrors = {};
  const label = draft.label.trim();
  if (!label) errors.label = "Give the plugin a name.";
  else if (label.length > 150) errors.label = "Keep the name under 150 characters.";

  const url = draft.mcpServerUrl.trim();
  let parsed: URL | null = null;
  try {
    parsed = url ? new URL(url) : null;
  } catch {
    parsed = null;
  }
  if (!url) errors.mcpServerUrl = "Enter the MCP server URL.";
  else if (!parsed || parsed.protocol !== "https:") errors.mcpServerUrl = "Use an https:// URL.";

  if (draft.description.trim().length > 500) errors.description = "Keep the description under 500 characters.";
  return errors;
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
  items: ReadonlyArray<{ userId: string; fullName?: string | null; email?: string | null }>;
  total?: number | null;
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
  { pageSize = 100, maxPages = 50 }: { pageSize?: number; maxPages?: number } = {},
): Promise<Record<string, string>> {
  const missing = new Set(userIds.filter((id): id is string => !!id));
  const names: Record<string, string> = {};
  let fetched = 0;

  for (let page = 1; missing.size > 0 && page <= maxPages; page += 1) {
    const { items, total } = await fetchPage(page, pageSize);
    for (const member of items) {
      if (!missing.has(member.userId)) continue;
      missing.delete(member.userId);
      const name = member.fullName?.trim() || member.email?.trim();
      if (name) names[member.userId] = name;
    }
    fetched += items.length;
    if (items.length === 0) break;
    if (typeof total === "number" ? fetched >= total : items.length < pageSize) break;
  }

  return names;
}
