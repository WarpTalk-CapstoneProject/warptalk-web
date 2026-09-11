"use client";

/**
 * The widget's end of the relay to the main window. WT-525.
 *
 * Asks the main window for a snapshot on mount, gives up after
 * BRIDGE_WIDGET_HOST_ANSWER_TIMEOUT_MS, and sends intents. Everything it decides is in
 * `reduceBridgeWidgetRelayView` (lib/meeting/bridge-widget-relay), which is tested; this is only
 * the wiring to a channel and two timers.
 *
 * TODO(WT-525): move into the widget context. Each caller opens its own channel, which is
 * harmless (a snapshot request is a local message, and every copy converges on the same
 * snapshots) but means each also runs its own timeout. It lives here only because
 * widget-context.tsx and use-bridge-widget-state.ts belong to another task.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  BRIDGE_WIDGET_HOST_ANSWER_TIMEOUT_MS,
  BRIDGE_WIDGET_PENDING_PICK_TTL_MS,
  initialBridgeWidgetRelayView,
  openBridgeWidgetRelay,
  reduceBridgeWidgetRelayView,
  type BridgeWidgetRelay,
  type BridgeWidgetRelayView,
} from "@/lib/meeting/bridge-widget-relay";
import { normalizeLanguageCode } from "@/lib/language/languages";

export type BridgeWidgetRelayClient = {
  view: BridgeWidgetRelayView;
  /** Ask the main window to apply one language to both halves. No-op unless connected. */
  pickLanguage: (language: string) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  answerBrowserCapture: (answer: { granted: boolean; sourceId?: string }) => void;
};

export function useBridgeWidgetRelayClient(roomId: string): BridgeWidgetRelayClient {
  const [state, dispatch] = useReducer(
    reduceBridgeWidgetRelayView,
    roomId,
    initialBridgeWidgetRelayView,
  );
  // A view left over from another room is not this room's. The reducer resets on the first
  // event for the new room; until then, render as if nothing had been heard.
  const view = state.roomId === roomId ? state : initialBridgeWidgetRelayView(roomId);

  const relayRef = useRef<BridgeWidgetRelay | null>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    const relay = openBridgeWidgetRelay(roomId);
    relayRef.current = relay;

    const unsubscribe = relay.subscribe(
      (message) => {
        if (message.type === "snapshot") {
          dispatch({ roomId, type: "snapshot-received", snapshot: message });
        } else if (message.type === "host-gone") {
          dispatch({ roomId, type: "host-gone" });
        }
        // Intents are for the main window; another widget's request is not ours to answer.
      },
      (reason) => {
        // A different build answering is the one rejection worth saying out loud: "open the
        // WarpTalk window" would send the user to a window that is already open.
        if (reason === "other-version") dispatch({ roomId, type: "incompatible" });
      },
    );
    relay.send({ type: "request-snapshot" });
    const timeout = window.setTimeout(
      () => dispatch({ roomId, type: "no-answer" }),
      BRIDGE_WIDGET_HOST_ANSWER_TIMEOUT_MS,
    );

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
      relay.close();
      if (relayRef.current === relay) relayRef.current = null;
    };
  }, [roomId]);

  const pickLanguage = useCallback(
    (language: string) => {
      const code = normalizeLanguageCode(language);
      if (!code || viewRef.current.status !== "connected") return;
      const at = Date.now();
      dispatch({ roomId, type: "language-picked", language: code, at });
      relayRef.current?.send({ type: "set-language", language: code });
      // Not cleared on unmount: a dispatch after unmount is a no-op, and the expiry only ever
      // clears the pick it was set for.
      window.setTimeout(
        () => dispatch({ roomId, type: "pick-expired", pickedAt: at }),
        BRIDGE_WIDGET_PENDING_PICK_TTL_MS,
      );
    },
    [roomId],
  );

  const setVoiceEnabled = useCallback((enabled: boolean) => {
    if (viewRef.current.status !== "connected") return;
    relayRef.current?.send({ type: "set-voice-enabled", enabled });
  }, []);

  const answerBrowserCapture = useCallback(
    (answer: { granted: boolean; sourceId?: string }) => {
      if (viewRef.current.status !== "connected") return;
      relayRef.current?.send({
        type: "answer-browser-capture",
        granted: answer.granted,
        ...(answer.sourceId ? { sourceId: answer.sourceId } : {}),
      });
    },
    [],
  );

  return { view, pickLanguage, setVoiceEnabled, answerBrowserCapture };
}
