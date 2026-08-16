import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { normalizeWorkspaceSlug } from "@/lib/workspace/workspace-slug";
import { isPlatformAdminToken } from "@/lib/api/token-lifecycle";
import {
  ACCESS_TOKEN_COOKIE,
  SESSION_DEAD_COOKIE,
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
  /**
   * The client has declared this session dead and cannot prove it by deleting cookies.
   *
   * This middleware reads cookies SERVER-SIDE, so it sees the three the auth service writes with
   * `HttpOnly = true` — and no script can delete an HttpOnly cookie. The only thing that clears
   * them is a `POST /auth/logout` that succeeds, which is exactly the request that fails when a
   * session dies badly (429 from the gateway, or 401 because the credential is already spent).
   *
   * So the browser ends up signed out in JavaScript and signed in here, and this file was the
   * half that turned that disagreement into a loop: it saw a still-live `access_token`, decided
   * the visitor belonged in the app, and redirected `/login` back to `/workspace` — where the
   * client found no readable credential, gave up again, and posted another logout. Roughly twice
   * a second, each iteration a fresh page load with every in-memory guard wiped.
   *
   * This cookie is the client's side of the conversation. It is script-visible on purpose (it
   * carries nothing) and expires in two minutes, so a stale one can never strand anybody.
   */
  const clientDeclaredSessionDead = Boolean(request.cookies.get(SESSION_DEAD_COOKIE)?.value);

  const hasLiveAccessToken = isLiveAccessToken(accessToken) && !clientDeclaredSessionDead;
  const hasStaleAccessToken = Boolean(accessToken) && !hasLiveAccessToken;

  // An expired access token does not mean the session is over: the refresh token outlives
  // it by days, and the client refreshes silently. The marker is what says a refresh is
  // still worth attempting. Gating route access on the access token alone would have
  // turned every 7-day session into a 30-minute one.
  //
  // The dead-session mark overrides the marker for the same reason it overrides the access
  // token: the marker is also HttpOnly and also survives a failed sign-out, so honouring it here
  // would send a visitor whose client has given up straight back into an app that can only 401.
  const hasSession =
    !clientDeclaredSessionDead
    && (hasLiveAccessToken || Boolean(request.cookies.get(SESSION_MARKER_COOKIE)?.value));

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

  /**
   * WT-380 — the Billing page moved under Workspace Settings, and its old address forwards.
   *
   * It is done here rather than by a `redirect()` in a page, which is where it started: a page
   * redirect under this app's client layout streams the shell first, so Next cannot set a 3xx and
   * downgrades it to a 200 carrying a client-side navigation. That works for a person clicking a
   * bookmark and is worth nothing to anything else — a link preview, a crawler, or the login
   * bounce below, which would otherwise send the user back to the dead address after signing in.
   *
   * Deliberately anchored to exactly two segments. `/billing` and `/billing/plans` are the
   * platform-admin surface and must not be touched, and `/admin/billing` would match a naive
   * "second segment is billing" test.
   */
  const movedBilling = /^\/([^/]+)\/billing\/?$/.exec(pathname);
  if (movedBilling && movedBilling[1] !== "admin") {
    const destination = new URL(`/${movedBilling[1]}/settings/billing`, request.url);
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination);
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
