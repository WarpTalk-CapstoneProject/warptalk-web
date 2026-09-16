"use client";

import { useEffect, useRef } from "react";

import { BROADCAST_CHANNELS } from "@/constants/realtime";
import type { BrowserCaptureConsentState } from "@/lib/audio/browser-capture-consent";
import { openTranscriptWindow } from "@/lib/desktop/bridge";
import {
  CONSENT_POPUP_RAISE_GRACE_MS,
  buildBridgeConsentSnapshot,
  parseBridgeConsentMessage,
  resolveBridgeConsentIntent,
  shouldRaiseConsentPopup,
  type BridgeConsentSurface,
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
 * NOTHING IS STORED IN REACT STATE
 *   This hook renders nothing. Everything it learns - the popup acknowledged, the question was
 *   asked at this moment - only ever feeds a timer or a postMessage, so putting it in state would
 *   buy a re-render of a ~3800-line session component and nothing else.
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
}

export interface UseBridgeConsentHostOptions extends BridgeConsentHostView {
  /** `isBridgeRoom && isHost`. Nobody else owns the capture, so nobody else may answer for it. */
  enabled: boolean;
  /** Where the question is being asked, from `bridgeConsentSurface`. Drives the raise, not the publish. */
  surface: BridgeConsentSurface;
  onSelectSource: (sourceId: string) => void;
  onAnswer: (granted: boolean) => void;
  onReask: () => void;
}

function postSnapshot(channel: BroadcastChannel | null, view: BridgeConsentHostView): void {
  channel?.postMessage(buildBridgeConsentSnapshot(view));
}

export function useBridgeConsentHost(options: UseBridgeConsentHostOptions): void {
  const { enabled, roomId, consent, sources, selectedSourceId, loadingSources, surface } = options;

  const channelRef = useRef<BroadcastChannel | null>(null);
  const viewRef = useRef<BridgeConsentHostView>({
    roomId,
    consent,
    sources,
    selectedSourceId,
    loadingSources,
  });
  const callbacksRef = useRef({
    onSelectSource: options.onSelectSource,
    onAnswer: options.onAnswer,
    onReask: options.onReask,
  });
  /** Set by an `ack` from the popup; read only by the raise timer. See shouldRaiseConsentPopup. */
  const acknowledgedRef = useRef(false);
  const askedAtMsRef = useRef(0);

  // Declared first so it has run before the effects below read these refs in the same commit.
  // No dependency array: every one of these can move on any render, and a stale mirror here would
  // make main answer the popup with something it no longer believes.
  useEffect(() => {
    viewRef.current = { roomId, consent, sources, selectedSourceId, loadingSources };
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
    });
  }, [enabled, roomId, consent, sources, selectedSourceId, loadingSources]);

  /**
   * One ask, one chance to raise the popup.
   *
   * `surface === "popup"` becoming true IS the ask, so the ack is cleared here rather than when
   * the answer lands: an ack belongs to the question it was sent for, and the previous question's
   * would otherwise vouch for this one. Nothing can have acknowledged this ask yet - the popup
   * only acks a "required" snapshot, which has not been published at the moment this runs.
   *
   * The timer survives the main window being hidden behind Meet because the desktop shell sets
   * `backgroundThrottling: false` on it; a throttled window would raise the popup late or never.
   */
  useEffect(() => {
    if (!enabled || surface !== "popup") return;

    acknowledgedRef.current = false;
    askedAtMsRef.current = Date.now();
    const askedAtMs = askedAtMsRef.current;

    const timer = window.setTimeout(() => {
      if (
        shouldRaiseConsentPopup({
          surface,
          acknowledged: acknowledgedRef.current,
          askedAtMs,
          nowMs: Date.now(),
        })
      ) {
        // Only after silence: openTranscriptWindow on a popup that is already open costs the host
        // an OS notification over a question they are already looking at.
        void openTranscriptWindow(roomId);
      }
    }, CONSENT_POPUP_RAISE_GRACE_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, roomId, surface]);
}
