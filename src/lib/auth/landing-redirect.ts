import {
  ACCESS_TOKEN_COOKIE,
  isLiveAccessToken,
  SESSION_MARKER_COOKIE,
} from "./session-cookie.ts";
import {
  getWorkspaceEntryPath,
  normalizeWorkspaceSlug,
  WORKSPACE_GATEWAY_PATH,
} from "../workspace/workspace-slug.ts";
import { withCheckoutIntent } from "../billing/checkout-intent.ts";

interface LandingRedirectState {
  isAuthenticated: boolean;
  user: unknown | null;
  hasRememberedSession?: boolean;
  activeWorkspaceSlug?: string | null;
  /** WT-491: the plan a guest clicked in the pricing section, carried through sign-up. */
  planSlug?: string | null;
}

function getBrowserCookieSource() {
  if (typeof document === "undefined") {
    return "";
  }

  return document.cookie;
}

export function getCookieValue(cookieSource: string, name: string) {
  const prefix = `${name}=`;
  for (const part of cookieSource.split("; ")) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }

  return null;
}

export function getRememberedWorkspaceSlug(
  activeWorkspaceSlug: string | null | undefined,
  cookieSource = getBrowserCookieSource(),
) {
  const stateWorkspaceSlug = normalizeWorkspaceSlug(activeWorkspaceSlug);
  if (stateWorkspaceSlug) {
    return stateWorkspaceSlug;
  }

  const cookieWorkspaceSlug = getCookieValue(cookieSource, "active_workspace_slug");
  return normalizeWorkspaceSlug(cookieWorkspaceSlug);
}

/**
 * Whether the landing page should send this visitor straight into the app.
 *
 * "There is a cookie called access_token" was not the same question. It stayed true for a
 * week after the token died, so the landing page's primary call to action pointed a
 * signed-out visitor at a workspace that could only 401.
 */
export function hasRememberedAccessToken(cookieSource = getBrowserCookieSource()) {
  if (isLiveAccessToken(getCookieValue(cookieSource, ACCESS_TOKEN_COOKIE))) {
    return true;
  }

  return Boolean(getCookieValue(cookieSource, SESSION_MARKER_COOKIE));
}

/**
 * Where the landing page's primary call to action goes.
 *
 * WT-491: `planSlug` is the plan a GUEST clicked in the pricing section. It rides inside the
 * `callbackUrl` for a signed-out visitor — so it survives login, and any detour through register
 * and email verification — and on the destination itself for someone already signed in. Without
 * it the choice was dropped at the first redirect and the visitor arrived somewhere with no sign
 * they had asked to buy anything.
 */
export function getLandingGetStartedHref({
  isAuthenticated,
  user,
  hasRememberedSession = false,
  activeWorkspaceSlug,
  planSlug,
}: LandingRedirectState) {
  if ((!isAuthenticated || !user) && !hasRememberedSession) {
    // Attached to the callback BEFORE encoding, so it arrives as part of the path the login page
    // will navigate to rather than as a sibling parameter of /login that nothing would forward.
    const callback = withCheckoutIntent(WORKSPACE_GATEWAY_PATH, planSlug);
    return `/login?callbackUrl=${encodeURIComponent(callback)}`;
  }

  return withCheckoutIntent(getWorkspaceEntryPath(activeWorkspaceSlug), planSlug);
}
