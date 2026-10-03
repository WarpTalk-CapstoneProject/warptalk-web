/**
 * What WarpBot is told about the workspace Plugins page the owner has open.
 *
 * Same mechanism as the Insights tabs and Billing (see insights/assistant-snapshot.ts): the page
 * has already read the workspace's plugin list with the owner's token, so what it prints goes to
 * WarpBot as page context instead of behind a tool.
 *
 * THE RULES IT KEEPS
 *   - Only the list the page shows. Which tools a plugin exposes, each member's own connection and
 *     the per-tool rules are read when a plugin's Manage dialog opens and are not part of this
 *     page-level context, so WarpBot is told what it can and cannot see here.
 *   - Counts and plugin labels. Nobody who asked for a plugin is named, no server URL is sent, and
 *     no connection detail is: "3 members used it" is the whole story per plugin.
 *   - No comma inside a value (see insights/snapshot-text.ts).
 */

import type { WorkspacePluginItemDto, WorkspacePluginsOverviewDto } from "../../types/assistant.ts";
import { plain } from "./insights/snapshot-text.ts";

const MAX_LISTED = 12;

function labels(plugins: readonly Pick<WorkspacePluginItemDto, "label">[]): string {
  const names = plugins.map((plugin) => plain(plugin.label)).filter(Boolean);
  if (names.length === 0) return "none";
  const shown = names.slice(0, MAX_LISTED).join("; ");
  return names.length > MAX_LISTED ? `${shown}; and ${names.length - MAX_LISTED} more` : shown;
}

export function pluginsAssistantSnapshot(
  overview: WorkspacePluginsOverviewDto,
  canManage: boolean,
): Record<string, string> {
  const inWorkspace = overview.inWorkspace;
  const pending = overview.pendingRequests.filter((request) => request.status === "pending");
  const out: Record<string, string> = {
    plugins_in_workspace_count: String(inWorkspace.length),
    plugins_in_workspace: inWorkspace.length
      ? inWorkspace
          .slice(0, MAX_LISTED)
          .map((plugin) => {
            const used = plugin.membersUsedCount;
            const kind = plugin.availability === "private" ? "private MCP server; " : "";
            return `${plain(plugin.label)} (${kind}used by ${used} ${used === 1 ? "member" : "members"})`;
          })
          .join("; ") + (inWorkspace.length > MAX_LISTED ? `; and ${inWorkspace.length - MAX_LISTED} more` : "")
      : "none",
    private_mcp_plugins: String(inWorkspace.filter((plugin) => plugin.availability === "private").length),
    marketplace_plugins_not_added: labels(overview.marketplace),
    plugin_requests_waiting_for_owner: String(pending.length),
    list_chosen_by_owner: overview.isCurated ? "yes" : "no: it is still the carried-over default of plugins members already use",
    can_change_the_list: canManage ? "yes" : "no: read-only for this role",
  };
  if (pending.length > 0) out.plugins_requested = labels(pending.map((request) => ({ label: request.pluginLabel })));
  const disabled = overview.disabledByPlatform ?? [];
  if (disabled.length > 0) out.turned_off_by_platform = labels(disabled);
  return out;
}
