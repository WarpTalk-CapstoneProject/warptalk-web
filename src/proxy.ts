import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { normalizeWorkspaceSlug } from "@/lib/workspace/workspace-slug";
import { isPlatformAdminToken } from "@/lib/api/token-lifecycle";
import {
  ACCESS_TOKEN_COOKIE,
  SESSION_MARKER_COOKIE,
  isLiveAccessToken,
} from "@/lib/auth/session-cookie";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/desktop-login",
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

  const isDevelopmentOnlyRoute = DEVELOPMENT_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (process.env.NODE_ENV === "production" && isDevelopmentOnlyRoute) {
    return new NextResponse(null, { status: 404 });
  }

  // Outside production these previews are reachable WITHOUT a session, because the whole point of
  // them is to render a surface whose backend is not running on a laptop. The gate below would
  // otherwise bounce them to /login, where signing in needs the very API they exist to stand in
  // for — so `/dev/*` was, in practice, unreachable on every machine that most needed it.
  //
  // This cannot widen production by construction: the branch above returns 404 for exactly this
  // set of prefixes, unconditionally, before anything here runs. `/dev` additionally carries its
  // own `notFound()` layout, so the guarantee does not rest on this file alone.
  if (isDevelopmentOnlyRoute) {
    return NextResponse.next();
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

  // Bouncing a signed-in user off the login page requires a *live* token. With a dead one
  // the user gets the login page they asked for — the one place that can repair the
  // session. This is the difference between a redirect and a trap.
  if (hasLiveAccessToken && (isAuthRoute || pathname === "/" || pathname === "/dashboard")) {
    const activeWorkspaceSlug = normalizeWorkspaceSlug(request.cookies.get("active_workspace_slug")?.value);
    if (activeWorkspaceSlug) {
      return NextResponse.redirect(new URL(`/${activeWorkspaceSlug}/dashboard`, request.url));
    }

    // WT-376: a platform administrator with no workspace of their own belongs in the admin
    // portal, not on the new-signup setup screen. Both seeded admin accounts landed on
    // "Set up your workspace" and were offered Join or Create — the product telling the people
    // who run it that they had not started using it yet.
    //
    // The role has to be read from the TOKEN here. `useIsSystemAdmin` reads the same claim off
    // the auth store, which does not exist until React mounts, and this redirect happens before
    // any of that. Only the landing paths above are redirected: an admin who deliberately
    // navigates to /workspace still gets it, because admins legitimately create workspaces too
    // and bouncing them out of that page would be a second trap in place of the first.
    if (isPlatformAdminToken(accessToken)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return NextResponse.redirect(new URL("/workspace", request.url));
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
