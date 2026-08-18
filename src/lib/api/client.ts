import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";
import {
  chooseNewestAccessToken,
  DEFAULT_REFRESH_WINDOW_MS,
  isAccessTokenExpiring,
  PROACTIVE_REFRESH_MARGIN_MS,
  PROACTIVE_REFRESH_WINDOW_MS,
} from "@/lib/api/token-lifecycle";
import { normalizeResponseRoles } from "@/lib/api/normalize-response";
import {
  clearSessionDeadMarker,
  hasRedeemableSession,
  isSessionDeadMarked,
  markSessionDead,
  recordSessionTeardown,
  resolveAccessTokenExpiryMs,
  setAccessTokenCookie,
} from "@/lib/auth/session-cookie";

/**
 * Client-side Axios instance with token interceptors.
 * Used in Client Components with TanStack Query.
 */
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1",
  timeout: 30_000,
  // The session lives in HttpOnly cookies, so the refresh cannot work without this.
  //
  // Production is cross-origin — app.warptalk.io.vn calling api.warptalk.io.vn — and a
  // cross-origin XHR sends no cookies at all unless it asks to. The refresh token is in the
  // `warptalk_refresh` cookie and nowhere else, so without this flag the browser held a
  // perfectly valid credential and never sent it: every session ended after exactly one
  // access-token lifetime. The two subdomains share the registrable domain, which is what
  // makes the cookie's SameSite=Lax survive the trip; the gateway answers the preflight with
  // Access-Control-Allow-Credentials: true.
  //
  // This does not weaken the bearer-token scheme. The gateway takes the JWT from the
  // Authorization header (and, for hub paths only, the query string) and never from a cookie,
  // so an access_token cookie riding along cannot shadow the header set below.
  withCredentials: true,
});

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }

  return null;
}

function getPersistedAuthState(): {
  accessToken?: string | null;
} | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const persisted = localStorage.getItem("warptalk-auth");
    if (!persisted) return null;
    const parsed = JSON.parse(persisted) as {
      state?: {
        accessToken?: string | null;
      };
    };
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

function getAccessToken(): string | null {
  const storeToken = useAuthStore.getState().accessToken;
  const persistedToken = getPersistedAuthState()?.accessToken;
  const cookieToken = getCookieValue("access_token");

  return chooseNewestAccessToken(
    chooseNewestAccessToken(storeToken, persistedToken),
    cookieToken,
  );
}

/**
 * Whether a refresh is worth attempting. See `hasRedeemableSession` for why this is the
 * strongest question that can still be asked.
 *
 * What used to be here read the refresh token out of localStorage and the zustand store, and
 * ranked the two by staleness because a stale one revokes the rotation family. That ranking
 * is now moot in the best possible way: the browser's cookie jar holds exactly one refresh
 * token per browser and the server rotates it in place with Set-Cookie, so two tabs cannot
 * hold different copies. The Web Lock below still matters — two tabs presenting the *same*
 * cookie concurrently is a replay, and the server revokes the family for that — but the
 * cross-tab staleness this function used to guard against no longer has a way to happen.
 */
function canAttemptRefresh(): boolean {
  return hasRedeemableSession(getAccessToken());
}

/**
 * Writes the new access token everywhere a reader might look, in the same tick.
 *
 * The synchronous localStorage write is what stops a reader seeing the old token after the
 * refresh has completed: the persist middleware gets there eventually, and "eventually" is
 * long enough for a concurrent request to attach a token that has just been replaced. The
 * existing shape is patched rather than replaced so the middleware's own version marker and
 * any other persisted field survive.
 */
function writePersistedTokens(accessToken: string) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("warptalk-auth");
    const parsed = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      "warptalk-auth",
      JSON.stringify({
        ...parsed,
        state: { ...(parsed?.state ?? {}), accessToken },
      }),
    );
  } catch {
    // A quota or privacy-mode failure must not take the refresh down with it: the store copy
    // still works for this tab, which is strictly better than throwing here.
  }
}

function persistTokens(accessToken: string, expiresAt?: string) {
  useAuthStore.getState().setTokens(accessToken);
  writePersistedTokens(accessToken);
  // A refresh issues a brand new 30-minute token. Re-stamping the cookie with a hardcoded
  // seven days here is how a session that had been refreshed once still ended up holding a
  // week-long cookie around a half-hour token.
  //
  // This also re-stamps the seven-day session marker, which is what keeps an actively used
  // session's marker ahead of the refresh cookie the server is rotating underneath it.
  setAccessTokenCookie(accessToken, expiresAt);
}

/**
 * Endpoints that must never have an Authorization header attached, and must never be
 * blocked by the dead-session latch — they are how a user gets *out* of a dead session.
 *
 * Matched against whole path segments rather than by substring. The previous
 * `url.includes("/auth/login")` check silently failed to match "/auth/google-login"
 * (the substring is "-login", not "/login"), and never mentioned forgot-password,
 * reset-password or verify-email at all. The consequence was not cosmetic: once
 * `endDeadSession()` had latched, the request interceptor threw `SessionEndedError` for
 * every one of these, so a user with an expired session could not sign in with Google
 * and could not reset their password.
 */
const UNAUTHENTICATED_AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/google-login",
  "/auth/register",
  "/auth/register-invited",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
];

/**
 * Endpoints the interceptors must keep their hands off, even though they are
 * authenticated.
 *
 * /auth/logout is `[Authorize]` on the server, so it needs a bearer token — but
 * it is sent by the store's logout() at the exact moment the session is being
 * torn down. If the request interceptor managed this one, it would look up a
 * token from a store that is already empty, decide the session is dead, and
 * fire endDeadSession() — turning every sign-out into a hard redirect and, far
 * worse, stripping the credential the revoke needs to work at all. The caller
 * passes the departing access token explicitly instead; this exemption is what
 * stops the interceptor from clobbering it. A 401 here is likewise terminal by
 * design: the caller treats the revoke as best effort.
 */
const INTERCEPTOR_MANAGED_EXEMPT_ENDPOINTS = ["/auth/logout"];

function isAuthEndpoint(url?: string) {
  if (!url) return false;
  const path = url.split("?")[0].replace(/\/+$/, "");
  return [
    ...UNAUTHENTICATED_AUTH_ENDPOINTS,
    ...INTERCEPTOR_MANAGED_EXEMPT_ENDPOINTS,
  ].some((endpoint) => path === endpoint || path.endsWith(endpoint));
}

function isFormDataLike(value: unknown): value is Record<string | symbol, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (typeof FormData !== "undefined" && value instanceof FormData) {
    return true;
  }

  const candidate = value as {
    append?: unknown;
    getHeaders?: unknown;
    [Symbol.toStringTag]?: unknown;
  };

  return (
    typeof candidate.append === "function" &&
    (
      candidate[Symbol.toStringTag] === "FormData" ||
      Object.prototype.toString.call(candidate) === "[object FormData]" ||
      typeof candidate.getHeaders === "function"
    )
  );
}

// ─── Request interceptor: attach access token ───
let refreshPromise: Promise<string> | null = null;

/**
 * Thrown when there is no sign this browser holds a redeemable session, so a refresh would be
 * a request made on spec. It is a dead session just as much as a server-rejected refresh token
 * is — the difference is that no request ever leaves the browser, so no response interceptor
 * sees a 4xx to react to.
 */
class MissingRefreshTokenError extends Error {
  constructor() {
    super("No redeemable session");
    this.name = "MissingRefreshTokenError";
  }
}

/**
 * Thrown instead of sending a request that is already known to be pointless because the
 * session has been declared dead and the redirect to /login is in flight.
 */
export class SessionEndedError extends Error {
  constructor() {
    super("Session ended");
    this.name = "SessionEndedError";
  }
}

async function requestNewAccessToken(failedAccessToken?: string | null): Promise<string> {
  const refreshInsideLock = async () => {
    const latestAccessToken = getAccessToken();
    const anotherRequestAlreadyRefreshed = Boolean(
      failedAccessToken
      && latestAccessToken
      && latestAccessToken !== failedAccessToken
      && !isAccessTokenExpiring(latestAccessToken, Date.now(), 5_000),
    );
    const proactiveRefreshAlreadyCompleted = Boolean(
      !failedAccessToken
      && latestAccessToken
      && !isAccessTokenExpiring(latestAccessToken),
    );

    if (anotherRequestAlreadyRefreshed || proactiveRefreshAlreadyCompleted) {
      return latestAccessToken!;
    }

    if (!canAttemptRefresh()) {
      // The reason production saw ZERO /auth/refresh requests while users were being logged
      // out: the request was never made, because the client was looking for the refresh token
      // in localStorage and the server had moved it into an HttpOnly cookie. What was
      // observable at the moment of the decision is recorded rather than deduced — three
      // rounds of reading this code failed to establish it from source alone.
      recordSessionTeardown(
        `no-redeemable-session(marker=${hasRedeemableSession(null) ? "yes" : "no"},access=${getAccessToken() ? "yes" : "no"})`,
      );
      throw new MissingRefreshTokenError();
    }

    // No body and no bearer token: the credential is the `warptalk_refresh` HttpOnly cookie,
    // and withCredentials is what puts it on the wire. A bare axios call rather than
    // apiClient, deliberately — going through the instance would re-enter the request
    // interceptor that is very likely the caller here.
    const { data } = await axios.post<AuthResponse>(
      `${apiClient.defaults.baseURL}/auth/refresh`,
      {},
      { withCredentials: true },
    );

    persistTokens(data.accessToken, data.expiresAt);
    return data.accessToken;
  };

  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("warptalk-auth-refresh", refreshInsideLock);
  }

  return refreshInsideLock();
}

function refreshAccessToken(failedAccessToken?: string | null): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = requestNewAccessToken(failedAccessToken)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * The one place anything may obtain a usable access token.
 *
 * Exported because lib/signalr.ts used to carry its OWN refresh — its own in-flight promise,
 * and no cross-tab Web Lock at all. Two independent refreshers against a rotating token whose
 * server revokes the entire family on replay is a session that ends itself, on a timer, for
 * no reason the user can see.
 */
export async function getUsableAccessToken(
  refreshWindowMs: number = DEFAULT_REFRESH_WINDOW_MS,
): Promise<string | null> {
  const token = getAccessToken();
  if (token && !isAccessTokenExpiring(token, Date.now(), refreshWindowMs)) {
    return token;
  }
  if (!canAttemptRefresh()) {
    return token;
  }
  return refreshAccessToken(token);
}

/**
 * Statuses that are never a verdict on the refresh token, even though they are 4xx.
 *
 * WT-344: "any 4xx means the session is dead" was too wide by construction. None of these says
 * anything about the credential — 404 is a route that is not there (a version skew mid-deploy),
 * 408/425 are timing, 429 is rate limiting — and each one of them was, until now, able to end a
 * perfectly good week-long session permanently.
 */
const TRANSIENT_REFRESH_STATUSES = new Set([404, 408, 425, 429]);

/**
 * True when the server itself rejected the refresh token, as opposed to a network blip, a 5xx,
 * or a 4xx that is not about the token at all. Only a rejection means the session is genuinely
 * dead — retrying through a transient failure is worth doing, retrying a rejected token never
 * succeeds.
 *
 * 400 counts as a rejection because that is what this backend returns for one
 * (TokenController.Refresh). It used to return 400 for a service fault too, which is what let a
 * database blip during a deploy sign every open browser out; that now comes back as 503 and
 * lands in the transient branch below. This client-side guard stays regardless — it must not
 * take a single status code's word for the difference between "no" and "I could not check".
 */
function isRefreshRejectedByServer(error: unknown): boolean {
  if (!axios.isAxiosError(error) || !error.response) return false;
  const { status } = error.response;
  if (status < 400 || status >= 500) return false;
  return !TRANSIENT_REFRESH_STATUSES.has(status);
}

/**
 * True when the refresh could not even be attempted because no refresh token is left.
 * Nothing will ever make that request succeed, so it must not be retried.
 */
function isMissingRefreshToken(error: unknown): boolean {
  return error instanceof MissingRefreshTokenError;
}

/**
 * A short tag naming why the session was declared dead, for the teardown breadcrumb.
 *
 * The status is the whole point: "http-400" and "no-refresh-token" call for completely
 * different investigations, and telling them apart afterwards is exactly what the breadcrumb
 * failed to do the one time it mattered.
 */
function describeRefreshFailure(error: unknown): string {
  if (isMissingRefreshToken(error)) return "no-refresh-token";
  if (axios.isAxiosError(error) && error.response) return `http-${error.response.status}`;
  return "unknown";
}

let sessionEnded = false;

/**
 * Whether the session has already been declared dead. Callers use this to stop issuing work
 * that can only 401 — a dashboard mounts dozens of queries, several of them on a 3s poll, and
 * every one of them would otherwise keep hitting the gateway until the navigation commits.
 *
 * It asks sessionStorage as well as this module's own flag, and that is the fix for the logout
 * storm rather than a refinement of it. `endDeadSession()` leaves by reassigning
 * `window.location`, which destroys module state — so a latch that lives only here is guaranteed
 * to be empty on the very next load, which is precisely when the loop comes back round. See
 * markSessionDead().
 *
 * Read lazily, never at module scope: this module must perform no work when it is imported.
 */
export function isSessionEnded(): boolean {
  return sessionEnded || isSessionDeadMarked();
}

// A new access token means the session is alive again, so the latch has to lift.
//
// Signing in does not reload the page — the login page navigates with router.replace() — and
// endDeadSession() deliberately skips the redirect when the user is already on /login. Without
// this, a 401 noticed while sitting on the login screen would latch the client shut and the
// next successful login would be unable to send a single request.
useAuthStore.subscribe((state, previousState) => {
  if (state.accessToken && state.accessToken !== previousState.accessToken) {
    sessionEnded = false;
    // The persistent half too, or a tab that recovered would keep the mark and be sent back to
    // /login by the middleware on its next navigation — the same trap, pointing the other way.
    clearSessionDeadMarker();
  }
  if (state.accessToken !== previousState.accessToken) {
    scheduleProactiveRefresh(state.accessToken);
  }
});

/**
 * Start the refresh timer for a session that is already in place on load.
 *
 * Called from a React effect, never at module scope. The module-level version of this took
 * production down with "Cannot access 'X' before initialization": it read useAuthStore while
 * this module and the auth store were still evaluating each other, and the store's binding
 * was in its temporal dead zone. Deferring it with setTimeout would have hidden that; not
 * running it during module evaluation at all removes it.
 *
 * `next build` compiles a TDZ error without complaint — it is a runtime fault — so nothing in
 * CI could have caught this. The rule that can be enforced is simpler: this module performs
 * no work when it is imported.
 */
export function startProactiveRefresh() {
  scheduleProactiveRefresh(getAccessToken());
}

/**
 * Drop the dead session and send the user to sign in again.
 *
 * The pathname guard matters: without it, a failing request on /login itself would
 * reassign window.location to /login over and over.
 *
 * The `sessionEnded` latch matters just as much: a dashboard fails N requests concurrently,
 * and each one used to reassign window.location independently. One dead session is one
 * logout and one redirect, however many requests noticed it.
 */
export function endDeadSession(cause: string = "unknown") {
  if (isSessionEnded()) {
    return;
  }
  sessionEnded = true;
  // Before logout() and before the redirect. This is what makes the latch survive the full page
  // navigation two lines down — and what tells proxy.ts to stop bouncing this visitor back into
  // the app on the strength of an HttpOnly cookie only it can see. Without it, every iteration
  // of that bounce arrives with a clean module state and sends one more POST /auth/logout;
  // production measured 240 refusals in a minute from one address.
  markSessionDead();

  useAuthStore.getState().logout();
  // AFTER logout, deliberately. logout() writes "user-sign-out", which is what it is when a
  // person clicks it and a lie when the client decides the session is dead. Last write wins,
  // so the breadcrumb ends up saying which of the two actually happened.
  //
  // WT-344: the cause is part of the reason now. This wrote a bare
  // "client-declared-session-dead", which overwrote the far more specific
  // "refresh-token-missing(store=..,persisted=..)" recorded moments earlier — so the one
  // breadcrumb that survived to be read could not tell a rejected token from a missing one,
  // and a real production logout had to be narrowed down by correlating timestamps against a
  // deploy log. An instrument that erases its own finding is worse than none.
  recordSessionTeardown(`client-declared-session-dead(${cause})`);
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

/**
 * Refresh before the token dies, instead of waiting for a request to notice it is dead.
 *
 * The 30-minute logout was not mysterious once this was missing: refresh only ever ran from
 * the request interceptor, and a user sitting in a meeting makes almost no REST calls — the
 * meeting runs on SignalR and LiveKit. So the access token quietly aged out, and the first
 * request after that had to refresh, redirect, or fail. Exactly thirty minutes, every time,
 * which is what was reported.
 *
 * Two minutes of margin, and never sooner than ten seconds from now: a token that is already
 * past due must not spin this into a tight loop.
 */
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh(accessToken: string | null) {
  if (proactiveRefreshTimer !== null) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  if (typeof window === "undefined" || !accessToken) return;

  const expiryMs = resolveAccessTokenExpiryMs(accessToken, null);
  if (expiryMs === null) return;

  const delay = Math.max(10_000, expiryMs - Date.now() - PROACTIVE_REFRESH_MARGIN_MS);
  proactiveRefreshTimer = setTimeout(() => {
    proactiveRefreshTimer = null;
    // PROACTIVE_REFRESH_WINDOW_MS, not the default: this timer wakes further out than the
    // reactive window, and passing the default made the refresher declare the token healthy
    // and hand it straight back. See token-lifecycle.ts.
    //
    // Failures are the request interceptor's problem, not this timer's: it must not end a
    // session on its own, or a laptop waking from sleep would sign the user out.
    void getUsableAccessToken(PROACTIVE_REFRESH_WINDOW_MS)
      .then((token) => {
        // Rearm. A successful refresh writes the new token to the store, and the subscription
        // above reschedules from there — but only when the value actually changed. A refresh
        // that another tab had already completed returns the token this timer is holding, so
        // nothing changes, nothing reschedules, and the session runs out with no timer armed.
        //
        // Guarded on the token still being alive so a failed refresh cannot turn this into a
        // ten-second poll: once it is dead there is nothing useful left to do here, and the
        // next request is what ends the session.
        if (token && token === getAccessToken() && !isAccessTokenExpiring(token)) {
          scheduleProactiveRefresh(token);
        }
      })
      .catch(() => {});
  }, delay);
}

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (!isAuthEndpoint(config.url)) {
    // Once the session is dead the redirect is already under way, but a full-page navigation
    // is not instant and nothing unmounts the React tree in the meantime. Failing here keeps
    // the pollers and refetches off the wire instead of letting them 401 in a loop.
    if (isSessionEnded()) {
      throw new SessionEndedError();
    }

    let token: string | null = null;
    try {
      token = await getUsableAccessToken();
    } catch (error) {
      // The refresh that runs BEFORE a request is sent fails here, not in the response
      // interceptor below — which is why a rejected refresh token used to leave the app
      // running with isAuthenticated: true in localStorage, retrying forever and never
      // reaching a login screen. Whoever notices the session is dead has to end it.
      //
      // A missing refresh token counts too: it produces a plain Error rather than an
      // AxiosError, so it used to slip past the 4xx check and leave the session alive.
      if (isRefreshRejectedByServer(error) || isMissingRefreshToken(error)) {
        endDeadSession(describeRefreshFailure(error));
      }
      throw error;
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  // If request body is FormData, ensure Content-Type is deleted so browser sets boundary automatically
  if (isFormDataLike(config.data)) {
    if (config.headers) {
      const headers = config.headers as Record<string, unknown> & {
        setContentType?: (value?: string | false) => void;
        delete?: (name: string) => void;
      };
      headers.setContentType?.(undefined);
      headers.delete?.("Content-Type");
      headers.delete?.("content-type");
      delete headers["Content-Type"];
      delete headers["content-type"];
    }
  }

  return config;
});

// ─── Response interceptor: refresh on 401 ───
apiClient.interceptors.response.use(
  (response) => {
    // A response the caller asked for as bytes has no roles in it to normalise, and walking it
    // can only do harm. `isPlainObject` already refuses to rebuild a Blob, but stating the rule
    // here as well is what stops the next binary response type from having to rediscover it:
    // a file download crashed the document page with "x.text is not a function", and the same
    // `{}` was being handed to every artifact and transcript download in the app.
    const responseType = response.config?.responseType;
    if (responseType && responseType !== "json") {
      return response;
    }

    if (response.data) {
      response.data = normalizeResponseRoles(response.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      isAuthEndpoint(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    // A 401 with nothing to redeem is terminal. Going through refreshAccessToken() here would
    // throw a non-Axios error that the 4xx check below cannot recognise, which is how an
    // expired session ended up spinning forever instead of landing on /login.
    if (!canAttemptRefresh()) {
      endDeadSession("no-redeemable-session-on-401");
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const failedAuthorization = originalRequest.headers.Authorization;
      const failedAccessToken = typeof failedAuthorization === "string"
        ? failedAuthorization.replace(/^Bearer\s+/i, "")
        : null;
      const accessToken = await refreshAccessToken(failedAccessToken);
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Only log out if the server explicitly rejected the refresh token, or if the refresh
      // token vanished between the check above and the refresh itself.
      // Do not log out on network errors or 5xx server errors.
      if (isRefreshRejectedByServer(refreshError) || isMissingRefreshToken(refreshError)) {
        endDeadSession(describeRefreshFailure(refreshError));
      }
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
