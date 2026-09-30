"use client";

import { useEffect, useMemo, useRef } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import { useRealtime } from "@/components/providers/realtime-notification-provider";
import { presenceService } from "@/services/presence.service";
import { usePresenceStore } from "@/stores/presence-store";
import type { PresenceState } from "@/types/presence";
import { presenceIdsToRequest } from "@/lib/presence/retry";

/** Ids whose last lookup failed, and when. Module-level so remounting a list does not reset it. */
const failedAt = new Map<string, number>();

/**
 * Resolves presence for the given members and keeps it current.
 *
 * Everything travels over the notification hub that RealtimeNotificationProvider owns: live
 * updates arrive as UserPresenceChanged, and the starting state for ids this instance has not
 * seen is asked for with the hub's QueryPresence on that same connection. There is no REST
 * fallback — until the hub is connected there is nothing to ask, and the answer waits for it.
 */
export function usePresence(userIds: (string | null | undefined)[]) {
  const states = usePresenceStore((store) => store.states);
  const { connection, isConnected } = useRealtime();

  // Callers pass a fresh array every render (members.map(...)); key the effect on the ids
  // themselves so an identical list is not a new dependency.
  const idsKey = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))))
    .sort()
    .join(",");
  const ids = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);

  // Ids already requested, so a re-render with the same list does not re-fetch. Kept in a ref
  // rather than state because changing it must never itself trigger a render.
  const requestedRef = useRef(new Set<string>());

  // A snapshot is only good for the connection it was taken on: while the hub is down every
  // UserPresenceChanged is missed, so once it is back everything is asked for again.
  useEffect(() => {
    if (!isConnected) requestedRef.current.clear();
  }, [isConnected]);

  useEffect(() => {
    // Wait for the hub. The effect re-runs when isConnected turns true.
    if (!connection || !isConnected) return;

    const missing = presenceIdsToRequest(ids, requestedRef.current, failedAt, Date.now());
    if (missing.length === 0) return;

    const requested = requestedRef.current;
    missing.forEach((id) => requested.add(id));

    // No cancellation on cleanup: answers go straight into the shared store, which outlives this
    // component, and dropping one would leave its ids marked requested and never painted.
    presenceService
      .query(connection, missing)
      .then(() => {
        missing.forEach((id) => failedAt.delete(id));
      })
      .catch(() => {
        missing.forEach((id) => requested.delete(id));

        // The socket dropped under the call: that is not the server refusing, and the reconnect
        // re-runs this effect and asks again. Backing off here would blank the dots for a minute
        // after every blip.
        if (connection.state !== HubConnectionState.Connected) return;

        // Presence is decoration. A failed lookup - an error, or the hub's per-connection
        // throttle - leaves those ids unresolved so nothing is rendered for them, rather than
        // asserting they are offline, and they are not asked for again until
        // PRESENCE_RETRY_AFTER_MS has passed.
        const at = Date.now();
        missing.forEach((id) => failedAt.set(id, at));
      });
  }, [ids, connection, isConnected]);

  return states;
}

/** Presence for one member, or undefined while it is still unknown. */
export function useMemberPresence(userId: string | null | undefined): PresenceState | undefined {
  const states = usePresence(useMemo(() => [userId], [userId]));
  return userId ? states[userId] : undefined;
}
