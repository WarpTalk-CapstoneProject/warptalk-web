import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/pricing", "/about", "/login", "/register", "/forgot-password", "/dev-test"];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];
const ADMIN_PREFIX = "/admin";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;

  // Public routes — allow all
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  const isAuth = AUTH_ROUTES.some((route) => pathname === route);

  // If logged in and trying to access auth pages → redirect to dashboard
  if (isAuth && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Public routes — skip auth
  if (isPublic) {
    return NextResponse.next();
  }

  // Protected routes — require token
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes — check role from JWT
  if (pathname.startsWith(ADMIN_PREFIX)) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString()
      );
      const role =
        payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
        payload.role;

      if (role !== "system_admin") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts|images).*)"],
};
