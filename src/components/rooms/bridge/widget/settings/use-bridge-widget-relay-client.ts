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

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import {
  BRIDGE_WIDGET_HOST_ANSWER_TIMEOUT_MS,
  BRIDGE_WIDGET_PENDING_PICK_TTL_MS,
  initialBridgeWidgetRelayView,
  openBridgeWidgetRelay,
  reduceBridgeWidgetRelayView,
  type BridgeWidgetIntent,
  type BridgeWidgetRelay,
  type BridgeWidgetRelayView,
} from "@/lib/meeting/bridge-widget-relay";
import { normalizeLanguageCode } from "@/lib/language/languages";
import type { BridgeAudioMode } from "@/lib/meeting/bridge-audio-mode";

export type BridgeWidgetRelayClient = {
  view: BridgeWidgetRelayView;
  /** Ask the main window to apply one language to both halves. No-op unless connected. */
  pickLanguage: (language: string) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  /** "" for the automatic voice. */
  setVoicePreference: (voiceId: string) => void;
  /** null to be cloned live. */
  setDubVoice: (voiceId: string | null) => void;
  setVoiceCloneConsent: (enabled: boolean) => void;
  /** 0..1. */
  setMeetingAudioLevel: (level: number) => void;
  answerBrowserCapture: (answer: { granted: boolean; sourceId?: string }) => void;
  /**
   * WT-901 / WT-868. Each returns whether the intent was SENT — false when no main window is
   * connected, so the caller can fall back (Stop and Pause to REST) or say why nothing happened.
   * Whether it was APPLIED is read back from the next snapshot, never assumed.
   */
  stopTranslation: () => boolean;
  /** Already confirmed in the popup when pausing; the main window commits it directly. */
  setTranscriptPaused: (paused: boolean) => boolean;
  rejoin: () => boolean;
  /** Ask the main window to open the device setup wizard and come to the front. */
  openSetup: () => boolean;
  /** Ask the main window to open this room's record (`/rooms/{roomId}`) and come to the front. */
  openRoomRecord: () => boolean;
  /** W4b: a member asks the main window to take the far side's capture over (bridge takeover). */
  takeOverCapture: () => boolean;
  /**
   * Text-only bridge: ask the main window to switch how Meet hears this user. Sent only to a main
   * window whose snapshot carries `audioMode` (canRelayAudioMode); the result is the next snapshot.
   */
  setAudioMode: (mode: BridgeAudioMode) => boolean;
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

  /** Every intent after the snapshot request goes only to a main window that has answered. */
  const sendWhenConnected = useCallback((intent: BridgeWidgetIntent): boolean => {
    if (viewRef.current.status !== "connected" || !relayRef.current) return false;
    relayRef.current.send(intent);
    return true;
  }, []);

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

  const setVoiceEnabled = useCallback(
    (enabled: boolean) => {
      sendWhenConnected({ type: "set-voice-enabled", enabled });
    },
    [sendWhenConnected],
  );
  const setVoicePreference = useCallback(
    (voiceId: string) => {
      sendWhenConnected({ type: "set-voice-preference", voiceId });
    },
    [sendWhenConnected],
  );
  const setDubVoice = useCallback(
    (voiceId: string | null) => {
      sendWhenConnected({ type: "set-dub-voice", voiceId });
    },
    [sendWhenConnected],
  );
  const setVoiceCloneConsent = useCallback(
    (enabled: boolean) => {
      sendWhenConnected({ type: "set-voice-clone-consent", enabled });
    },
    [sendWhenConnected],
  );
  const setMeetingAudioLevel = useCallback(
    (level: number) => {
      sendWhenConnected({ type: "set-meeting-audio-level", level });
    },
    [sendWhenConnected],
  );

  const answerBrowserCapture = useCallback(
    (answer: { granted: boolean; sourceId?: string }) => {
      sendWhenConnected({
        type: "answer-browser-capture",
        granted: answer.granted,
        ...(answer.sourceId ? { sourceId: answer.sourceId } : {}),
      });
    },
    [sendWhenConnected],
  );

  const stopTranslation = useCallback(
    () => sendWhenConnected({ type: "stop-translation" }),
    [sendWhenConnected],
  );
  const setTranscriptPaused = useCallback(
    (paused: boolean) => sendWhenConnected({ type: "set-transcript-paused", paused }),
    [sendWhenConnected],
  );
  const rejoin = useCallback(() => sendWhenConnected({ type: "rejoin" }), [sendWhenConnected]);
  const openSetup = useCallback(() => sendWhenConnected({ type: "open-setup" }), [sendWhenConnected]);
  const openRoomRecord = useCallback(
    () => sendWhenConnected({ type: "open-room-record" }),
    [sendWhenConnected],
  );
  const takeOverCapture = useCallback(
    () => sendWhenConnected({ type: "take-over-capture" }),
    [sendWhenConnected],
  );

  const setAudioMode = useCallback(
    (mode: BridgeAudioMode) =>
      viewRef.current.snapshot?.audioMode === undefined
        ? false
        : sendWhenConnected({ type: "set-audio-mode", mode }),
    [sendWhenConnected],
  );

  // Memoized: the widget context carries this object (WT-901), and a fresh one every render would
  // re-render every slot whenever anything above the provider did.
  return useMemo(
    () => ({
      view,
      pickLanguage,
      setVoiceEnabled,
      setVoicePreference,
      setDubVoice,
      setVoiceCloneConsent,
      setMeetingAudioLevel,
      answerBrowserCapture,
      stopTranslation,
      setTranscriptPaused,
      rejoin,
      openSetup,
      openRoomRecord,
      takeOverCapture,
      setAudioMode,
    }),
    [
      view,
      pickLanguage,
      setVoiceEnabled,
      setVoicePreference,
      setDubVoice,
      setVoiceCloneConsent,
      setMeetingAudioLevel,
      answerBrowserCapture,
      stopTranslation,
      setTranscriptPaused,
      rejoin,
      openSetup,
      openRoomRecord,
      takeOverCapture,
      setAudioMode,
    ],
  );
}
