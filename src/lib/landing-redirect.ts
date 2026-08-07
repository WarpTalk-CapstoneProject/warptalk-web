import {
  ACCESS_TOKEN_COOKIE,
  isLiveAccessToken,
  SESSION_MARKER_COOKIE,
} from "./auth/session-cookie.ts";
import {
  getWorkspaceEntryPath,
  normalizeWorkspaceSlug,
  WORKSPACE_GATEWAY_PATH,
} from "./workspace-slug.ts";

interface LandingRedirectState {
  isAuthenticated: boolean;
  user: unknown | null;
  hasRememberedSession?: boolean;
  activeWorkspaceSlug?: string | null;
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

export function getLandingGetStartedHref({
  isAuthenticated,
  user,
  hasRememberedSession = false,
  activeWorkspaceSlug,
}: LandingRedirectState) {
  if ((!isAuthenticated || !user) && !hasRememberedSession) {
    return `/login?callbackUrl=${encodeURIComponent(WORKSPACE_GATEWAY_PATH)}`;
  }

  return getWorkspaceEntryPath(activeWorkspaceSlug);
}
