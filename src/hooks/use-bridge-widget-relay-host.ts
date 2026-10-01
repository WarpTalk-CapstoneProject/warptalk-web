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
 *   - dispatches the language, Text | Voice, voice panel and meeting-audio intents to the callbacks;
 *   - WT-901 / WT-868: mirrors the meeting itself (translation running, transcript pause, the
 *     credits stop, the meeting error, the idle reaper, the LiveKit connection, room-host) so the
 *     popup shows a Start or Pause made here at once instead of on its next 5–10s poll, and
 *     dispatches the popup's Stop, Pause/Resume, Rejoin, Device settings and "Open meeting record"
 *     to this window's own handlers — so the host check, the toasts and the wizard are the native
 *     ones. Every one of these options is optional: a caller that does not pass one leaves the
 *     popup on REST for it.
 *   - says `host-gone` when it unmounts or the page is going away, so the widget stops offering
 *     controls that would reach nobody.
 *
 * MOUNTED in PersistentMeetingSession, below the voice handlers it dispatches to. Callbacks may be
 * fresh closures every render (handleChangeVoiceEnabled is): they are read through a ref, so a new
 * identity never reopens the channel.
 *
 * `answer-browser-capture` is still answered by the consent relay of #496
 * (use-bridge-consent-host), which owns that question end to end. Folding it in here is a separate
 * change with no visible effect, so `onAnswerBrowserCapture` is left unset by the session today.
 */

import { useEffect, useRef } from "react";

import type { BrowserCaptureConsentState } from "@/lib/audio/browser-capture-consent";
import type { InboundHealth } from "@/lib/audio/bridge-inbound-health";
import {
  acceptsBrowserCaptureAnswer,
  acceptsRejoin,
  buildBridgeWidgetSnapshot,
  openBridgeWidgetRelay,
  type BridgeWidgetMeetingConnection,
  type BridgeWidgetRelay,
  type BridgeWidgetSnapshotFields,
  type BridgeWidgetTranscriptPauseSnapshot,
  type BridgeWidgetTranslationSnapshot,
  type BridgeWidgetVoiceSnapshot,
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
  /** What the popup's Voice panel draws. Omit and the popup asks for this window to be reloaded. */
  voice?: BridgeWidgetVoiceSnapshot;
  /** Whether sound is reaching WarpTalk from Meet; the popup warns on "no-signal". */
  inboundHealth?: InboundHealth;
  /** One normalized code. Apply it with `applyRelayedLanguagePick`, as the native picker does. */
  onSetLanguage: (language: string) => void;
  onSetVoiceEnabled: (enabled: boolean) => void;
  /** "" means the automatic voice, as `onChangeVoicePreference` takes it. */
  onSetVoicePreference?: (voiceId: string) => void;
  /** null means "clone me live", as `onChangeDubVoice` takes it. */
  onSetDubVoice?: (voiceId: string | null) => void;
  onSetVoiceCloneConsent?: (enabled: boolean) => void;
  /** 0..1, already range-checked by the relay. */
  onSetMeetingAudioLevel?: (level: number) => void;
  /**
   * Called only while `browserCaptureState === "required"` — an answer arriving after the
   * question was settled in this window is dropped (see `acceptsBrowserCaptureAnswer`).
   */
  onAnswerBrowserCapture?: (answer: { granted: boolean; sourceId?: string }) => void;

  // ── WT-901 / WT-868: the meeting itself. All optional; see the header. ──────
  /** `{ started: translationStarted }`. Sending it is also what lets the popup's Stop use the relay. */
  translation?: BridgeWidgetTranslationSnapshot;
  /** `resolveTranscriptPause`'s answer here. Sending it lets the popup's Pause use the relay. */
  transcriptPause?: BridgeWidgetTranscriptPauseSnapshot;
  /** True after TranslationCreditsExhausted, false after TranslationCreditsRestored. */
  creditsSuspended?: boolean;
  /** The reason TranslationCreditsExhausted carried, so the popup words it the same way. */
  creditsSuspendedReason?: string | null;
  /** `meetingError`, already worded for a person; null for none. */
  meetingError?: string | null;
  /** The idle reaper let go (`meetingIsIdleReaped`). Gates `onRejoin`. */
  idleReaped?: boolean;
  /** The LiveKit connection of this window's meeting. */
  connection?: BridgeWidgetMeetingConnection;
  /** `isRoomHost` — the actual host after any transfer, not workspace owner/admin. */
  isRoomHost?: boolean;
  /** "Rejoin meeting" in the popup. Called only while `idleReaped` is true. */
  onRejoin?: () => void;
  /** "Device settings" in the popup: open the bridge setup wizard here and bring this window up. */
  onOpenSetup?: () => void;
  /** The popup's Stop translation — the same handler as the native Stop. */
  onStopTranslation?: () => void;
  /**
   * The popup's Pause / Resume transcript. The popup has ALREADY asked "are you sure" before a
   * pause, so this commits directly (commitTranscriptPause), never opens a second confirmation.
   */
  onSetTranscriptPaused?: (paused: boolean) => void;
  /**
   * "Open meeting record" on the popup's ended screen: navigate this window to `/rooms/{roomId}`
   * and bring it up. The popup never ends a meeting; there is no end callback on purpose.
   */
  onOpenRoomRecord?: () => void;
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
  voice,
  inboundHealth,
  translation,
  transcriptPause,
  creditsSuspended,
  creditsSuspendedReason,
  meetingError,
  idleReaped,
  connection,
  isRoomHost,
  onSetLanguage,
  onSetVoiceEnabled,
  onSetVoicePreference,
  onSetDubVoice,
  onSetVoiceCloneConsent,
  onSetMeetingAudioLevel,
  onAnswerBrowserCapture,
  onRejoin,
  onOpenSetup,
  onStopTranslation,
  onSetTranscriptPaused,
  onOpenRoomRecord,
}: BridgeWidgetRelayHostOptions): void {
  const relayRef = useRef<BridgeWidgetRelay | null>(null);
  const fieldsRef = useRef<BridgeWidgetSnapshotFields>({
    speakLanguage,
    listenLanguage,
    voiceEnabled,
    micDeviceId,
    browserCaptureState,
    selectedLoopbackSourceId,
    voice,
    inboundHealth,
    translation,
    transcriptPause,
    creditsSuspended,
    creditsSuspendedReason,
    meetingError,
    idleReaped,
    connection,
    isRoomHost,
  });
  const handlersRef = useRef({
    onSetLanguage,
    onSetVoiceEnabled,
    onSetVoicePreference,
    onSetDubVoice,
    onSetVoiceCloneConsent,
    onSetMeetingAudioLevel,
    onAnswerBrowserCapture,
    onRejoin,
    onOpenSetup,
    onStopTranslation,
    onSetTranscriptPaused,
    onOpenRoomRecord,
  });

  // Every render, after commit: the channel's listener reads the latest handlers without the
  // channel having to be reopened for each new closure.
  useEffect(() => {
    handlersRef.current = {
      onSetLanguage,
      onSetVoiceEnabled,
      onSetVoicePreference,
      onSetDubVoice,
      onSetVoiceCloneConsent,
      onSetMeetingAudioLevel,
      onAnswerBrowserCapture,
      onRejoin,
      onOpenSetup,
      onStopTranslation,
      onSetTranscriptPaused,
      onOpenRoomRecord,
    };
  });

  // The voice half is an object built fresh every render by the caller; keyed by its content so an
  // unrelated re-render does not broadcast an identical snapshot.
  const voiceKey = voice ? JSON.stringify(voice) : "";
  // The same for the two WT-901 objects: callers build them inline.
  const translationStarted = translation?.started;
  const pauseKnown = transcriptPause?.known;
  const pausePaused = transcriptPause?.paused;
  const pauseSince = transcriptPause?.since;

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
      voice,
      inboundHealth,
      translation,
      transcriptPause,
      creditsSuspended,
      creditsSuspendedReason,
      meetingError,
      idleReaped,
      connection,
      isRoomHost,
    };
    fieldsRef.current = fields;
    relayRef.current?.send(buildBridgeWidgetSnapshot(fields, Date.now()));
    // `voice` is represented by `voiceKey`, `translation` and `transcriptPause` by their values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    speakLanguage,
    listenLanguage,
    voiceEnabled,
    micDeviceId,
    browserCaptureState,
    selectedLoopbackSourceId,
    voiceKey,
    inboundHealth,
    translationStarted,
    pauseKnown,
    pausePaused,
    pauseSince,
    creditsSuspended,
    creditsSuspendedReason,
    meetingError,
    idleReaped,
    connection,
    isRoomHost,
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
        // The same no-reply rule as set-language, for all four: the field effect reports the result.
        case "set-voice-preference":
          handlers.onSetVoicePreference?.(message.voiceId);
          break;
        case "set-dub-voice":
          handlers.onSetDubVoice?.(message.voiceId);
          break;
        case "set-voice-clone-consent":
          handlers.onSetVoiceCloneConsent?.(message.enabled);
          break;
        case "set-meeting-audio-level":
          handlers.onSetMeetingAudioLevel?.(message.level);
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
        // WT-901. The same no-reply rule: the handler changes state, the field effect reports it.
        // An intent this window has no handler for is answered with a snapshot instead, so the
        // popup re-reads what is true rather than waiting on a change that will not come.
        case "stop-translation":
          if (handlers.onStopTranslation) handlers.onStopTranslation();
          else sendSnapshot();
          break;
        case "set-transcript-paused":
          if (handlers.onSetTranscriptPaused) handlers.onSetTranscriptPaused(message.paused);
          else sendSnapshot();
          break;
        case "rejoin":
          // Stale once the meeting is back: rebuilding a working meeting is not what was asked.
          if (handlers.onRejoin && acceptsRejoin(fieldsRef.current.idleReaped)) handlers.onRejoin();
          else sendSnapshot();
          break;
        case "open-setup":
          handlers.onOpenSetup?.();
          break;
        case "open-room-record":
          handlers.onOpenRoomRecord?.();
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
