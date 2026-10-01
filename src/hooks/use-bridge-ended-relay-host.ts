"use client";

/**
 * The app shell's end of the Meet widget relay, for a bridge room whose meeting has ENDED. W4a.
 *
 * WHY THE SHELL
 *   While the meeting runs, `useBridgeWidgetRelayHost` in PersistentMeetingSession answers the
 *   popup. When the Meet conference ends the session closes itself, and its unmount says
 *   `host-gone` — so the popup's EndedView would have nobody to send "Open meeting record" to and
 *   would fall back to the system browser, which may not be signed in to WarpTalk. The shell is
 *   mounted for the whole life of the main window, so it takes over the room's channel:
 *
 *   - it announces, and answers every `request-snapshot` with, the ended snapshot
 *     (`buildEndedBridgeWidgetSnapshot`) — the popup stays connected and on EndedView;
 *   - `open-room-record` → `onOpenRoomRecord(roomId)`: the shell navigates this window to the
 *     room's record and brings it to the front;
 *   - every other intent is answered with the ended snapshot again: there is no meeting left for
 *     it to act on, and silence would leave the popup waiting.
 *
 * `roomId` null (no bridge meeting has ended in this window) opens nothing.
 */

import { useEffect, useRef } from "react";

import {
  buildEndedBridgeWidgetSnapshot,
  openBridgeWidgetRelay,
} from "@/lib/meeting/bridge-widget-relay";

export function useBridgeEndedRelayHost({
  roomId,
  onOpenRoomRecord,
}: {
  roomId: string | null;
  onOpenRoomRecord: (roomId: string) => void;
}): void {
  const openRef = useRef(onOpenRoomRecord);
  useEffect(() => {
    openRef.current = onOpenRoomRecord;
  });

  useEffect(() => {
    if (!roomId) return;
    const relay = openBridgeWidgetRelay(roomId);
    if (!relay.available) return;

    const sendEnded = () => relay.send(buildEndedBridgeWidgetSnapshot(Date.now()));

    const unsubscribe = relay.subscribe((message) => {
      switch (message.type) {
        case "open-room-record":
          openRef.current(roomId);
          break;
        case "snapshot":
        case "host-gone":
          // Another main window on the same room. Not ours to answer.
          break;
        default:
          sendEnded();
          break;
      }
    });

    // The meeting's own host has just said host-gone; this puts the popup back on "connected".
    sendEnded();

    // Leaving, as the meeting's host does: the popup then falls back to the system browser.
    const sayGoodbye = () => relay.send({ type: "host-gone" });
    window.addEventListener("pagehide", sayGoodbye);

    return () => {
      window.removeEventListener("pagehide", sayGoodbye);
      sayGoodbye();
      unsubscribe();
      relay.close();
    };
  }, [roomId]);
}
