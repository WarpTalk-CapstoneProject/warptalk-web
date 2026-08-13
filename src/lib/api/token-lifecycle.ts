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
