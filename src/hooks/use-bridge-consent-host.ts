"use client";

import { useEffect, useRef, useState } from "react";

import { BROADCAST_CHANNELS } from "@/constants/realtime";
import type { InboundHealth } from "@/lib/audio/bridge-inbound-health";
import type { BrowserCaptureConsentState } from "@/lib/audio/browser-capture-consent";
import { openTranscriptWindow } from "@/lib/desktop/bridge";
import type { BridgeInboundPath, BridgeInboundReason } from "@/lib/desktop/bridge-tiers";
import {
  applyConsentRaise,
  buildBridgeConsentSnapshot,
  initialConsentRaiseState,
  nextConsentRaise,
  parseBridgeConsentMessage,
  resolveBridgeConsentIntent,
} from "@/lib/meeting/bridge-capture-consent-relay";

/**
 * The main window's half of the loopback consent relay: it publishes, it validates, it raises.
 *
 * Every rule worth arguing about lives in lib/meeting/bridge-capture-consent-relay.ts, which is
 * pure and tested - why the popup asks and the main window decides, why an intent is checked
 * against main's own state rather than the popup's, why a raise waits for a grace period. What is
 * left here is the plumbing that cannot be pure: one channel, one timer, and state that must be
 * read by a callback which fires long after the render that registered it.
 *
 * ONE THING IS STORED IN REACT STATE
 *   Everything it learns - the popup acknowledged, the question was asked at this moment - only
 *   ever feeds a timer or a postMessage, so putting it in state would buy a re-render of a
 *   ~4500-line session component and nothing else. The exception is WT-900's verdict that the popup
 *   is not going to be seen: that one changes what the main window renders (its modal), so it is
 *   state, and it is what this hook returns.
 *
 * WHY THE VALUES ARE MIRRORED INTO REFS
 *   The channel is opened once per room, not once per render: reopening it would drop messages in
 *   flight and cost a popup its snapshot. But `onmessage` has to answer against what main knows
 *   NOW, not what it knew when the channel was created. The refs are that "now", synced on every
 *   commit before the effects below run.
 */

/** Exactly what a snapshot is built from - main's whole consent state, mirrored for the callbacks. */
interface BridgeConsentHostView {
  roomId: string;
  consent: BrowserCaptureConsentState;
  sources: ReadonlyArray<{ id: string; name: string }>;
  selectedSourceId: string | null;
  loadingSources: boolean;
  /** WT-900 hints for the popup's compact ask; see BridgeConsentSnapshot. */
  inboundPath: BridgeInboundPath | null;
  inboundReason: BridgeInboundReason | null;
  inboundHealth: InboundHealth | null;
}

export interface UseBridgeConsentHostOptions extends BridgeConsentHostView {
  /** `isBridgeRoom && isHost`. Nobody else owns the capture, so nobody else may answer for it. */
  enabled: boolean;
  /**
   * Whether a popup can be opened here at all (`canOpenTranscriptWindow()` in a bridge room). Drives
   * the raise loop, not the publish.
   */
  popupAvailable: boolean;
  onSelectSource: (sourceId: string) => void;
  onAnswer: (granted: boolean) => void;
  onReask: () => void;
}

function postSnapshot(channel: BroadcastChannel | null, view: BridgeConsentHostView): void {
  channel?.postMessage(buildBridgeConsentSnapshot(view));
}

/**
 * Returns true when the question should be asked in the main window after all: the popup was
 * raised and went unacknowledged too many times in a row (see nextConsentRaise). The caller feeds
 * it back into `bridgeConsentSurface` as "no popup". Reset by the next ask.
 */
export function useBridgeConsentHost(options: UseBridgeConsentHostOptions): boolean {
  const {
    enabled,
    roomId,
    consent,
    sources,
    selectedSourceId,
    loadingSources,
    popupAvailable,
    inboundPath,
    inboundReason,
    inboundHealth,
  } = options;

  const channelRef = useRef<BroadcastChannel | null>(null);
  const viewRef = useRef<BridgeConsentHostView>({
    roomId,
    consent,
    sources,
    selectedSourceId,
    loadingSources,
    inboundPath,
    inboundReason,
    inboundHealth,
  });
  const callbacksRef = useRef({
    onSelectSource: options.onSelectSource,
    onAnswer: options.onAnswer,
    onReask: options.onReask,
  });
  /** Set by an `ack` from the popup; read and cleared only by the raise loop. See nextConsentRaise. */
  const acknowledgedRef = useRef(false);
  /** The room whose question the raise loop gave up on the popup for. Stamped, like the answers. */
  const [mainFallbackRoomId, setMainFallbackRoomId] = useState<string | null>(null);

  // Declared first so it has run before the effects below read these refs in the same commit.
  // No dependency array: every one of these can move on any render, and a stale mirror here would
  // make main answer the popup with something it no longer believes.
  useEffect(() => {
    viewRef.current = {
      roomId,
      consent,
      sources,
      selectedSourceId,
      loadingSources,
      inboundPath,
      inboundReason,
      inboundHealth,
    };
    callbacksRef.current = {
      onSelectSource: options.onSelectSource,
      onAnswer: options.onAnswer,
      onReask: options.onReask,
    };
  });

  useEffect(() => {
    if (!enabled) return;
    // Absent during server rendering, and in principle on an old browser. A missing channel is not
    // an error here: the modal in the main window is still there as the fallback.
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(BROADCAST_CHANNELS.BRIDGE_CAPTURE_CONSENT);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const message = parseBridgeConsentMessage(event.data);
      if (!message) return;

      const view = viewRef.current;
      const action = resolveBridgeConsentIntent(message, {
        roomId: view.roomId,
        consent: view.consent,
        sourceIds: view.sources.map((source) => source.id),
        selectedSourceId: view.selectedSourceId,
      });
      if (!action) return;

      switch (action.type) {
        case "republish":
          // A popup that just opened, reloaded or came back from hidden has missed the last
          // snapshot, and BroadcastChannel does not replay. This is the replay.
          postSnapshot(channel, view);
          return;
        case "acknowledged":
          acknowledgedRef.current = true;
          return;
        case "select-source":
          callbacksRef.current.onSelectSource(action.sourceId);
          return;
        case "answer":
          callbacksRef.current.onAnswer(action.granted);
          return;
        case "reask":
          callbacksRef.current.onReask();
          return;
      }
    };

    return () => {
      channelRef.current = null;
      // The last word before the channel goes: "there is nothing to answer". Leaving the room or
      // ending the session while the prompt is up would otherwise strand the popup showing a
      // question whose only answerer has gone, with no later snapshot ever coming to clear it.
      postSnapshot(channel, {
        roomId,
        consent: "not-required",
        sources: [],
        selectedSourceId: null,
        loadingSources: false,
        inboundPath: null,
        inboundReason: null,
        inboundHealth: null,
      });
      channel.close();
    };
    // Deliberately not the snapshot fields: the channel belongs to the room, and the publish
    // effect below is what carries state changes across it.
  }, [enabled, roomId]);

  // The whole state, every time it moves. Never a delta - the popup renders the last snapshot and
  // owns nothing, so a snapshot it missed must not be a snapshot it needed.
  useEffect(() => {
    postSnapshot(channelRef.current, {
      roomId,
      consent,
      sources,
      selectedSourceId,
      loadingSources,
      inboundPath,
      inboundReason,
      inboundHealth,
    });
  }, [
    enabled,
    roomId,
    consent,
    sources,
    selectedSourceId,
    loadingSources,
    inboundPath,
    inboundReason,
    inboundHealth,
  ]);

  /**
   * WT-900 - one ask, raised until it is seen or handed to the main window.
   *
   * `consent === "required"` becoming true IS the ask, so the ack is cleared here rather than when
   * the answer lands: an ack belongs to the question it was sent for, and the previous question's
   * would otherwise vouch for this one. The loop itself is nextConsentRaise, which is pure and
   * tested; this only runs its decisions - a republish for a check, openTranscriptWindow for a
   * raise, state for the hand-over to main - and sleeps until the next one is due.
   *
   * It used to raise once per ask. A popup closed or minimised without an answer then left the
   * question open for the rest of the meeting, with the far side unheard and nothing anywhere
   * asking again.
   *
   * The timers survive the main window being hidden behind Meet because the desktop shell sets
   * `backgroundThrottling: false` on it; a throttled window would raise the popup late or never.
   */
  const asking = enabled && consent === "required";
  useEffect(() => {
    if (!asking) return;

    acknowledgedRef.current = false;
    let state = initialConsentRaiseState({ consent: "required", popupAvailable, nowMs: Date.now() });
    let timer: number | undefined;
    let stopped = false;

    const step = () => {
      if (stopped) return;
      const now = Date.now();
      state = { ...state, acknowledged: acknowledgedRef.current };
      const decision = nextConsentRaise(state, now);
      switch (decision.type) {
        case "idle":
          return;
        case "use-main":
          // Not a raise: the popup stays as it is, and may still answer. The modal is added.
          setMainFallbackRoomId(roomId);
          return;
        case "wait":
          timer = window.setTimeout(step, Math.max(0, decision.atMs - now));
          return;
        case "check":
          acknowledgedRef.current = false;
          state = applyConsentRaise(state, decision, now);
          // A visible popup acks every "required" snapshot; this is how main learns it still is.
          postSnapshot(channelRef.current, viewRef.current);
          break;
        case "raise":
          acknowledgedRef.current = false;
          state = applyConsentRaise(state, decision, now);
          // Only after silence: openTranscriptWindow on a popup that is already open costs the
          // host an OS notification over a question they are already looking at.
          void openTranscriptWindow(roomId);
          break;
      }
      step();
    };
    step();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      // The question this verdict was about is over (answered, or the room changed). The next ask
      // starts on the popup again.
      setMainFallbackRoomId(null);
    };
  }, [asking, roomId, popupAvailable]);

  return asking && mainFallbackRoomId === roomId;
}
