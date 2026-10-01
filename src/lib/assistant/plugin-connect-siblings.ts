/**
 * "Connect your other Google plugins too?" (GMCAL1001).
 *
 * Connect on one plugin asks the provider for THAT plugin's scopes only — the backend stopped
 * bundling Drive, Calendar and Meet into one consent. The price is that a user who wants all three
 * now signs in three times, so once one of them connects the plugins page offers the rest in one
 * go. Opt-in only: nothing here ever connects a sibling by itself.
 *
 * Which rows are offered is decided here, from catalog data, so it has node tests and so the
 * grouping is the same one the connect dialog uses (`pluginConnectionGroupKey`, keyed by provider).
 *
 * Imports are relative and carry the extension: this file runs under plain `node --test`.
 */

import type { AssistantPluginCatalogItemDto } from "../../types/assistant.ts";
import { memberPluginAction } from "./plugin-availability.ts";
import {
  effectivePluginConnectionStatus,
  isPluginWorkspaceBlocked,
  pluginConnectionGroupKey,
} from "./plugin-connection.ts";

/**
 * The other rows of `plugin`'s provider the user could connect right now and has not.
 *
 * A sibling must be a row whose own Connect button would work on this page:
 *   - same connection group (same provider grant);
 *   - the member page's action for it is `connect` — never a Request/Add row the workspace has not
 *     added, which connecting would only get refused;
 *   - not refused by workspace policy, not disabled by the platform;
 *   - signed in with OAuth (an `api_key` row has no consent to fold into);
 *   - not effectively connected — a row connected with a scope declined still counts as
 *     unconnected, because connecting it again is what fixes it.
 *
 * An empty answer means "show nothing".
 */
export function pluginSiblingsToOffer(
  plugin: AssistantPluginCatalogItemDto,
  catalog: readonly AssistantPluginCatalogItemDto[],
): AssistantPluginCatalogItemDto[] {
  const group = pluginConnectionGroupKey(plugin);
  if (group === null) return [];

  return catalog
    .filter(
      (other) =>
        other.key !== plugin.key
        && pluginConnectionGroupKey(other) === group
        && other.authMode !== "api_key"
        && other.workspaceAvailability !== "platform_disabled"
        && memberPluginAction(other, null).kind === "connect"
        && !isPluginWorkspaceBlocked(other)
        && effectivePluginConnectionStatus(other) !== "connected",
    )
    .sort((a, b) => {
      const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return order !== 0 ? order : a.label.localeCompare(b.label);
    });
}

/**
 * The single connect call "Connect all" makes.
 *
 * The plugin the user just connected is NOT the one named: it is already connected, and naming it
 * would have the server reconnect it. The first sibling is the plugin the call is about and the rest
 * ride along in `alsoConnect`, so one consent page covers every one of them that still needs it.
 * Null when there is nothing to connect.
 */
export function connectAllRequest(
  siblings: readonly Pick<AssistantPluginCatalogItemDto, "key">[],
): { pluginKey: string; alsoConnect: string[] } | null {
  const [first, ...rest] = siblings;
  if (!first) return null;
  return { pluginKey: first.key, alsoConnect: rest.map((sibling) => sibling.key) };
}

/**
 * "Google" out of the catalog's `provider` slug, for the prompt's title. Null when the row has no
 * provider (an older server), and the prompt then uses its provider-free wording.
 */
export function providerDisplayName(plugin: Pick<AssistantPluginCatalogItemDto, "provider">): string | null {
  const slug = plugin.provider?.trim();
  if (!slug) return null;
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Session-storage key that remembers "Not now" for one provider group. */
export function siblingPromptDismissedKey(groupKey: string): string {
  return `warptalk:plugin-sibling-prompt-dismissed:${groupKey}`;
}
