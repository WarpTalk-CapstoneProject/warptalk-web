import { getAccessTokenExpiryMs } from "../api/token-lifecycle.ts";

/**
 * The single owner of the session cookies.
 *
 * Before this module, `setAccessTokenCookie` existed in four separate files with two
 * different implementations, and every caller passed only the access token — so the
 * `expiresAt` the server had just sent was destructured out of the response and thrown
 * away, and the cookie was written with a hardcoded seven-day lifetime.
 *
 * Seven days is not an arbitrary wrong number: it is the *refresh* token's lifetime
 * (backend `Jwt:RefreshTokenExpiryDays`). The access token lives 30 minutes
 * (`Jwt:AccessTokenExpiryMinutes`). The cookie was therefore given the refresh token's
 * lifetime while holding the access token's value, and stayed "present" for a week after
 * the thing inside it died.
 *
 * The fix is to stop making one cookie answer two different questions:
 *
 *   `access_token`     — the access token itself. Expires exactly when the token does, so
 *                        its presence means the value inside it is still usable.
 *   `warptalk_session` — a value-less marker meaning "this browser has a refresh token
 *                        that may still be redeemable". Lives for the refresh token's
 *                        horizon. Carries no credential, so it is useless to an attacker.
 *
 * Middleware gates the redirect *away from* /login on the first and route access on the
 * second. That is what lets an expired access token stop being treated as proof of a live
 * session without cutting every session down to 30 minutes.
 */

export const ACCESS_TOKEN_COOKIE = "access_token";
export const SESSION_MARKER_COOKIE = "warptalk_session";

/**
 * Mirrors the backend's `Jwt:RefreshTokenExpiryDays` (7). The refresh token's real expiry
 * is not in `AuthResponse`, so this is a mirrored constant rather than a derived value — if
 * the backend ever starts sending `refreshTokenExpiresAt`, this should read that instead.
 *
 * Being a marker and not a credential, erring long here leaks nothing: the worst case is a
 * redirect to a page whose first API call 401s and ends the session.
 */
export const SESSION_MARKER_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * When the access token in `token` stops being valid, in epoch ms.
 *
 * Two independent sources agree on this in the normal case: the server's `expiresAt` and
 * the token's own `exp` claim. We take the *earlier* of the two. `expiresAt` is a string
 * the server formats and the browser parses, so it is the one that can go wrong — a
 * timestamp serialised without a timezone parses as local time, which on a negative UTC
 * offset would land in the future. `exp` is inside the token the API itself will validate,
 * so it is the authority; taking the minimum means a bad `expiresAt` can only ever shorten
 * the cookie, never let it outlive the token.
 *
 * Returns null when neither source is readable.
 */
export function resolveAccessTokenExpiryMs(
  accessToken: string | null | undefined,
  expiresAt?: string | null,
): number | null {
  const fromClaim = getAccessTokenExpiryMs(accessToken);

  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const fromResponse = Number.isFinite(parsed) ? parsed : null;

  if (fromClaim === null) return fromResponse;
  if (fromResponse === null) return fromClaim;
  return Math.min(fromClaim, fromResponse);
}

/**
 * True when the token is a decodable JWT whose `exp` is still in the future.
 *
 * The signature is deliberately not verified — the browser has no key, and the API still
 * enforces real authentication on every call. This only answers the question the browser
 * *can* answer on its own: "is this thing already dead?" A token that cannot be decoded is
 * answered the same way as one that has expired, because a caller that cannot tell when a
 * token dies must not be the thing deciding that it is alive.
 */
export function isLiveAccessToken(
  accessToken: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const expiryMs = getAccessTokenExpiryMs(accessToken);
  return expiryMs !== null && expiryMs > nowMs;
}

function cookieSuffix(): string {
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  return `; SameSite=Lax${secure}`;
}

/**
 * True when this browser looks like it still holds a redeemable refresh token.
 *
 * This is the only question JavaScript can still ask about the refresh token. The token
 * itself lives in the `warptalk_refresh` HttpOnly cookie (backend `AuthSessionCookies`),
 * which is the point of it being HttpOnly — no script can read it, so no XSS can steal it.
 * The consequence is that nothing in this client can inspect the credential to decide
 * whether refreshing is worth attempting, and the code that used to do exactly that
 * silently stopped refreshing at all: `getRefreshToken()` read localStorage, the server had
 * stopped putting the token there, so every refresh decision resolved to "there is nothing
 * to send" and every session died at the thirty-minute mark.
 *
 * So the question is asked of the marker instead, which is written next to the access token
 * on every login and every refresh and carries no credential. It is deliberately weaker
 * than the truth: a marker without a live refresh cookie merely costs one request that comes
 * back 400 and ends the session properly, which is the correct outcome anyway. Being wrong
 * in the other direction — refusing to refresh while a valid cookie sits in the jar — is the
 * failure that has to stay impossible, so the access token counts as evidence too, for the
 * case where a cookie write was blocked but the session is real.
 */
export function hasRedeemableSession(
  accessToken?: string | null,
  cookieSource: string = typeof document === "undefined" ? "" : document.cookie,
): boolean {
  const prefix = `${SESSION_MARKER_COOKIE}=`;
  for (const part of cookieSource.split("; ")) {
    if (part.startsWith(prefix) && part.length > prefix.length) return true;
  }

  return Boolean(accessToken);
}

/**
 * Build the `document.cookie` assignment for the access token, or null when we refuse to
 * write one.
 *
 * The `expiresAt` argument is required rather than optional on purpose. Every historical
 * copy of this function that accepted it optionally had a fallback that outlived the token,
 * and every call site silently took the fallback. Making it required means the compiler,
 * not a reviewer, is what stops the next call site from omitting it.
 */
export function buildAccessTokenCookie(
  accessToken: string,
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  const expiryMs = resolveAccessTokenExpiryMs(accessToken, expiresAt);

  // Already dead on arrival. Writing it would recreate exactly the state this change
  // exists to remove, so write nothing and let the caller clear instead.
  if (expiryMs !== null && expiryMs <= nowMs) return null;

  // Neither the response nor the token says when this dies. We refuse to invent a
  // lifetime: no `expires` and no `max-age` makes it a session cookie, which is the
  // shortest lifetime that still leaves the user logged in to the tab they just signed
  // in to. It cannot survive a browser restart, so it can never become the multi-day
  // wreckage that a 7-day guess produced.
  const lifetime =
    expiryMs === null ? "" : `; expires=${new Date(expiryMs).toUTCString()}`;

  return `${ACCESS_TOKEN_COOKIE}=${accessToken}; path=/${lifetime}${cookieSuffix()}`;
}

/**
 * Leaves a note saying which code path tore the session down.
 *
 * Three places clear session cookies — sign-out, rehydrate-with-nothing-to-refresh-with,
 * and an access token that arrived already expired — and from the outside all three look
 * identical: cookies gone, bounced to /login. Three separate attempts at this bug were
 * reasoned from source because there was no way to tell them apart afterwards.
 *
 * sessionStorage, not a log line: it survives the redirect to /login, which console output
 * does not, and it dies with the tab so it cannot accumulate.
 */
export const SESSION_TEARDOWN_KEY = "warptalk.session.teardown";

export function recordSessionTeardown(reason: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      SESSION_TEARDOWN_KEY,
      JSON.stringify({ reason, at: new Date().toISOString() }),
    );
  } catch {
    // A full or blocked sessionStorage must never be the thing that breaks sign-out.
  }
}

function writeCookie(value: string) {
  if (typeof document === "undefined") return;
  document.cookie = value;
}

/**
 * Record a freshly issued session. Called on login, register, Google sign-in and on every
 * token refresh — anywhere an `AuthResponse` arrives.
 */
export function setAccessTokenCookie(accessToken: string, expiresAt: string | null | undefined) {
  const cookie = buildAccessTokenCookie(accessToken, expiresAt);

  if (cookie === null) {
    // Only the access token. This used to call clearSessionCookies(), which took the
    // seven-day marker with it — and the marker is the whole reason an expired access
    // token is survivable: middleware reads it as "there is still a refresh token worth
    // redeeming". Killing it here turned a token that had merely aged out into a full
    // sign-out, which is exactly the "every 7-day session becomes a 30-minute one" this
    // module's own header says it exists to prevent. clearAccessTokenCookie is documented
    // three lines down as "leaving the session marker alone"; that is the one to call.
    recordSessionTeardown("expired-access-token-on-arrival");
    clearAccessTokenCookie();
    return;
  }

  writeCookie(cookie);
  writeCookie(
    `${SESSION_MARKER_COOKIE}=1; path=/; max-age=${SESSION_MARKER_MAX_AGE_SECONDS}${cookieSuffix()}`,
  );
}

/** Remove the access token cookie only, leaving the session marker alone. */
export function clearAccessTokenCookie() {
  writeCookie(`${ACCESS_TOKEN_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

/**
 * Remove every trace of the session from cookies **that this side is able to remove**.
 *
 * THAT QUALIFIER IS THE WHOLE PROBLEM, SO IT IS STATED HERE RATHER THAN DISCOVERED AGAIN.
 * The authoritative cookies are written by the server (`AuthSessionCookies.Write`) with
 * `HttpOnly = true` and `Domain = .warptalk.io.vn`. No script can delete an HttpOnly cookie —
 * that is the point of it — so in production this function clears only the host-only, script
 * -visible copies this client writes for itself, and the server's three survive it untouched.
 *
 * The only thing that clears the server's copies is a `POST /auth/logout` that actually
 * succeeds. When that request fails — 429 from the gateway, or 401 because the credential is
 * already gone — the browser is left signed out in JavaScript and signed in to Next's
 * middleware, which reads cookies server-side and therefore CAN see the HttpOnly ones. That
 * disagreement is what produced the logout storm; see `markSessionDead`.
 */
export function clearSessionCookies() {
  clearAccessTokenCookie();
  writeCookie(`${SESSION_MARKER_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

/**
 * "This browser has given up on its session" — a fact that has to outlive a page load.
 *
 * WHY THIS EXISTS (the logout storm, and why three previous fixes did not hold)
 *   `endDeadSession()` escapes a dead session with `window.location.href = "/login"`. That is a
 *   FULL PAGE NAVIGATION, and it destroys every piece of module state in the tab — including the
 *   `sessionEnded` latch that is supposed to make one dead session produce one logout, and the
 *   revoke dedupe in revoke-session.ts that bounds it to one POST per credential. Both were
 *   written as module variables, so both evaporate at exactly the moment they are needed.
 *
 *   On its own that would cost one extra request. It became a storm because the navigation does
 *   not end anywhere: `proxy.ts` reads cookies SERVER-SIDE, so it sees the server's surviving
 *   HttpOnly `access_token`, decides the visitor is signed in, and bounces `/login` straight back
 *   to `/workspace`. The app loads fresh with no readable credential, 401s, declares the session
 *   dead, POSTs another logout, redirects to `/login`, and is bounced back again — about twice a
 *   second. Production, 16 Aug: 240 refused logouts inside one minute from a single address, and
 *   a gateway log that reads `GET /workspaces 401` / `POST /auth/logout 401` over and over.
 *
 * SO THE LATCH HAS TO LIVE WHERE THE LOOP LIVES: ACROSS PAGE LOADS.
 *   sessionStorage survives navigation within the tab and dies with the tab, which is exactly the
 *   scope of "this browsing session has already given up". The cookie beside it is for the other
 *   half of the disagreement — it is script-visible on purpose, so `proxy.ts` can see what the
 *   client concluded and stop redirecting a signed-out visitor back into the app.
 *
 * Short-lived by design. Two minutes is long enough to survive the redirect that follows it and
 * short enough that it can never become a second stale session marker of its own.
 */
export const SESSION_DEAD_COOKIE = "warptalk_session_dead";
export const SESSION_DEAD_MAX_AGE_SECONDS = 120;
export const SESSION_DEAD_KEY = "warptalk.session.dead";

export function markSessionDead() {
  writeCookie(
    `${SESSION_DEAD_COOKIE}=1; path=/; max-age=${SESSION_DEAD_MAX_AGE_SECONDS}${cookieSuffix()}`,
  );
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_DEAD_KEY, "1");
  } catch {
    // Blocked storage costs us the cross-page-load half of the latch, not correctness: the
    // cookie above still stops the middleware bounce, which is what closes the loop.
  }
}

/** Whether this tab has already declared its session dead, including before a page load. */
export function isSessionDeadMarked(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_DEAD_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A new session is alive, so the mark must go — both halves of it.
 *
 * Called on sign-in. Without this the marker would outlive the failure it describes and send a
 * freshly signed-in user straight back to /login, which is the same trap in the other direction.
 */
export function clearSessionDeadMarker() {
  writeCookie(`${SESSION_DEAD_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_DEAD_KEY);
  } catch {
    // Nothing to do — the cookie is the half the middleware reads.
  }
}
