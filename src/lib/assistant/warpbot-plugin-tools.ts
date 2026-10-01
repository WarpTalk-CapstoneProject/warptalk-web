/**
 * Which plugin tools WarpBot is actually offered, for the "From your plugins" section of
 * /{slug}/tools.
 *
 * A plugin's tools reach WarpBot only when ALL of these hold — the same rules the chat widget's
 * plugin menu and @mention list follow (global-chatbot.tsx):
 *
 *   - the member installed it and it is connected, with every scope it needs granted (a Google row
 *     can read `connected` while its own scopes were declined on the shared grant — see
 *     plugin-connection.ts);
 *   - this workspace has it (`isOfferedInWorkspaceChat`) and its plugin policy does not refuse it;
 *   - the member has not set the tool to Blocked (WT-687) — a blocked tool is never offered.
 *
 * A plugin left with no offered tool is left out entirely: listing it with nothing under it would
 * claim WarpBot can use it.
 *
 * Imports are type-only and relative: this file runs under plain `node --test`.
 */

import type { AssistantPluginCatalogItemDto, McpToolDescriptorDto } from "../../types/assistant.ts";
import { isOfferedInWorkspaceChat } from "./plugin-availability.ts";
import { toolPolicyOf } from "./tool-policy.ts";

export interface OfferedPluginTools {
  plugin: AssistantPluginCatalogItemDto;
  tools: McpToolDescriptorDto[];
}

function isUsablyConnected(plugin: AssistantPluginCatalogItemDto): boolean {
  if (plugin.connectionStatus !== "connected") return false;
  const granted = new Set(plugin.grantedScopes ?? []);
  return (plugin.requiredScopes ?? []).every((scope) => granted.has(scope));
}

export function pluginToolsOfferedToWarpBot(
  plugins: readonly AssistantPluginCatalogItemDto[],
): OfferedPluginTools[] {
  return plugins
    .filter(
      (plugin) =>
        plugin.installationStatus === "installed" &&
        isUsablyConnected(plugin) &&
        isOfferedInWorkspaceChat(plugin) &&
        !plugin.workspacePolicyBlockReason,
    )
    .map((plugin) => {
      const seen = new Set<string>();
      const tools = (plugin.tools ?? []).filter((tool) => {
        if (seen.has(tool.name) || toolPolicyOf(tool) === "blocked") return false;
        seen.add(tool.name);
        return true;
      });
      return { plugin, tools };
    })
    .filter((group) => group.tools.length > 0)
    .sort((a, b) => a.plugin.label.localeCompare(b.plugin.label));
}
