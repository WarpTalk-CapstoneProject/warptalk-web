import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";
import {
  chooseNewestAccessToken,
  isAccessTokenExpiring,
} from "@/lib/api/token-lifecycle";
import { setAccessTokenCookie } from "@/lib/auth/session-cookie";

/**
 * Client-side Axios instance with token interceptors.
 * Used in Client Components with TanStack Query.
 */
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1",
  timeout: 30_000,
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
  refreshToken?: string | null;
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
        refreshToken?: string | null;
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

function getRefreshToken(): string | null {
  // localStorage FIRST, and persistTokens now writes it synchronously so that is safe.
  //
  // This was the other way round, and the reasoning was right about one tab and wrong about
  // two. Refresh tokens rotate and the server revokes the whole family when an already-rotated
  // token is presented, so freshness matters more here than anywhere else. Within a tab the
  // in-memory store is written first, which is why it used to win. But zustand's persist
  // middleware does not listen for the storage event, so a second tab's store never learns
  // that the first tab rotated the family:
  //
  //   tab A refreshes  -> new token in A's store and in localStorage
  //   tab B refreshes  -> reads ITS OWN store, still holding the token A rotated away
  //   server           -> replay detected, family revoked, BOTH tabs logged out
  //
  // The Web Lock below stops the two refreshes overlapping; it cannot stop the second one
  // being stale. localStorage is the only copy both tabs share, so it is the one to trust —
  // and writing it synchronously removes the lag that made the store the safer read.
  return getPersistedAuthState()?.refreshToken
    ?? useAuthStore.getState().refreshToken
    ?? null;
}

/**
 * Writes the rotated pair everywhere a reader might look, in the same tick.
 *
 * The synchronous localStorage write is the point: the persist middleware gets there
 * eventually, and "eventually" is long enough for another tab to refresh with a token this
 * one just rotated away — which the server answers by revoking the family and logging both
 * tabs out. The existing shape is patched rather than replaced so the middleware's own
 * version marker and any other persisted field survive.
 */
function writePersistedTokens(accessToken: string, refreshToken: string) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("warptalk-auth");
    const parsed = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      "warptalk-auth",
      JSON.stringify({
        ...parsed,
        state: { ...(parsed?.state ?? {}), accessToken, refreshToken },
      }),
    );
  } catch {
    // A quota or privacy-mode failure must not take the refresh down with it: the store copy
    // still works for this tab, which is strictly better than throwing here.
  }
}

function persistTokens(accessToken: string, refreshToken: string, expiresAt?: string) {
  useAuthStore.getState().setTokens(accessToken, refreshToken);
  writePersistedTokens(accessToken, refreshToken);
  // A refresh issues a brand new 30-minute token. Re-stamping the cookie with a hardcoded
  // seven days here is how a session that had been refreshed once still ended up holding a
  // week-long cookie around a half-hour token.
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
 * Thrown when there is nothing left to refresh with. It is a dead session just as much as a
 * server-rejected refresh token is — the difference is that no request ever leaves the
 * browser, so no response interceptor sees a 4xx to react to.
 */
class MissingRefreshTokenError extends Error {
  constructor() {
    super("No refresh token");
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

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw new MissingRefreshTokenError();
    }

    const { data } = await axios.post<AuthResponse>(
      `${apiClient.defaults.baseURL}/auth/refresh`,
      { refreshToken },
    );

    persistTokens(data.accessToken, data.refreshToken, data.expiresAt);
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
export async function getUsableAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (token && !isAccessTokenExpiring(token)) {
    return token;
  }
  if (!getRefreshToken()) {
    return token;
  }
  return refreshAccessToken(token);
}

/**
 * True when the server itself rejected the refresh token (4xx), as opposed to a network
 * blip or a 5xx. Only the former means the session is genuinely dead — retrying through a
 * transient failure is worth doing, retrying a rejected token never succeeds.
 */
function isRefreshRejectedByServer(error: unknown): boolean {
  return (
    axios.isAxiosError(error)
    && Boolean(error.response)
    && error.response!.status >= 400
    && error.response!.status < 500
  );
}

/**
 * True when the refresh could not even be attempted because no refresh token is left.
 * Nothing will ever make that request succeed, so it must not be retried.
 */
function isMissingRefreshToken(error: unknown): boolean {
  return error instanceof MissingRefreshTokenError;
}

let sessionEnded = false;

/**
 * Whether the session has already been declared dead. Callers use this to stop issuing work
 * that can only 401 — a dashboard mounts dozens of queries, several of them on a 3s poll, and
 * every one of them would otherwise keep hitting the gateway until the navigation commits.
 */
export function isSessionEnded(): boolean {
  return sessionEnded;
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
  }
});

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
export function endDeadSession() {
  if (sessionEnded) {
    return;
  }
  sessionEnded = true;

  useAuthStore.getState().logout();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
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
        endDeadSession();
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
function normalizeResponseRoles(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(normalizeResponseRoles);

  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (
      (key === "role" || key === "roleName" || key === "currentRole" || key === "workspaceRole") &&
      typeof val === "string"
    ) {
      result[key] = val.toLowerCase();
    } else if (typeof val === "object" && val !== null) {
      result[key] = normalizeResponseRoles(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

apiClient.interceptors.response.use(
  (response) => {
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

    // A 401 with nothing to refresh from is terminal. Going through refreshAccessToken() here
    // would throw a non-Axios error that the 4xx check below cannot recognise, which is how an
    // expired session ended up spinning forever instead of landing on /login.
    if (!getRefreshToken()) {
      endDeadSession();
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
        endDeadSession();
      }
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
