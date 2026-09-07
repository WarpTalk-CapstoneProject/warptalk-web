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

/* ---------------------------------------------------------------------------------------------
 * WHICH ROWS SHARE ONE OAUTH GRANT — AND THEREFORE GO DOWN TOGETHER
 *
 *   Since WT-646 a connection is keyed by PROVIDER, not by plugin key: one Google grant backs
 *   google_drive, google_calendar and google_meet. `DisconnectAsync` ends the grant, so
 *   disconnecting Drive disconnects Calendar and Meet as well. That is deliberate — Google revokes
 *   a grant, not an individual token, so the alternative leaves rows we believe are healthy
 *   pointing at something dead — but it is silent data loss unless the user is told first.
 *
 *   The grouping is derived from catalog data, never from a list of Google keys. Hardcoding
 *   "google" here would be wrong the day a second multi-product provider is added, and wrong in
 *   the other direction the day the three keys are renamed.
 * ------------------------------------------------------------------------------------------- */

/**
 * The grant a row's connection is keyed by, or null when the row cannot be grouped with any other.
 *
 * `provider` is the real answer and is preferred whenever the catalog sends it. It is not on the
 * user-facing `PluginCatalogItemDto` yet (only on the admin DTOs), so until it is threaded through
 * the fallback below stands in — see `scopeIssuerGroupKey`.
 */
export function pluginConnectionGroupKey(plugin: AssistantPluginCatalogItemDto): string | null {
  const provider = plugin.provider?.trim();
  if (provider) return `provider:${provider}`;
  return scopeIssuerGroupKey(plugin.requiredScopes);
}

/**
 * Interim stand-in for `provider`: the single https origin every one of a row's required scopes is
 * issued by.
 *
 * Deliberately conservative. It returns null unless EVERY required scope is an absolute http(s)
 * URL and they all share one origin, so an opaque scope string (`"mcp:read"`), a scopeless row, or
 * a row mixing two issuers is treated as ungrouped and warns about nobody. The failure it can
 * still make is over-grouping two unrelated rows that happen to be issued by the same host, which
 * over-warns rather than under-warns — the right direction for a guard against silent data loss.
 *
 * This disappears on its own the moment the catalog carries `provider`.
 */
function scopeIssuerGroupKey(requiredScopes: readonly string[]): string | null {
  if (requiredScopes.length === 0) return null;

  let issuer: string | null = null;
  for (const scope of requiredScopes) {
    let parsed: URL;
    try {
      parsed = new URL(scope);
    } catch {
      return null;
    }
    // `new URL("mcp:read")` parses happily with protocol "mcp:", so the scheme has to be checked
    // rather than inferred from the parse succeeding.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (issuer === null) issuer = parsed.origin;
    else if (issuer !== parsed.origin) return null;
  }

  return issuer === null ? null : `issuer:${issuer}`;
}

/**
 * The other INSTALLED rows that disconnecting `plugin` would also disconnect.
 *
 * Installed-only on purpose: a row the user never installed is not something they are about to
 * lose, and listing it turns a warning that matters into noise that gets skimmed past.
 */
export function pluginsSharingConnection(
  plugin: AssistantPluginCatalogItemDto,
  catalog: readonly AssistantPluginCatalogItemDto[],
): AssistantPluginCatalogItemDto[] {
  const group = pluginConnectionGroupKey(plugin);
  if (group === null) return [];

  return catalog
    .filter(
      (other) =>
        other.key !== plugin.key
        && other.installationStatus === "installed"
        && pluginConnectionGroupKey(other) === group,
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** "A", "A and B", "A, B and C" — an inline list a sentence can end on. */
export function formatPluginLabelList(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]!}`;
}

/**
 * The sentence shown before a disconnect (or a remove, which disconnects on the way out), or null
 * when nothing else goes down with it.
 */
export function sharedConnectionWarning(
  siblings: readonly AssistantPluginCatalogItemDto[],
): string | null {
  if (siblings.length === 0) return null;
  const labels = formatPluginLabelList(siblings.map((sibling) => sibling.label));
  return siblings.length === 1
    ? `${labels} signs in through the same account connection, so it is disconnected too.`
    : `${labels} sign in through the same account connection, so they are disconnected too.`;
}

/* ---------------------------------------------------------------------------------------------
 * WORKSPACE PLUGIN POLICY
 *
 *   A workspace can run an allowlist. A blocked row is still RETURNED by the catalog rather than
 *   hidden, so a user whose workspace narrowed its policy under an already-connected plugin can
 *   still see the row and revoke the grant. Install and connect are refused; disconnect and
 *   disable never are.
 * ------------------------------------------------------------------------------------------- */

export interface PluginWorkspaceBlock {
  /** The backend's own sentence, rendered verbatim. Never re-worded here. */
  reason: string;
  /** What the member can actually do about it, or null when we cannot tell which refusal this is. */
  remedy: string | null;
}

/**
 * Two refusals reach the user through one string field, and they need different next steps:
 * `workspace_plugin_not_allowed` (the workspace permits some plugins, not this one) is fixed by an
 * admin adding one key; `permission_denied` from the workspace-wide switch (personal plugins are
 * off entirely) is not.
 *
 * The catalog DTO carries only the message, not the error code, so the two are told apart by a
 * marker phrase from each backend constant. If the backend rewords a message the match fails and
 * the remedy line simply disappears — the user still sees the reason, and nobody is told to go ask
 * for something that would not help. A `workspacePolicyBlockCode` on the DTO would retire this.
 */
const WORKSPACE_POLICY_REMEDIES: ReadonlyArray<{ marker: string; remedy: string }> = [
  {
    // PluginConstants.WorkspacePolicyMessages.NotOnAllowlist
    marker: "does not include this plugin",
    remedy:
      "Your workspace permits some plugins but not this one. A workspace Owner or Admin can add it to the allowed list.",
  },
  {
    // PluginConstants.WorkspacePolicyMessages.PluginsDisabled
    marker: "do not allow personal plugins",
    remedy:
      "Your workspace has turned personal plugins off, so no single plugin can be allowed on its own. Only a workspace Owner or Admin can turn them back on.",
  },
];

/** The workspace's verdict on this row, or null when nothing refuses it. */
export function pluginWorkspaceBlock(
  plugin: AssistantPluginCatalogItemDto,
): PluginWorkspaceBlock | null {
  const reason = plugin.workspacePolicyBlockReason?.trim();
  if (!reason) return null;

  const normalized = reason.toLowerCase();
  const match = WORKSPACE_POLICY_REMEDIES.find((entry) => normalized.includes(entry.marker));
  return { reason, remedy: match?.remedy ?? null };
}

/**
 * Whether workspace policy refuses this row.
 *
 * Gates install and connect only. Disconnect and remove stay open on a blocked row on purpose: the
 * backend never gates them, and a user holding a live OAuth grant in a workspace that has just
 * stopped permitting the plugin needs a way to revoke it from here.
 */
export function isPluginWorkspaceBlocked(plugin: AssistantPluginCatalogItemDto): boolean {
  return pluginWorkspaceBlock(plugin) !== null;
}
