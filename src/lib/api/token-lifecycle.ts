/**
 * How close to expiry a token has to be before a *reactive* caller replaces it. Small on
 * purpose: this is the margin for a request that is about to be sent, so it only has to cover
 * the flight time.
 */
export const DEFAULT_REFRESH_WINDOW_MS = 30_000;

/**
 * How long before expiry the proactive timer wakes up, and — the part that was missing — the
 * window it must then be judged against.
 *
 * These two numbers have to be defined together, because the timer firing is not the same
 * thing as the refresh happening. The timer woke at expiry minus 120s and then called a
 * refresher whose window was the 30s above, which answered "this token is not expiring yet"
 * and returned it untouched. So the proactive refresh had no effect whatsoever: a user sitting
 * in a meeting makes almost no REST calls — the meeting runs on SignalR and LiveKit — and the
 * access token aged out at thirty minutes exactly as if the timer did not exist.
 *
 * The window is the larger of the two so that "the timer fired" implies "the token is inside
 * the window". Keeping it strictly larger, rather than equal, leaves room for the timer to run
 * late without landing back in the no-op: setTimeout offers no upper bound on lateness, and a
 * throttled background tab routinely takes seconds longer than asked.
 */
export const PROACTIVE_REFRESH_MARGIN_MS = 120_000;
export const PROACTIVE_REFRESH_WINDOW_MS = 150_000;

export function getAccessTokenExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * The platform-wide roles carried by the access token, lowercased.
 *
 * WT-376. `useIsSystemAdmin` reads the same roles off the auth STORE, which only exists once
 * React has mounted — so the proxy, which decides where a freshly-logged-in user lands before
 * any of that runs, had no way to know it was routing a platform administrator and sent both
 * admin accounts to "Set up your workspace" like any new signup.
 *
 * ASP.NET writes role claims under either `role` or the long ClaimTypes.Role URI depending on
 * whether the mapper was suppressed, and a single role serialises as a bare string rather than
 * an array. All three shapes are read, because getting this wrong fails open into the exact
 * bug it exists to fix.
 *
 * The signature is not verified, for the reason `isLiveAccessToken` gives: the browser has no
 * key and the API still authenticates every call. This decides a REDIRECT, never access —
 * `/admin` re-checks with AdminLayout, and every admin endpoint checks server-side.
 */
export function getAccessTokenRoles(token: string | null | undefined): string[] {
  if (!token) return [];

  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return [];

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const claim =
      payload["role"] ??
      payload["roles"] ??
      payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

    if (typeof claim === "string") return [claim.toLowerCase()];
    if (Array.isArray(claim)) {
      return claim.filter((r): r is string => typeof r === "string").map((r) => r.toLowerCase());
    }
    return [];
  } catch {
    return [];
  }
}

/** Whether the token names a WarpTalk platform administrator (auth.roles, not a workspace role). */
export function isPlatformAdminToken(token: string | null | undefined): boolean {
  return getAccessTokenRoles(token).includes("admin");
}

export function isAccessTokenExpiring(
  token: string | null | undefined,
  nowMs = Date.now(),
  refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS,
): boolean {
  const expiresAtMs = getAccessTokenExpiryMs(token);
  return expiresAtMs === null || expiresAtMs <= nowMs + refreshWindowMs;
}

export function chooseNewestAccessToken(
  first: string | null | undefined,
  second: string | null | undefined,
): string | null {
  if (!first) return second ?? null;
  if (!second) return first;

  const firstExpiry = getAccessTokenExpiryMs(first);
  const secondExpiry = getAccessTokenExpiryMs(second);

  if (firstExpiry === null) return secondExpiry === null ? first : second;
  if (secondExpiry === null) return first;
  return secondExpiry > firstExpiry ? second : first;
}
