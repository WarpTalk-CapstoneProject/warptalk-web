import type { AssistantPluginCatalogItemDto, AssistantPluginConnectionStatus } from "@/types/assistant";

/**
 * A catalog row split into one tile per `resourceKey` its tools declare (e.g. one plugin whose
 * single OAuth connection covers Drive and Calendar renders as two tiles). `key` always stays the
 * real plugin key, so every action (install/connect/disconnect/remove) still targets the one
 * underlying installation and connection — this is a display-only split, not a second plugin.
 *
 * Shared between the Plugins settings page and WarpBot's Skills menu / @mention picker, so the
 * two surfaces never drift into showing a different tile count for the same catalog data.
 */
export interface PluginDisplayTile extends AssistantPluginCatalogItemDto {
  tileId: string;
  /** Labels of sibling tiles that share this same connection, if this plugin was split. */
  sharedConnectionWith: string[];
}

function scopesSatisfied(required: string[], granted: string[]) {
  const grantedSet = new Set(granted);
  return required.every((scope) => grantedSet.has(scope));
}

/**
 * Splits a catalog item into per-resource tiles purely from data the catalog already carries
 * (`tool.resourceKey`/`resourceLabel`/`resourceAvatarUrl`) — no plugin-specific branching here.
 * A plugin only splits when every one of its tools names a resource group and there are at least
 * two distinct groups; anything else (no grouping data, or a mix of grouped/ungrouped tools)
 * renders as a single tile, same as before this existed.
 */
export function toDisplayTiles(plugin: AssistantPluginCatalogItemDto): PluginDisplayTile[] {
  const groups = new Map<string, typeof plugin.tools>();
  for (const tool of plugin.tools) {
    if (!tool.resourceKey) {
      return [{ ...plugin, tileId: plugin.key, sharedConnectionWith: [] }];
    }
    const group = groups.get(tool.resourceKey) ?? [];
    group.push(tool);
    groups.set(tool.resourceKey, group);
  }

  if (groups.size < 2) {
    return [{ ...plugin, tileId: plugin.key, sharedConnectionWith: [] }];
  }

  const entries = [...groups.entries()];
  const labels = entries.map(([, tools]) => tools[0].resourceLabel ?? plugin.label);

  return entries.map(([resourceKey, tools], index) => {
    const requiredScopes = [...new Set(tools.flatMap((tool) => tool.requiredScopes))];
    // The shared connection can be "connected" overall while missing this tile's specific scope,
    // if the user unchecked it on Google's consent screen - show that as needing (re)connect
    // rather than a misleading "Connected".
    const connectionStatus: AssistantPluginConnectionStatus =
      plugin.connectionStatus === "connected" && !scopesSatisfied(requiredScopes, plugin.grantedScopes)
        ? "not_connected"
        : plugin.connectionStatus;

    return {
      ...plugin,
      tileId: `${plugin.key}:${resourceKey}`,
      label: tools[0].resourceLabel ?? plugin.label,
      avatarUrl: tools[0].resourceAvatarUrl ?? plugin.avatarUrl,
      description: tools.map((tool) => tool.label).join(", "),
      requiredScopes,
      connectionStatus,
      tools,
      sharedConnectionWith: labels.filter((_, labelIndex) => labelIndex !== index),
    };
  });
}
