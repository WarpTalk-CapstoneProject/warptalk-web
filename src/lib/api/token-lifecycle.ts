const DEFAULT_REFRESH_WINDOW_MS = 30_000;

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
