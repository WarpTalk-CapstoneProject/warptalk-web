"use client";

import { useEffect, useMemo, useRef } from "react";
import { presenceService } from "@/services/presence.service";
import { usePresenceStore } from "@/stores/presence-store";
import type { PresenceState } from "@/types/presence";

/**
 * Resolves presence for the given members and keeps it current.
 *
 * Live updates arrive on the notification hub, which RealtimeNotificationProvider already owns —
 * this only fetches the starting state for ids it has not seen, so mounting a second list does
 * not refetch what the first one already resolved.
 */
export function usePresence(userIds: (string | null | undefined)[]) {
  const states = usePresenceStore((store) => store.states);
  const setMany = usePresenceStore((store) => store.setMany);

  const ids = useMemo(
    () => Array.from(new Set(userIds.filter((id): id is string => Boolean(id)))),
    [userIds],
  );

  // Ids already requested, so a re-render with the same list does not re-fetch. Kept in a ref
  // rather than state because changing it must never itself trigger a render.
  const requestedRef = useRef(new Set<string>());

  useEffect(() => {
    const missing = ids.filter((id) => !requestedRef.current.has(id));
    if (missing.length === 0) return;

    missing.forEach((id) => requestedRef.current.add(id));

    let cancelled = false;
    presenceService
      .query(missing)
      .then((result) => {
        if (!cancelled) setMany(result);
      })
      .catch(() => {
        // Presence is decoration. A failed lookup leaves those ids unresolved so nothing is
        // rendered for them, rather than asserting they are offline.
        missing.forEach((id) => requestedRef.current.delete(id));
      });

    return () => {
      cancelled = true;
    };
  }, [ids, setMany]);

  return states;
}

/** Presence for one member, or undefined while it is still unknown. */
export function useMemberPresence(userId: string | null | undefined): PresenceState | undefined {
  const states = usePresence(useMemo(() => [userId], [userId]));
  return userId ? states[userId] : undefined;
}
