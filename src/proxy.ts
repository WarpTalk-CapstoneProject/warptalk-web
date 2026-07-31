import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/about",
  "/login",
  "/desktop-login",
  "/register",
  "/forgot-password",
  "/dev-test",
  "/join",
  "/payment-cancelled",
  "/workspace/payment/plans",
  "/workspace/payment/success",
];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];
const ADMIN_PREFIX = "/billing";
const DEV_ONLY_ROUTES = ["/dev", "/dev-test", "/glass-material", "/test-meeting", "/workspace/artifacts"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    process.env.NODE_ENV === "production" &&
    DEV_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const token = request.cookies.get("access_token")?.value;
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (token && (isAuthRoute || pathname === "/" || pathname === "/dashboard")) {
    const activeWorkspaceSlug = request.cookies.get("active_workspace_slug")?.value;
    if (activeWorkspaceSlug) {
      return NextResponse.redirect(new URL(`/${activeWorkspaceSlug}/dashboard`, request.url));
    } else {
      return NextResponse.redirect(new URL("/workspace", request.url));
    }
  }

  if (!token && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith(ADMIN_PREFIX) && token) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg)$).*)"],
};
