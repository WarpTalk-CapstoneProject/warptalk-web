/**
 * What the platform admin's per-workspace plugin controls decide on screen (2026-09-25).
 *
 * Both tabs — a plugin's "Workspaces" and a workspace's "Plugins" — render the same row type, so
 * the filtering, sorting, which actions a row offers and how a request is built live here once,
 * with node tests. The tables themselves stay plain so the shared admin list toolkit can replace
 * their chrome without touching these rules.
 *
 * Imports are type-only and relative: this file runs under plain `node --test`.
 */

import type {
  AdminPluginWorkspaceDefault,
  AdminPluginWorkspaceRowDto,
  ApplyAdminPluginOverrideRequest,
  PluginOverrideAction,
  SetAdminPluginAvailabilityRequest,
} from "../../types/admin-plugin-workspaces.ts";

/** Matches the server's `workspace_plugin_overrides.reason VARCHAR(500)`. */
export const PLUGIN_OVERRIDE_REASON_MAX = 500;

export const PLUGIN_WORKSPACE_DEFAULTS: readonly AdminPluginWorkspaceDefault[] = ["available", "opt_in", "retired"];

export type PluginWorkspaceStateFilter = "all" | "enabled" | "disabled";
export type PluginWorkspaceSourceFilter = "all" | "inherited" | "overridden";
/** `all`, `none` (no plan), or a plan slug. */
export type PluginWorkspacePlanFilter = string;

export interface PluginWorkspaceFilter {
  search: string;
  state: PluginWorkspaceStateFilter;
  source: PluginWorkspaceSourceFilter;
  plan: PluginWorkspacePlanFilter;
}

export const EMPTY_PLUGIN_WORKSPACE_FILTER: PluginWorkspaceFilter = {
  search: "",
  state: "all",
  source: "all",
  plan: "all",
};

export type PluginWorkspaceSortKey = "workspace" | "plugin" | "plan" | "state" | "connected" | "usage" | "lastUsed";
export type SortDirection = "asc" | "desc";

/** An admin's decision for this workspace, as opposed to the default or plan rule it inherits. */
export function isOverridden(row: Pick<AdminPluginWorkspaceRowDto, "source">): boolean {
  return row.source === "override";
}

export function filterPluginWorkspaceRows<T extends AdminPluginWorkspaceRowDto>(
  rows: readonly T[],
  filter: PluginWorkspaceFilter,
): T[] {
  const needle = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.state === "enabled" && !row.enabled) return false;
    if (filter.state === "disabled" && row.enabled) return false;
    if (filter.source === "overridden" && !isOverridden(row)) return false;
    if (filter.source === "inherited" && isOverridden(row)) return false;
    if (filter.plan === "none" && row.planSlug) return false;
    if (filter.plan !== "all" && filter.plan !== "none" && (row.planSlug ?? "").toLowerCase() !== filter.plan.toLowerCase()) {
      return false;
    }
    if (!needle) return true;
    return [row.workspaceName, row.workspaceSlug, row.pluginLabel, row.pluginKey, row.planSlug ?? "", row.overrideReason ?? ""]
      .some((value) => value.toLowerCase().includes(needle));
  });
}

function compare(a: AdminPluginWorkspaceRowDto, b: AdminPluginWorkspaceRowDto, key: PluginWorkspaceSortKey): number {
  switch (key) {
    case "workspace":
      return a.workspaceName.localeCompare(b.workspaceName);
    case "plugin":
      return a.pluginLabel.localeCompare(b.pluginLabel);
    case "plan":
      // No plan sorts last ascending: it is the odd one out, not the first thing to look at.
      return (a.planSlug ?? "￿").localeCompare(b.planSlug ?? "￿");
    case "state":
      return Number(b.enabled) - Number(a.enabled) || Number(isOverridden(b)) - Number(isOverridden(a));
    case "connected":
      return a.connectedUserIds.length - b.connectedUserIds.length;
    case "usage":
      return a.usageCount - b.usageCount;
    case "lastUsed":
      return (a.lastUsedAt ?? "").localeCompare(b.lastUsedAt ?? "");
  }
}

/** Stable, with the workspace then plugin name breaking ties so equal rows do not shuffle. */
export function sortPluginWorkspaceRows<T extends AdminPluginWorkspaceRowDto>(
  rows: readonly T[],
  key: PluginWorkspaceSortKey,
  direction: SortDirection,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      sign * compare(a, b, key)
      || a.workspaceName.localeCompare(b.workspaceName)
      || a.pluginLabel.localeCompare(b.pluginLabel),
  );
}

/** The plans present in the rows, for the plan filter and the "apply to plan" picker. */
export function planOptions(rows: readonly Pick<AdminPluginWorkspaceRowDto, "planSlug">[]): string[] {
  return [...new Set(rows.map((row) => row.planSlug?.toLowerCase()).filter((plan): plan is string => Boolean(plan)))].sort();
}

/**
 * Which of Enable / Disable / Reset a row offers. A retired plugin offers none: nothing overrides
 * retirement, so a button there would promise what the server refuses to do.
 *
 * Enable is offered on a row that is already on by default too: it pins the workspace on, so a
 * later change to the default or the plan rule does not take the plugin away from it.
 */
export function rowOverrideActions(
  row: Pick<AdminPluginWorkspaceRowDto, "source" | "overrideState">,
): PluginOverrideAction[] {
  if (row.source === "retired") return [];
  const actions: PluginOverrideAction[] = [];
  if (row.overrideState !== "enabled") actions.push("enable");
  if (row.overrideState !== "disabled") actions.push("disable");
  if (row.overrideState) actions.push("reset");
  return actions;
}

export type OverrideReasonError = "reasonRequired" | "reasonTooLong";

/** Disabling needs a reason — it is the change someone will ask about later. */
export function overrideReasonError(action: PluginOverrideAction, reason: string): OverrideReasonError | null {
  const trimmed = reason.trim();
  if (action === "disable" && trimmed.length === 0) return "reasonRequired";
  if (trimmed.length > PLUGIN_OVERRIDE_REASON_MAX) return "reasonTooLong";
  return null;
}

/** Trimmed, empties left out rather than sent as `""` or `[]`. */
export function buildOverrideRequest(input: {
  action: PluginOverrideAction;
  reason?: string;
  workspaceIds?: readonly string[];
  planSlugs?: readonly string[];
}): ApplyAdminPluginOverrideRequest {
  const request: ApplyAdminPluginOverrideRequest = { action: input.action };
  const reason = input.reason?.trim();
  if (reason) request.reason = reason;
  const ids = [...new Set(input.workspaceIds ?? [])];
  if (ids.length) request.workspaceIds = ids;
  const plans = normalizePlanSlugs(input.planSlugs ?? []);
  if (plans.length) request.planSlugs = plans;
  return request;
}

export function normalizePlanSlugs(plans: readonly string[]): string[] {
  return [...new Set(plans.map((plan) => plan.trim().toLowerCase()).filter(Boolean))];
}

/** `allowedPlans` empty means every plan; the server stores that as no rule at all. */
export function availabilityRequest(
  defaultValue: AdminPluginWorkspaceDefault,
  allowedPlans: readonly string[],
): SetAdminPluginAvailabilityRequest {
  return { default: defaultValue, allowedPlans: normalizePlanSlugs(allowedPlans) };
}

export interface PluginWorkspaceSummary {
  total: number;
  enabled: number;
  disabled: number;
  overridden: number;
  inUse: number;
}

export function summarizePluginWorkspaceRows(rows: readonly AdminPluginWorkspaceRowDto[]): PluginWorkspaceSummary {
  return {
    total: rows.length,
    enabled: rows.filter((row) => row.enabled).length,
    disabled: rows.filter((row) => !row.enabled).length,
    overridden: rows.filter(isOverridden).length,
    inUse: rows.filter((row) => row.inUse).length,
  };
}

/**
 * The i18n key under `workspaceAccess.source` explaining why a row is in its state:
 * `override`, `plan`, `optIn`, `retired`, or `inherited` (the default says available).
 */
export function sourceKey(
  row: Pick<AdminPluginWorkspaceRowDto, "source" | "enabled" | "pluginDefault">,
): "override" | "plan" | "optIn" | "retired" | "inherited" {
  if (row.source === "retired") return "retired";
  if (row.source === "override") return "override";
  if (row.source === "plan") return "plan";
  return row.enabled ? "inherited" : "optIn";
}
