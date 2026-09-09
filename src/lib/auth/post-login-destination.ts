/**
 * Where a successful sign-in goes. WT-347.
 *
 * The login page used to answer this with one line — `router.replace(callbackUrl)` — and
 * `getSafeCallbackUrl` hard-fell-back to `/workspace` whenever nothing was asked for. So a person
 * who signed in with no `callbackUrl` was always sent to the hub, and the hub then had to work
 * out where they belonged from a list that no longer carried any memory of it (see
 * lib/workspace/last-workspace.ts for why the memory was gone). Somebody who already had a
 * workspace stopped one screen short of it on every sign-in.
 *
 * Three answers, in order:
 *   1. An explicit destination wins. `?callbackUrl=/acme/rooms/123` was put there by the route
 *      guard for a reason, and `/workspace?planSlug=pro` is a buyer mid-purchase (WT-491) whom
 *      the hub forwards to the plan grid.
 *   2. Otherwise, the workspace this account was in last time, when one is known.
 *   3. Otherwise the hub, which is still the right place for a first sign-in, an account with
 *      only invitations, or somebody whose last workspace has since been revoked (the slug
 *      layout sends them back here).
 *
 * The hub stays reachable on purpose: the workspace switcher's "Create or join a workspace..."
 * navigates there directly, with a workspace already active, and that is the one case in which
 * the hub shows its chooser rather than auto-opening. Nothing here changes that.
 */

import {
  getWorkspaceEntryPath,
  WORKSPACE_GATEWAY_PATH,
} from "../workspace/workspace-slug.ts";

/**
 * Only same-origin paths are honoured. `//evil.example` would be a protocol-relative redirect
 * off the site, and `/rooms` is a legacy path that no longer exists.
 */
export function getSafeCallbackUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value === "/rooms") {
    return WORKSPACE_GATEWAY_PATH;
  }
  return value;
}

/**
 * Whether the callback asks for anything more specific than "the app". The landing page sends
 * every guest to `/login?callbackUrl=%2Fworkspace` — that is its default, not a choice to see the
 * hub, and it must not pin somebody with a workspace to the chooser. A query string on it IS a
 * choice (WT-491 carries the chosen plan there).
 */
function isBareGateway(callbackUrl: string): boolean {
  return callbackUrl === WORKSPACE_GATEWAY_PATH || callbackUrl === `${WORKSPACE_GATEWAY_PATH}/`;
}

export function resolvePostLoginDestination(input: {
  /** The raw `callbackUrl` / `redirect` query value, or null when the page carried none. */
  callbackUrl: string | null | undefined;
  /** This account's remembered workspace — `recallLastWorkspaceSlug(user.id)`. */
  lastWorkspaceSlug: string | null | undefined;
}): string {
  const callbackUrl = getSafeCallbackUrl(input.callbackUrl);
  if (!isBareGateway(callbackUrl)) return callbackUrl;
  return getWorkspaceEntryPath(input.lastWorkspaceSlug);
}
