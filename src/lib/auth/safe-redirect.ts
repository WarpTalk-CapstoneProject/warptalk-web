/**
 * Where a `?redirect=` / `?callbackUrl=` may actually send someone.
 *
 * An attacker-supplied value reaches this straight off the query string, so anything that is
 * not an in-app absolute path is refused rather than sanitised: `//evil.com` is a
 * protocol-relative URL that browsers treat as off-site, and `https://evil.com` is off-site
 * outright. Both fall back to the workspace gateway.
 *
 * This lived as three verbatim copies — login, register and desktop-login each carried their
 * own `getSafeCallbackUrl`. The workspace gateway needed a fourth, which is the point at which
 * a rule about where users may be sent should stop being retyped.
 */
export const DEFAULT_REDIRECT = "/workspace";

export function getSafeRedirect(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    // Protocol-relative: the browser reads `//host/path` as off-site.
    value.startsWith("//") ||
    // Bare /rooms has no workspace in it and dead-ends; the gateway resolves one first.
    value === "/rooms"
  ) {
    return fallback;
  }

  return value;
}
