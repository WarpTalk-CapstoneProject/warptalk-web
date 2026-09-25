/**
 * Contracts for the platform admin's per-workspace plugin controls (owner request 2026-09-25:
 * "cần bật tắt hiển thị ở các workspace").
 *
 * THE LAYERS, as the assistant service applies them on every catalog listing, install, connect and
 * WarpBot tool call: retired > per-workspace override > plan rule > default — and only then the
 * workspace Owner's own list. The platform decides what an Owner MAY add; the Owner decides what the
 * workspace HAS. Turning a plugin off never deletes a member's connection: it is kept, inert.
 */

import type { AdminPluginWorkspaceDefault } from "./admin-plugin-catalog.ts";

export type { AdminPluginWorkspaceDefault };

/** Which layer decided a workspace's state. Everything but `override` is "inherited". */
export type PluginWorkspaceSource = "retired" | "override" | "plan" | "default";

export type PluginOverrideState = "enabled" | "disabled";

export type PluginOverrideAction = "enable" | "disable" | "reset";

export interface AdminPluginAvailabilityDto {
  default: AdminPluginWorkspaceDefault;
  /** Null: every plan. */
  allowedPlans: string[] | null;
}

export interface SetAdminPluginAvailabilityRequest {
  default: AdminPluginWorkspaceDefault;
  /** Empty or omitted: every plan. */
  allowedPlans?: string[];
}

/** One marketplace plugin in one workspace. The same row backs both admin tabs. */
export interface AdminPluginWorkspaceRowDto {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  /** `active` or `suspended`. Deleted workspaces are never listed. */
  workspaceStatus: string;
  planSlug: string | null;
  memberCount: number;
  pluginKey: string;
  pluginLabel: string;
  pluginAvatarUrl: string | null;
  pluginKind: string;
  pluginDefault: AdminPluginWorkspaceDefault;
  allowedPlans: string[] | null;
  /** The platform's verdict: may this workspace have the plugin at all. */
  enabled: boolean;
  source: PluginWorkspaceSource;
  overrideState: PluginOverrideState | null;
  overrideReason: string | null;
  overrideSetBy: string | null;
  overrideSetAt: string | null;
  /** The workspace Owner's list holds it (or carries it over from before the marketplace). */
  onWorkspaceList: boolean;
  /** Enabled, and on the list or connected by a member — what "Workspaces using it" counts. */
  inUse: boolean;
  /** Active members of the workspace who connected it. */
  connectedUserIds: string[];
  /** Successful WarpBot tool calls of the plugin in this workspace. */
  usageCount: number;
  lastUsedAt: string | null;
}

export interface AdminPluginWorkspacesDto {
  pluginKey: string;
  label: string;
  availability: AdminPluginAvailabilityDto;
  workspaces: AdminPluginWorkspaceRowDto[];
}

export interface AdminWorkspacePluginsDto {
  workspaceId: string;
  workspaceName: string;
  planSlug: string | null;
  plugins: AdminPluginWorkspaceRowDto[];
}

/**
 * Bulk. `workspaceIds` alone: exactly those. `planSlugs` alone: every workspace on those plans.
 * Both: only the chosen workspaces that are on those plans.
 */
export interface ApplyAdminPluginOverrideRequest {
  action: PluginOverrideAction;
  /** Required to disable; recorded on the override and in the audit log. */
  reason?: string;
  workspaceIds?: string[];
  planSlugs?: string[];
}

export interface ApplyAdminPluginOverrideResultDto {
  pluginKey: string;
  action: PluginOverrideAction;
  changed: number;
  unchanged: number;
  workspaceIds: string[];
}

export interface SetAdminWorkspacePluginOverrideRequest {
  action: PluginOverrideAction;
  reason?: string;
}
