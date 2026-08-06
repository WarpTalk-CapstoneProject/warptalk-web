import * as signalR from "@microsoft/signalr";
import { useAuthStore } from "@/stores/auth-store";
import { endDeadSession, isSessionEnded } from "@/lib/api/client";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
  process.env.NEXT_PUBLIC_SIGNALR_URL ||
  "http://localhost:5200";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1";
const TOKEN_REFRESH_SKEW_SECONDS = 30;

let refreshPromise: Promise<string | null> | null = null;

function isTokenExpiring(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    if (!payload.exp) return true;
    return payload.exp <= Math.floor(Date.now() / 1000) + TOKEN_REFRESH_SKEW_SECONDS;
  } catch {
    return true;
  }
}

async function refreshAccessToken() {
  const { accessToken, refreshToken } = useAuthStore.getState();
  if (accessToken && !isTokenExpiring(accessToken)) return accessToken;
  if (!refreshToken) return accessToken;

  refreshPromise ??= fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        // A 4xx means the refresh token itself was rejected. Handing the stale token back
        // would let the hub keep re-negotiating against a session that is already gone.
        if (response.status >= 400 && response.status < 500) {
          endDeadSession();
          return null;
        }
        return accessToken;
      }
      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
      document.cookie = `access_token=${data.accessToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      return data.accessToken;
    })
    .catch(() => accessToken)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

const RECONNECT_DELAYS_MS = [0, 2000, 5000, 10000, 30000];

/** True when a hub failure was the gateway refusing the token rather than a transport blip. */
export function isUnauthorizedHubError(error: unknown): boolean {
  if (!error) return false;

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (statusCode === 401 || statusCode === 403) return true;

  const message = error instanceof Error ? error.message : String(error);
  return /Status code '(401|403)'/.test(message);
}

/**
 * Reconnect through transport blips, but never through a rejected token.
 *
 * `withAutomaticReconnect` treats every failure as transient, so a 401 negotiation used to be
 * re-attempted on a fixed schedule for as long as the tab stayed open — one dead session per
 * tab, hammering the gateway's rate limiter alongside the REST retries.
 */
const reconnectPolicy: signalR.IRetryPolicy = {
  nextRetryDelayInMilliseconds(retryContext) {
    if (isSessionEnded() || isUnauthorizedHubError(retryContext.retryReason)) {
      return null;
    }
    return RECONNECT_DELAYS_MS[retryContext.previousRetryCount] ?? null;
  },
};

/**
 * Create a SignalR hub connection with JWT auth via query string.
 * Gateway expects: ?access_token=<jwt>
 *
 * Hubs:
 *   /hubs/translation-room     — TranslationRoomHub
 *   /hubs/notification         — NotificationHub
 *   /api/v1/meetings/chat-hub  — MeetingChatHub
 *   /api/v1/assistant/chat-hub — AssistantHub
 */
export function createHubConnection(
  hubPath:
    | "/hubs/translation-room"
    | "/hubs/notification"
    | "/api/v1/meetings/chat-hub"
    | "/api/v1/assistant/chat-hub"
): signalR.HubConnection {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${BASE_URL}${hubPath}`, {
      transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
      accessTokenFactory: async () => (await refreshAccessToken()) ?? "",
    })
    .withAutomaticReconnect(reconnectPolicy)
    .configureLogging(signalR.LogLevel.None)
    .build();

  return connection;
}
