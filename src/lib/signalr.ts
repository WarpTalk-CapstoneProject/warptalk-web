import * as signalR from "@microsoft/signalr";
import { useAuthStore } from "@/stores/auth-store";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
  "http://localhost:5000";

/**
 * Create a SignalR hub connection with JWT auth via query string.
 * Gateway expects: ?access_token=<jwt>
 *
 * Hubs:
 *   /hubs/meeting   — MeetingHub
 *   /hubs/notification — NotificationHub
 */
export function createHubConnection(
  hubPath: "/hubs/meeting" | "/hubs/notification"
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
