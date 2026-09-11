"use client";

/**
 * The main window's end of the Meet widget relay. WT-525, Phase 2.
 *
 * The widget (the desktop popup floating over Google Meet) cannot hold meeting state: it is a
 * separate BrowserWindow, and this user's languages, dub voice and the browser-capture consent
 * all live in `persistent-meeting-session` here. So the widget sends INTENTS and this hook turns
 * them into calls on the very handlers the native controls use, then tells the widget what this
 * window now holds. Protocol, transport and the reasons for both: lib/meeting/bridge-widget-relay.
 *
 * WHAT IT DOES
 *   - answers `request-snapshot`, and announces a snapshot as soon as it mounts — a popup opened
 *     before this room's meeting mounted here has already given up waiting, and this is what
 *     brings its controls back;
 *   - broadcasts a new snapshot whenever one of the fields changes, from any cause (the native
 *     picker, a remembered-language auto-apply, a relayed intent);
 *   - dispatches `set-language`, `set-voice-enabled` and `answer-browser-capture` to the callbacks;
 *   - says `host-gone` when it unmounts or the page is going away, so the widget stops offering
 *     controls that would reach nobody.
 *
 * NOT MOUNTED YET — the mount is a separate task, because persistent-meeting-session is being
 * edited in parallel. When it lands, it goes in PersistentMeetingSession below `consentState` /
 * `selectedLoopbackSourceId` (they are declared late, see the note there) and needs the bar's
 * inline `onLanguagePicked` lifted into a named `handleLanguagePicked` so both callers share it:
 *
 *   import { useBridgeWidgetRelayHost } from "@/hooks/use-bridge-widget-relay-host";
 *   import { applyRelayedLanguagePick } from "@/lib/meeting/bridge-widget-relay";
 *
 *   const handleLanguagePicked = useCallback((language: string) =>
 *     updateUserSettings.mutate({ defaultSpeakLanguage: language, defaultListenLanguage: language }),
 *   [updateUserSettings]);   // and pass onLanguagePicked={handleLanguagePicked} to MeetingControlBar
 *
 *   useBridgeWidgetRelayHost({
 *     roomId,
 *     enabled: isBridgeRoom,
 *     speakLanguage: sourceLanguage,
 *     listenLanguage: targetLanguage,
 *     voiceEnabled,
 *     browserCaptureState: consentState,
 *     selectedLoopbackSourceId,
 *     onSetLanguage: (language) =>
 *       applyRelayedLanguagePick(language, {
 *         onChangeSpeakLanguage: handleChangeSpeakLanguage,
 *         onChangeListenLanguage: handleChangeListenLanguage,
 *         onLanguagePicked: handleLanguagePicked,
 *       }),
 *     onSetVoiceEnabled: handleChangeVoiceEnabled,
 *     onAnswerBrowserCapture: ({ granted, sourceId }) => {
 *       if (sourceId) setLoopbackSourceSelection({ roomId, sourceId });
 *       setBrowserCaptureAnswer({ roomId, granted });
 *     },
 *   });
 *
 *   Callbacks may be fresh closures every render (handleChangeVoiceEnabled is): they are read
 *   through a ref, so a new identity never reopens the channel.
 *
 *   The decline toast the consent modal shows here is NOT repeated for a relayed answer — the
 *   user is looking at the widget, which should say it there.
 */

import { useEffect, useRef } from "react";

import type { BrowserCaptureConsentState } from "@/lib/audio/browser-capture-consent";
import {
  acceptsBrowserCaptureAnswer,
  buildBridgeWidgetSnapshot,
  openBridgeWidgetRelay,
  type BridgeWidgetRelay,
  type BridgeWidgetSnapshotFields,
} from "@/lib/meeting/bridge-widget-relay";

export type BridgeWidgetRelayHostOptions = {
  roomId: string;
  /** True only for an EXTERNAL_BRIDGE room: nothing else has a widget to talk to. */
  enabled: boolean;
  speakLanguage?: string | null;
  listenLanguage?: string | null;
  voiceEnabled: boolean;
  /** Reserved for the widget's mic picker (`set-mic-device`, not in the protocol yet). */
  micDeviceId?: string | null;
  /** `consentState` in persistent-meeting-session. Absent reads as nothing to ask. */
  browserCaptureState?: BrowserCaptureConsentState;
  selectedLoopbackSourceId?: string | null;
  /** One normalized code. Apply it with `applyRelayedLanguagePick`, as the native picker does. */
  onSetLanguage: (language: string) => void;
  onSetVoiceEnabled: (enabled: boolean) => void;
  /**
   * Called only while `browserCaptureState === "required"` — an answer arriving after the
   * question was settled in this window is dropped (see `acceptsBrowserCaptureAnswer`).
   */
  onAnswerBrowserCapture?: (answer: { granted: boolean; sourceId?: string }) => void;
};

export function useBridgeWidgetRelayHost({
  roomId,
  enabled,
  speakLanguage,
  listenLanguage,
  voiceEnabled,
  micDeviceId,
  browserCaptureState = "not-required",
  selectedLoopbackSourceId,
  onSetLanguage,
  onSetVoiceEnabled,
  onAnswerBrowserCapture,
}: BridgeWidgetRelayHostOptions): void {
  const relayRef = useRef<BridgeWidgetRelay | null>(null);
  const fieldsRef = useRef<BridgeWidgetSnapshotFields>({
    speakLanguage,
    listenLanguage,
    voiceEnabled,
    micDeviceId,
    browserCaptureState,
    selectedLoopbackSourceId,
  });
  const handlersRef = useRef({ onSetLanguage, onSetVoiceEnabled, onAnswerBrowserCapture });

  // Every render, after commit: the channel's listener reads the latest handlers without the
  // channel having to be reopened for each new closure.
  useEffect(() => {
    handlersRef.current = { onSetLanguage, onSetVoiceEnabled, onAnswerBrowserCapture };
  });

  // Declared BEFORE the channel effect on purpose. On mount it only records the fields (the
  // channel is not open yet, and the channel effect announces them); after that it is what
  // broadcasts every change. The other order would announce the same snapshot twice on mount.
  useEffect(() => {
    const fields: BridgeWidgetSnapshotFields = {
      speakLanguage,
      listenLanguage,
      voiceEnabled,
      micDeviceId,
      browserCaptureState,
      selectedLoopbackSourceId,
    };
    fieldsRef.current = fields;
    relayRef.current?.send(buildBridgeWidgetSnapshot(fields, Date.now()));
  }, [
    speakLanguage,
    listenLanguage,
    voiceEnabled,
    micDeviceId,
    browserCaptureState,
    selectedLoopbackSourceId,
  ]);

  useEffect(() => {
    if (!enabled || !roomId) return;
    const relay = openBridgeWidgetRelay(roomId);
    if (!relay.available) return;
    relayRef.current = relay;

    const sendSnapshot = () =>
      relay.send(buildBridgeWidgetSnapshot(fieldsRef.current, Date.now()));

    const unsubscribe = relay.subscribe((message) => {
      const handlers = handlersRef.current;
      switch (message.type) {
        case "request-snapshot":
          sendSnapshot();
          break;
        case "set-language":
          // No snapshot here: the handler changes state, the re-render changes a field, and the
          // field effect above broadcasts the result. Replying now would send the OLD language
          // with a newer timestamp and make the widget's pick flicker back.
          handlers.onSetLanguage(message.language);
          break;
        case "set-voice-enabled":
          handlers.onSetVoiceEnabled(message.enabled);
          break;
        case "answer-browser-capture":
          if (acceptsBrowserCaptureAnswer(fieldsRef.current.browserCaptureState)) {
            handlers.onAnswerBrowserCapture?.({
              granted: message.granted,
              sourceId: message.sourceId,
            });
          } else {
            // Stale: the question was settled here. Tell the widget what the answer actually is
            // rather than leave it showing a prompt that no longer exists.
            sendSnapshot();
          }
          break;
        default:
          // snapshot / host-gone from another main window on the same room (a second tab in a
          // plain browser). Not ours to act on.
          break;
      }
    });

    // Announce: a widget that asked before this mounted is sitting in "no main window".
    sendSnapshot();

    // An unload runs no effect cleanup, so the page going away says goodbye itself. A reload that
    // brings the meeting back announces again on mount.
    const sayGoodbye = () => relay.send({ type: "host-gone" });
    window.addEventListener("pagehide", sayGoodbye);

    return () => {
      window.removeEventListener("pagehide", sayGoodbye);
      sayGoodbye();
      unsubscribe();
      relay.close();
      if (relayRef.current === relay) relayRef.current = null;
    };
  }, [enabled, roomId]);
}
