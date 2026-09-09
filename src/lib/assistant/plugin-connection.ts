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
 * `provider` is the real answer and is preferred whenever the catalog sends it, which since WT-646
 * it does. The fallback below is for a server older than that — `provider` is optional on the type
 * for exactly that reason — and for any row an operator adds without one; see `scopeIssuerGroupKey`.
 */
export function pluginConnectionGroupKey(plugin: AssistantPluginCatalogItemDto): string | null {
  const provider = plugin.provider?.trim();
  if (provider) return `provider:${provider}`;
  return scopeIssuerGroupKey(plugin.requiredScopes);
}

/**
 * Stand-in for `provider` on a row that does not carry one: the single http(s) origin that issues
 * a row's required scopes.
 *
 * IDENTITY SCOPES DO NOT VOTE, AND THEY DO NOT VETO
 *
 *   An earlier revision required EVERY scope to be an absolute http(s) URL, which is a rule the
 *   data does not obey. `openid`, `email` and `profile` are bare words — `GoogleWorkspaceOAuthClient`
 *   asks for all three alongside the API scopes — and one of them appearing in a row's
 *   `requiredScopes` was enough to make this return null. That collapses the group, and a collapsed
 *   group means the disconnect confirmation warns about nobody: precisely the silent data loss the
 *   warning exists to prevent, arriving through the path that looks safest.
 *
 *   So a scope that is not an absolute http(s) URL is now ignored rather than fatal. It names a
 *   capability, not an issuer, and it has nothing to say about which grant backs the row. The
 *   grouping is decided by the URL-shaped scopes alone, and a row with none of those is still
 *   ungrouped — there is no issuer to read out of `["mcp:read"]`, and inventing one would group
 *   rows that share nothing.
 *
 * Still deliberately conservative in the other direction: two issuers in one row means "cannot
 * tell", and cannot-tell means no siblings. The failure it can still make is over-grouping two
 * unrelated rows issued by the same host, which over-warns rather than under-warns — the right
 * direction for a guard against silent data loss.
 */
function scopeIssuerGroupKey(requiredScopes: readonly string[]): string | null {
  let issuer: string | null = null;

  for (const scope of requiredScopes) {
    let parsed: URL;
    try {
      parsed = new URL(scope);
    } catch {
      // `openid`, `email`, `profile` — a capability name, not an issuer. Skipped, not fatal.
      continue;
    }
    // `new URL("mcp:read")` parses happily with protocol "mcp:", so the scheme has to be checked
    // rather than inferred from the parse succeeding.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
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
    ? `${labels} shares this account connection, so it is disconnected too.`
    : `${labels} share this account connection, so they are disconnected too.`;
}

/* ---------------------------------------------------------------------------------------------
 * WORKSPACE PLUGIN POLICY
 *
 *   A workspace decides one thing: whether its members may use plugins at all. A blocked row is
 *   still RETURNED by the catalog rather than hidden, so a user whose workspace switched plugins
 *   off under an already-connected one can still see the row and revoke the grant. Install and
 *   connect are refused; disconnect and disable never are.
 * ------------------------------------------------------------------------------------------- */

export interface PluginWorkspaceBlock {
  /** The backend's own sentence, rendered verbatim. Never re-worded here. */
  reason: string;
  /** What the member can actually do about it, or null when we cannot tell which refusal this is. */
  remedy: string | null;
}

/**
 * A workspace configures exactly one plugin attribute — whether its members may use plugins at all
 * — so there is exactly one refusal to explain. An earlier revision of this ticket also carried a
 * per-plugin allowlist, and with it a second refusal ("permits some plugins, not this one") that
 * needed a different next step; that scope was cut, and the backend no longer emits it.
 *
 * The match is kept rather than assuming the single message, because the catalog DTO carries the
 * sentence and not the error code. If the backend rewords it, the remedy line disappears and the
 * user still sees the reason — better than confidently offering a remedy for a refusal this is not.
 * A `workspacePolicyBlockCode` on the DTO would retire the guesswork entirely.
 */
const WORKSPACE_POLICY_REMEDIES: ReadonlyArray<{ marker: string; remedy: string }> = [
  {
    // PluginConstants.WorkspacePolicyMessages.PluginsDisabled
    marker: "do not allow personal plugins",
    remedy:
      "Your workspace has turned plugins off. Only a workspace Owner or Admin can turn them back on.",
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
