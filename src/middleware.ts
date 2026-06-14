import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/pricing", "/about", "/login", "/register", "/forgot-password", "/dev-test"];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];
const ADMIN_PREFIX = "/internal";

// Temporary frontend-only mode: backend/auth is not ready yet, so allow direct
// access to app pages while dashboard and layout work is being reviewed.
const DISABLE_AUTH_GUARD = false;

export function middleware(request: NextRequest) {
  if (DISABLE_AUTH_GUARD) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (token && isAuthRoute) {
    return NextResponse.redirect(new URL("/rooms", request.url));
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
