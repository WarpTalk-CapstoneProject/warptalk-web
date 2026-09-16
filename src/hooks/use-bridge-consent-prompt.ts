"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BROADCAST_CHANNELS } from "@/constants/realtime";
import {
  BRIDGE_CONSENT_PROTOCOL_VERSION,
  bridgeConsentPromptView,
  parseBridgeConsentMessage,
  shouldAcknowledgeConsentSnapshot,
  type BridgeConsentIntent,
  type BridgeConsentPromptView,
  type BridgeConsentSnapshot,
} from "@/lib/meeting/bridge-capture-consent-relay";

/**
 * The popup's end of the loopback consent relay: listens for the main window's snapshots, sends
 * back what the host pressed.
 *
 * WHY THERE IS NO LOCAL STATE BUT THE SNAPSHOT
 *   The answer gates a capture that belongs to the main window, so the main window owns it. The
 *   only thing stored here is the last snapshot that arrived, and the view is derived from it — a
 *   button press posts an intent and then changes nothing, because main republishes after applying
 *   it. Optimistic state would let this window show "listening" while main had refused the grant,
 *   which is the one disagreement that matters: it is about whether a browser is being heard.
 *
 * WHY `hello` IS SENT ON MOUNT AND AGAIN ON VISIBILITY
 *   BroadcastChannel has no replay. A popup that opens after main last published — which is the
 *   normal case, since the question is asked the moment Start runs — has missed the only message
 *   there was, and main's state may never change again. `hello` asks for it back. The popup is also
 *   minimisable, and a host who restores it is in exactly the same position, so the same ask runs
 *   on visibilitychange.
 *
 * WHY THE `ack` IS WORTH THE ROUND TRIP
 *   Main raises this window through the desktop app when a "required" snapshot goes unacknowledged
 *   past CONSENT_POPUP_RAISE_GRACE_MS, and raising an already-open popup costs the host an OS
 *   notification. Acknowledging while visible is what stops a toast landing in front of someone who
 *   is already reading the prompt.
 *
 * Off the desktop — an ordinary browser tab, or the server render — there is no channel and no main
 * window to answer one. The view stays hidden and the actions do nothing, rather than the page
 * offering a question nobody could act on.
 */
export interface BridgeConsentPrompt {
  view: BridgeConsentPromptView;
  selectSource: (sourceId: string) => void;
  decide: (granted: boolean) => void;
  reconsider: () => void;
}

export function useBridgeConsentPrompt(roomId: string): BridgeConsentPrompt {
  const [snapshot, setSnapshot] = useState<BridgeConsentSnapshot | null>(null);
  /**
   * The open channel, for the actions to post on.
   *
   * A ref rather than state because the channel is not something to render: putting it in state
   * would re-render every consumer when it opens, to draw exactly what was already drawn. Written
   * from an effect and read from event handlers, never during render.
   */
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Absent in an SSR pass and in older browsers; the popup then has no relay and says nothing.
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(BROADCAST_CHANNELS.BRIDGE_CAPTURE_CONSENT);
    channelRef.current = channel;

    const post = (intent: BridgeConsentIntent) => channel.postMessage(intent);

    channel.onmessage = (event) => {
      const message = parseBridgeConsentMessage(event.data);
      // Intents are the popup's own voice coming back at it, and another room's snapshot belongs to
      // another session. Neither is news here.
      if (!message || message.kind !== "snapshot" || message.roomId !== roomId) return;
      setSnapshot(message);
      if (
        shouldAcknowledgeConsentSnapshot(message, roomId, document.visibilityState === "visible")
      ) {
        post({ v: BRIDGE_CONSENT_PROTOCOL_VERSION, kind: "ack", roomId });
      }
    };

    const askAgainWhenVisible = () => {
      // Only on the way back to visible: main republishes, and the ack path above then runs for a
      // prompt that is genuinely on screen this time.
      if (document.visibilityState === "visible") {
        post({ v: BRIDGE_CONSENT_PROTOCOL_VERSION, kind: "hello", roomId });
      }
    };
    document.addEventListener("visibilitychange", askAgainWhenVisible);

    post({ v: BRIDGE_CONSENT_PROTOCOL_VERSION, kind: "hello", roomId });

    return () => {
      document.removeEventListener("visibilitychange", askAgainWhenVisible);
      channel.onmessage = null;
      channel.close();
      channelRef.current = null;
    };
  }, [roomId]);

  const post = useCallback((intent: BridgeConsentIntent) => {
    channelRef.current?.postMessage(intent);
  }, []);

  const selectSource = useCallback(
    (sourceId: string) =>
      post({ v: BRIDGE_CONSENT_PROTOCOL_VERSION, kind: "select-source", roomId, sourceId }),
    [post, roomId],
  );

  const decide = useCallback(
    (granted: boolean) =>
      post({ v: BRIDGE_CONSENT_PROTOCOL_VERSION, kind: "decide", roomId, granted }),
    [post, roomId],
  );

  const reconsider = useCallback(
    () => post({ v: BRIDGE_CONSENT_PROTOCOL_VERSION, kind: "reconsider", roomId }),
    [post, roomId],
  );

  // Derived, not stored: a snapshot left over from a previous roomId renders as hidden rather than
  // as somebody else's question.
  return { view: bridgeConsentPromptView(snapshot, roomId), selectSource, decide, reconsider };
}
