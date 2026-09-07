import type {
  AssistantPluginCatalogItemDto,
  AssistantPluginConnectionStatus,
} from "@/types/assistant";

/**
 * WHY A PLUGIN CAN REPORT "connected" AND STILL BE UNUSABLE
 *
 *   `google_drive`, `google_calendar` and `google_meet` are three separate catalog rows, but a
 *   single Google account connection per user backs all three. Google's consent screen lets the
 *   person grant Drive and decline Calendar, so the connection comes back `connected` while
 *   carrying only some of the scopes a given plugin needs.
 *
 *   Showing that plugin as "Connected" is a claim the user only finds out is false when a tool
 *   call fails mid-answer. A plugin whose `requiredScopes` are not all present in the
 *   connection's `grantedScopes` is therefore reported as `not_connected` — i.e. "connect it" —
 *   which is also the action that fixes it, because reconnecting re-runs consent.
 *
 *   This survived the removal of the old display-time tile split (`plugin-tiles.ts`), where the
 *   same check lived; the split is gone because the catalog now ships one row per product, but
 *   the shared connection it was compensating for has not gone anywhere.
 *
 * Shared by the Plugins settings page and WarpBot's Skills menu / @mention picker so the two
 * surfaces never disagree about which plugins are actually usable.
 */
export function scopesSatisfied(required: string[], granted: string[]): boolean {
  const grantedSet = new Set(granted);
  return required.every((scope) => grantedSet.has(scope));
}

export function effectivePluginConnectionStatus(
  plugin: AssistantPluginCatalogItemDto,
): AssistantPluginConnectionStatus {
  if (plugin.connectionStatus !== "connected") return plugin.connectionStatus;
  return scopesSatisfied(plugin.requiredScopes, plugin.grantedScopes)
    ? "connected"
    : "not_connected";
}

/**
 * The catalog row as every surface should read it.
 *
 * Mapping the row once, rather than calling the check at each of the half-dozen places that
 * branch on `connectionStatus`, is what stops the action label, the Ready/Connect chip, the
 * @mentionable filter and the connect dialog from disagreeing with one another.
 */
export function withEffectiveConnectionStatus(
  plugin: AssistantPluginCatalogItemDto,
): AssistantPluginCatalogItemDto {
  const connectionStatus = effectivePluginConnectionStatus(plugin);
  return connectionStatus === plugin.connectionStatus ? plugin : { ...plugin, connectionStatus };
}
