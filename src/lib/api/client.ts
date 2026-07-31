import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";
import {
  chooseNewestAccessToken,
  isAccessTokenExpiring,
} from "@/lib/api/token-lifecycle";

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
  return getPersistedAuthState()?.refreshToken
    ?? useAuthStore.getState().refreshToken;
}

function persistTokens(accessToken: string, refreshToken: string) {
  useAuthStore.getState().setTokens(accessToken, refreshToken);

  if (typeof document !== "undefined") {
    document.cookie = `access_token=${accessToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  }
}

function isAuthEndpoint(url?: string) {
  return Boolean(
    url?.includes("/auth/login")
    || url?.includes("/auth/refresh")
    || url?.includes("/auth/register"),
  );
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
      throw new Error("No refresh token");
    }

    const { data } = await axios.post<AuthResponse>(
      `${apiClient.defaults.baseURL}/auth/refresh`,
      { refreshToken },
    );

    persistTokens(data.accessToken, data.refreshToken);
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

async function getUsableAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (token && !isAccessTokenExpiring(token)) {
    return token;
  }
  if (!getRefreshToken()) {
    return token;
  }
  return refreshAccessToken(token);
}

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (!isAuthEndpoint(config.url)) {
    const token = await getUsableAccessToken();
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
      const isAxiosError = axios.isAxiosError(refreshError);
      const isAuthError = isAxiosError && refreshError.response && refreshError.response.status >= 400 && refreshError.response.status < 500;

      // Only log out if the server explicitly rejected the refresh token
      // Do not log out on network errors or 5xx server errors
      if (isAuthError) {
        useAuthStore.getState().logout();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        // Return an unresolved promise to prevent React Query from retrying and causing infinite loop
        return new Promise(() => {});
      }
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
