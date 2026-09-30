import type { HubConnection } from "@microsoft/signalr";
import { NOTIFICATION_HUB_METHODS } from "@/constants/realtime";
import { createPresenceBatcher, type PresenceBatcher } from "@/lib/presence/presence-batcher";
import { usePresenceStore } from "@/stores/presence-store";
import type { PresenceQueryResponse } from "@/types/presence";

/** One batcher per hub connection: a reconnect with a fresh token is a fresh connection. */
const batchers = new WeakMap<HubConnection, PresenceBatcher>();

function batcherFor(connection: HubConnection): PresenceBatcher {
  let batcher = batchers.get(connection);
  if (!batcher) {
    batcher = createPresenceBatcher({
      invoke: async (userIds) => {
        const response = await connection.invoke<PresenceQueryResponse>(
          NOTIFICATION_HUB_METHODS.QUERY_PRESENCE,
          userIds,
        );
        return response?.states ?? {};
      },
      onStates: (states) => usePresenceStore.getState().setMany(states),
    });
    batchers.set(connection, batcher);
  }
  return batcher;
}

export const presenceService = {
  /**
   * Current presence for a set of members, so a list can paint the right dots on first render
   * instead of waiting for someone's state to happen to change.
   *
   * Asked over the notification hub that RealtimeNotificationProvider already holds open — the
   * same socket the UserPresenceChanged deltas arrive on — not over REST. The legacy
   * POST /api/v1/presence/query still exists for older clients; this client must not call it
   * (scripts/check-presence-over-hub.mjs).
   *
   * Ids asked for in the same tick share one call. Answers land in the presence store; the
   * returned promise only says whether these ids were answered.
   */
  query(connection: HubConnection, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return Promise.resolve();
    return batcherFor(connection).request(userIds);
  },
};
