import * as signalR from "@microsoft/signalr";
import { useAuthStore } from "@/stores/auth-store";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
  process.env.NEXT_PUBLIC_SIGNALR_URL ||
  "http://localhost:5200";

/**
 * Create a SignalR hub connection with JWT auth via query string.
 * Gateway expects: ?access_token=<jwt>
 *
 * Hubs:
 *   /hubs/translation-room — TranslationRoomHub
 *   /hubs/notification     — NotificationHub
 */
export function createHubConnection(
  hubPath: "/hubs/translation-room" | "/hubs/notification"
): signalR.HubConnection {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${BASE_URL}${hubPath}`, {
      accessTokenFactory: () => {
        return useAuthStore.getState().accessToken ?? "";
      },
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  return connection;
}
