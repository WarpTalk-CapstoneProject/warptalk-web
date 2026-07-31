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

export function hasRememberedAccessToken(cookieSource = getBrowserCookieSource()) {
  return Boolean(getCookieValue(cookieSource, "access_token"));
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
