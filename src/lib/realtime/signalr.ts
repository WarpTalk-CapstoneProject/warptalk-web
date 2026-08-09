import * as signalR from "@microsoft/signalr";
import { useAuthStore } from "@/stores/auth-store";
import { endDeadSession, getUsableAccessToken, isSessionEnded } from "@/lib/api/client";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
  process.env.NEXT_PUBLIC_SIGNALR_URL ||
  "http://localhost:5200";
/*
 * There is no refresh here any more, and that is the point.
 *
 * This module used to carry its own: its own in-flight promise, its own expiry check, its own
 * POST to the refresh endpoint — and, unlike lib/api/client.ts, no cross-tab Web Lock at
 * all. (The path is spelled out nowhere in this file on purpose: the contract that keeps a
 * second refresher from growing back matches the file's text, so a comment naming the route
 * would fail it.)
 *
 * Refresh tokens rotate, and the server revokes the WHOLE rotation family the moment an
 * already-rotated token is presented again (TokenService.RefreshTokenAsync — it reads a
 * replay as a stolen token, correctly). So two independent refreshers in one tab, plus no
 * coordination between tabs, meant that every time a hub reconnect landed near an HTTP
 * request one of them presented the token the other had just rotated away. The family was
 * revoked, and the user was returned to the login screen roughly every half hour with
 * nothing on screen to explain it.
 *
 * One refresher now, behind one lock, shared with every other request.
 */

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
      accessTokenFactory: async () => {
        try {
          return (await getUsableAccessToken()) ?? "";
        } catch (error) {
          // A REJECTED refresh token means the session is genuinely over — handing the stale
          // token back would let the hub re-negotiate forever against a session that is gone.
          // Anything else is a transport problem the reconnect policy should be allowed to
          // ride out, and ending the session over a flaky network is the very complaint this
          // change exists to fix.
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status !== undefined && status >= 400 && status < 500) {
            endDeadSession();
            return "";
          }
          return useAuthStore.getState().accessToken ?? "";
        }
      },
    })
    .withAutomaticReconnect(reconnectPolicy)
    .configureLogging(signalR.LogLevel.None)
    .build();

  return connection;
}
