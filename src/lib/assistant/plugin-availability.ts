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
  WorkspacePluginItemDto,
  WorkspacePluginsOverviewDto,
} from "../../types/assistant.ts";

export type MemberPluginActionKind = "connect" | "request" | "requested";

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
 */
export function memberPluginAction(
  plugin: Pick<AssistantPluginCatalogItemDto, "workspaceAvailability" | "requestStatus" | "installationStatus">,
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

  if (plugin.requestStatus === "pending") {
    return { kind: "requested", caption: t("waitingForOwner"), subtitle: null };
  }

  return { kind: "request", caption: notAdded, subtitle: null };
}

/** The sidebar badge: pending requests, or null for none (no "0" badge). */
export function pendingRequestBadge(
  overview: Pick<WorkspacePluginsOverviewDto, "pendingRequests"> | null | undefined,
): string | null {
  const count = overview?.pendingRequests?.length ?? 0;
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/** The Manage dialog's usage line. Never claims connections the server cannot count per workspace. */
export function describeMembersUsed(count: number | null | undefined): string {
  if (!count || count <= 0) return "No member has used it here yet";
  return `${count} member${count === 1 ? " has" : "s have"} used it here`;
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

/** Matches plugin_requests.reason VARCHAR(500). */
export const PLUGIN_REQUEST_REASON_MAX = 500;
