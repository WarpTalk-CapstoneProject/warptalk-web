import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getWorkspaceEntryPath,
  normalizeWorkspaceSlug,
  WORKSPACE_GATEWAY_PATH,
} from "@/lib/workspace/workspace-slug";
import {
  ACCESS_TOKEN_COOKIE,
  SESSION_MARKER_COOKIE,
  isLiveAccessToken,
} from "@/lib/auth/session-cookie";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/desktop-login",
  // Someone who cannot sign in yet still needs the installer, so /download stays open.
  "/download",
  "/register",
  "/forgot-password",
  "/verify-email",
  "/reset-password",
  "/join",
  "/invitations",
  // Linked from the signed-out login screen. Without these entries the gate
  // would bounce a guest who clicks them straight back to /login.
  "/terms",
  "/privacy",
  "/payment-cancelled",
  "/workspace/payment/plans",
  "/workspace/payment/success",
];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/verify-email", "/reset-password"];
const ADMIN_PREFIX = "/billing";
const DEVELOPMENT_ONLY_PREFIXES = [
  "/dev",
  "/dev-test",
  "/glass-material",
  "/test-meeting",
  "/workspace/artifacts",
];

function isWorkspaceScopedRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return false;

  return normalizeWorkspaceSlug(segments[0]) !== null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  // Presence is not validity. This cookie used to be honoured for seven days while the
  // token inside it lived thirty minutes, so a dead token read as a live session — which
  // both let the user into an app that could only 401 and, worse, bounced them off /login,
  // leaving no route back to a working state.
  const hasLiveAccessToken = isLiveAccessToken(accessToken);
  const hasStaleAccessToken = Boolean(accessToken) && !hasLiveAccessToken;

  // An expired access token does not mean the session is over: the refresh token outlives
  // it by days, and the client refreshes silently. The marker is what says a refresh is
  // still worth attempting. Gating route access on the access token alone would have
  // turned every 7-day session into a 30-minute one.
  const hasSession =
    hasLiveAccessToken || Boolean(request.cookies.get(SESSION_MARKER_COOKIE)?.value);

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (
    process.env.NODE_ENV === "production" &&
    DEVELOPMENT_ONLY_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return new NextResponse(null, { status: 404 });
  }

  // A dead cookie must not survive the response that noticed it was dead, or the next page
  // load starts from the same misleading state. Applied to whatever response we return
  // below.
  const withCleanup = (response: NextResponse) => {
    if (hasStaleAccessToken) {
      response.cookies.delete(ACCESS_TOKEN_COOKIE);
    }
    return response;
  };

  if (!hasLiveAccessToken && hasSession && isWorkspaceScopedRoute(pathname)) {
    const workspaceUrl = new URL(WORKSPACE_GATEWAY_PATH, request.url);
    workspaceUrl.searchParams.set("redirect", pathname);
    return withCleanup(NextResponse.redirect(workspaceUrl));
  }

  // Bouncing a signed-in user off the login page requires a *live* token. With a dead one
  // the user gets the login page they asked for — the one place that can repair the
  // session. This is the difference between a redirect and a trap.
  if (hasLiveAccessToken && (isAuthRoute || pathname === "/" || pathname === "/dashboard")) {
    const activeWorkspaceSlug = normalizeWorkspaceSlug(request.cookies.get("active_workspace_slug")?.value);
    if (activeWorkspaceSlug) {
      return NextResponse.redirect(new URL(getWorkspaceEntryPath(activeWorkspaceSlug), request.url));
    } else {
      return NextResponse.redirect(new URL("/workspace", request.url));
    }
  }

  if (!hasSession && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return withCleanup(NextResponse.redirect(loginUrl));
  }

  if (pathname.startsWith(ADMIN_PREFIX) && hasSession) {
    return withCleanup(NextResponse.next());
  }

  return withCleanup(NextResponse.next());
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg)$).*)"],
};
