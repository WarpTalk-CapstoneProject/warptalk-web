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
 *   - W4b: says this desktop's bridge role (`bridgeRole`, `bridgeCapturerAway`) and dispatches a
 *     member's `take-over-capture` to the lease hook (use-bridge-capturer-lease), so the popup can
 *     gate its controls on host-or-capturer and offer the takeover when the capturer has gone;
 *   - text-only bridge: says this user's audio mode (`audioMode`) and dispatches the popup's
 *     `set-audio-mode` to the session, which re-checks the one-way rule and calls the server;
 *   - WT-912 / WT-913: says the WarpTalk microphone and who decides it (`mic`), and that the user
 *     left the Meet call (`meetLeave`); dispatches the fallback chip's `set-mic-enabled` only while
 *     Meet's mute button cannot be read, and `answer-meet-left` only while a countdown is running;
 *   - says `host-gone` when it unmounts or the page is going away, so the widget stops offering
 *     controls that would reach nobody;
 *   - W4a: `announceEnded()` (returned) says the room ENDED, synchronously, for the moment the
 *     session is about to unmount: a state change would never get to render. The app shell then
 *     keeps answering on the room (use-bridge-ended-relay-host) so EndedView stays reachable.
 *
 * MOUNTED in PersistentMeetingSession, below the voice handlers it dispatches to. Callbacks may be
 * fresh closures every render (handleChangeVoiceEnabled is): they are read through a ref, so a new
 * identity never reopens the channel.
 *
 * `answer-browser-capture` is still answered by the consent relay of #496
 * (use-bridge-consent-host), which owns that question end to end. Folding it in here is a separate
 * change with no visible effect, so `onAnswerBrowserCapture` is left unset by the session today.
 */

import { useCallback, useEffect, useRef } from "react";

import type { BrowserCaptureConsentState } from "@/lib/audio/browser-capture-consent";
import type { InboundHealth } from "@/lib/audio/bridge-inbound-health";
import {
  acceptsBrowserCaptureAnswer,
  acceptsMeetLeftAnswer,
  acceptsRejoin,
  acceptsSessionTakeOver,
  buildBridgeWidgetSnapshot,
  openBridgeWidgetRelay,
  type BridgeWidgetMeetingConnection,
  type BridgeWidgetMicSnapshot,
  type BridgeWidgetOutboundSnapshot,
  type BridgeWidgetRelay,
  type BridgeWidgetSnapshotFields,
  type BridgeWidgetTranscriptPauseSnapshot,
  type BridgeWidgetTranslationSnapshot,
  type BridgeWidgetVoiceSnapshot,
} from "@/lib/meeting/bridge-widget-relay";
import type { BridgeRole } from "@/lib/meeting/bridge-capturer";
import type { BridgeAudioMode } from "@/lib/meeting/bridge-audio-mode";
import { acceptsManualMic, type MeetLeavePrompt } from "@/lib/meeting/bridge-meet-follow";

export type BridgeWidgetRelayHostOptions = {
  roomId: string;
  /** True only for an EXTERNAL_BRIDGE room: nothing else has a widget to talk to. */
  enabled: boolean;
  speakLanguage?: string | null;
  listenLanguage?: string | null;
  voiceEnabled: boolean;
  /** The microphone WarpTalk records (LiveKit's active audioinput); the popup's picker ticks it. */
  micDeviceId?: string | null;
  /** The popup's microphone pick (`set-mic-device`). Absent: answered with a snapshot. */
  onSetMicDevice?: (deviceId: string) => void;
  /** What Meet hears from this person, and since when (lib/meeting/bridge-mic-device). */
  outbound?: BridgeWidgetOutboundSnapshot;
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

  // ── W4b: bridge claim. Optional, like the WT-901 fields. ──────────────────
  /** This desktop's role in the shared bridge room (lib/meeting/bridge-capturer). */
  bridgeRole?: BridgeRole;
  /** The capturer is somebody else and not connected: the popup offers a member the takeover. */
  bridgeCapturerAway?: boolean;
  /** "Capture audio on this device" in a member's popup. Absent: answered with a snapshot. */
  onTakeOverCapture?: () => void;

  // ── Text-only bridge. Optional, like the rest. ────────────────────────────
  /** This user's bridge audio mode as the session resolves it (lib/meeting/bridge-audio-mode). */
  audioMode?: BridgeAudioMode;
  /**
   * The popup's mode chooser. The session re-checks the one-way rule and owns the PUT; the result
   * comes back on the next snapshot. Absent: answered with a snapshot.
   */
  onSetAudioMode?: (mode: BridgeAudioMode) => void;
  // ── web #646: another login displaced this session. Optional, like the WT-901 fields. ──
  /** `sessionDisplaced` — this window stopped connecting so the other login keeps the meeting. */
  sessionDisplaced?: boolean;
  /** "Use this device" in the popup. Called only while `sessionDisplaced` is true. */
  onTakeOverSession?: () => void;
  // ── Meet captions. Optional, like the rest. ───────────────────────────────
  /** Meet's CC looks off on the captured call (useFarSpeakerHints). Capturer only. */
  meetCaptionsOff?: boolean;
  // ── WT-912 / WT-913: the room follows the Meet call. Optional, like the rest. ──
  /** The WarpTalk microphone and who decides it (use-bridge-meet-follow). */
  mic?: BridgeWidgetMicSnapshot;
  /** The fallback chip's press. Called only while `mic.control === "manual"`. */
  onSetMicEnabled?: (enabled: boolean) => void;
  /** The user left the Meet call: the countdown, or "kept". Only for someone who may end the room. */
  meetLeave?: MeetLeavePrompt;
  /** "End now" (true) / "Keep open" (false). Called only while a countdown is running. */
  onAnswerMeetLeft?: (end: boolean) => void;
};

export type BridgeWidgetRelayHost = {
  /**
   * W4a: tell the popup this room has ENDED, now. Called by the session from its end handler, just
   * before it closes itself — the unmount that follows says `host-gone`, and a snapshot carried by
   * a re-render would never be sent. Every later snapshot from this hook says ended as well.
   */
  announceEnded: () => void;
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
  bridgeRole,
  bridgeCapturerAway,
  audioMode,
  sessionDisplaced,
  meetCaptionsOff,
  mic,
  meetLeave,
  outbound,
  onSetMicEnabled,
  onAnswerMeetLeft,
  onSetMicDevice,
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
  onTakeOverCapture,
  onSetAudioMode,
  onTakeOverSession,
}: BridgeWidgetRelayHostOptions): BridgeWidgetRelayHost {
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
    bridgeRole,
    bridgeCapturerAway,
    audioMode,
    sessionDisplaced,
    meetCaptionsOff,
    mic,
    meetLeave,
    outbound,
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
    onTakeOverCapture,
    onSetAudioMode,
    onTakeOverSession,
    onSetMicEnabled,
    onAnswerMeetLeft,
    onSetMicDevice,
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
      onTakeOverCapture,
      onSetAudioMode,
      onTakeOverSession,
      onSetMicEnabled,
      onAnswerMeetLeft,
      onSetMicDevice,
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
  // And for the two WT-912 / WT-913 objects.
  const micEnabled = mic?.enabled;
  const micControl = mic?.control;
  const micOverride = mic?.override;
  const meetLeaveState = meetLeave?.state;
  const meetLeaveEndsAtMs = meetLeave?.state === "countdown" ? meetLeave.endsAtMs : undefined;
  const meetLeaveCause = meetLeave?.cause;
  const meetLeaveRetrying = meetLeave?.state === "countdown" ? meetLeave.retrying : undefined;
  const outboundLeg = outbound?.leg;
  const outboundSinceMs = outbound?.sinceMs;

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
      bridgeRole,
      bridgeCapturerAway,
      audioMode,
      sessionDisplaced,
      meetCaptionsOff,
      mic,
      meetLeave,
      outbound,
    };
    // An end already announced stays announced: a late re-render must not un-end the room.
    if (fieldsRef.current.roomEnded) fields.roomEnded = true;
    fieldsRef.current = fields;
    relayRef.current?.send(buildBridgeWidgetSnapshot(fields, Date.now()));
    // `voice` is represented by `voiceKey`; `translation`, `transcriptPause`, `mic` and `meetLeave`
    // by their values.
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
    bridgeRole,
    bridgeCapturerAway,
    audioMode,
    sessionDisplaced,
    meetCaptionsOff,
    micEnabled,
    micControl,
    micOverride,
    meetLeaveState,
    meetLeaveEndsAtMs,
    meetLeaveCause,
    meetLeaveRetrying,
    outboundLeg,
    outboundSinceMs,
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
        // W4b. The same no-reply rule: a takeover changes `bridgeRole`, and the field effect says so.
        case "take-over-capture":
          if (handlers.onTakeOverCapture) handlers.onTakeOverCapture();
          else sendSnapshot();
          break;
        // Text-only bridge. The same no-reply rule: a switch changes `audioMode`, the field effect
        // says so. A refused one (text → voice while live) leaves `audioMode` as it is, and the
        // popup's pending pick expires against it and says why.
        case "set-audio-mode":
          if (handlers.onSetAudioMode) handlers.onSetAudioMode(message.mode);
          else sendSnapshot();
          break;
        // web #646. Stale once the session is back (taken over here, or a second press): a take-over
        // of a working session would evict the other device again for nothing.
        case "take-over-session":
          if (handlers.onTakeOverSession && acceptsSessionTakeOver(fieldsRef.current.sessionDisplaced)) {
            handlers.onTakeOverSession();
          } else {
            sendSnapshot();
          }
          break;
        // No reply when applied, like set-language: the switch changes `micDeviceId`, and the field
        // effect reports it. A main window that cannot switch answers with what is true.
        case "set-mic-device":
          if (handlers.onSetMicDevice) handlers.onSetMicDevice(message.deviceId);
          else sendSnapshot();
          break;
        // WT-912. Stale once the user is out of the call ("none"): the strip the press came from no
        // longer exists, so say what is true instead. While following Meet it is an override.
        case "set-mic-enabled":
          if (handlers.onSetMicEnabled && acceptsManualMic(fieldsRef.current.mic?.control)) {
            handlers.onSetMicEnabled(message.enabled);
          } else {
            sendSnapshot();
          }
          break;
        // WT-913. Stale once nothing is counting down: answered already, or the user rejoined the
        // call. An old "End now" must never end a room whose user is back in the meeting.
        case "answer-meet-left":
          if (handlers.onAnswerMeetLeft && acceptsMeetLeftAnswer(fieldsRef.current.meetLeave)) {
            handlers.onAnswerMeetLeft(message.end);
          } else {
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

  const announceEnded = useCallback(() => {
    fieldsRef.current = { ...fieldsRef.current, roomEnded: true };
    relayRef.current?.send(buildBridgeWidgetSnapshot(fieldsRef.current, Date.now()));
  }, []);
  return { announceEnded };
}
