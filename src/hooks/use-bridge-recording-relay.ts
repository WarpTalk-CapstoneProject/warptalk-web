"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BRIDGE_RECORDING_RELAY_VERSION,
  bridgeRecordingChannelName,
  bridgeRecordingChipView,
  buildBridgeRecordingSnapshot,
  shouldShowRecordingStartNotice,
  parseBridgeRecordingMessage,
  resolveBridgeRecordingIntent,
  type BridgeRecordingChipView,
  type BridgeRecordingSnapshot,
} from "@/lib/meeting/bridge-recording";

/**
 * Both ends of the recording relay between the main window and the Meet popup. WT-910.
 *
 * Every rule lives in lib/meeting/bridge-recording.ts, which is pure and tested: main publishes
 * whole snapshots, the popup sends intents, main re-checks each one against what it knows now.
 * What is left here is the plumbing — one channel per room, and refs for the values a callback
 * must read long after the render that registered it (same shape as use-bridge-consent-host).
 *
 * WHY ITS OWN CHANNEL
 *   The recording is a fact about the room that EVERY bridge participant's popup should show, where
 *   the consent relay is published by the capturer alone. Folding this into that snapshot would
 *   have left a member's popup with no REC while they were being recorded.
 */

export interface UseBridgeRecordingHostOptions {
  roomId: string;
  /** A bridge room. Nothing is published for a native meeting: it has its own REC badge. */
  enabled: boolean;
  recording: boolean;
  /** Room host or capturer. The server refuses anybody else for a bridge room. */
  canStop: boolean;
  onStop: () => void;
}

/** Main window: publish the recording state, and honour a checked Stop from the popup. */
export function useBridgeRecordingHost(options: UseBridgeRecordingHostOptions): void {
  const { roomId, enabled, recording, canStop } = options;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const viewRef = useRef<{ roomId: string; recording: boolean; canStop: boolean; startedAt: number | null }>({
    roomId,
    recording,
    canStop,
    startedAt: null,
  });
  const onStopRef = useRef(options.onStop);

  // Declared first so it has run before the effects below read the refs in the same commit.
  useEffect(() => {
    // WT-916: stamped once per start — kept while this recording runs, cleared when it stops or the
    // room changes — so every republish of one recording names the same start.
    const previous = viewRef.current;
    const startedAt = !recording
      ? null
      : previous.recording && previous.roomId === roomId && previous.startedAt !== null
        ? previous.startedAt
        : Date.now();
    viewRef.current = { roomId, recording, canStop, startedAt };
    onStopRef.current = options.onStop;
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(bridgeRecordingChannelName(roomId));
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const message = parseBridgeRecordingMessage(event.data);
      if (!message) return;
      const action = resolveBridgeRecordingIntent(message, viewRef.current);
      if (!action) return;
      if (action.type === "republish") {
        channel.postMessage(buildBridgeRecordingSnapshot(viewRef.current));
        return;
      }
      onStopRef.current();
    };

    return () => {
      channelRef.current = null;
      // The last word before the channel goes: this window no longer vouches for a recording. A
      // popup left showing REC with nobody behind it is a claim nothing can retract.
      channel.postMessage(buildBridgeRecordingSnapshot({ roomId, recording: false, canStop: false }));
      channel.close();
    };
  }, [enabled, roomId]);

  // The whole state, every time it moves. Never a delta.
  useEffect(() => {
    // From the ref, which the effect above has just brought up to date: it carries `startedAt`.
    channelRef.current?.postMessage(buildBridgeRecordingSnapshot(viewRef.current));
  }, [enabled, roomId, recording, canStop]);
}

export interface BridgeRecordingPrompt {
  view: BridgeRecordingChipView;
  stop: () => void;
  /** WT-916: show "Recording started. Tell everyone in the call." (shouldShowRecordingStartNotice). */
  startNotice: boolean;
  dismissStartNotice: () => void;
}

/**
 * Popup: the last snapshot, and a Stop that is only a request.
 *
 * No optimistic state, for the consent relay's reason: a chip that vanished on the press while the
 * server refused the stop would say "not recording" over a meeting that still is.
 */
export function useBridgeRecordingPrompt(roomId: string): BridgeRecordingPrompt {
  const [snapshot, setSnapshot] = useState<BridgeRecordingSnapshot | null>(null);
  /** The start whose notice was dismissed. Window-local: a dismissal is this reader's, not the room's. */
  const [dismissedStartedAt, setDismissedStartedAt] = useState<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(bridgeRecordingChannelName(roomId));
    channelRef.current = channel;
    const hello = () =>
      channel.postMessage({ v: BRIDGE_RECORDING_RELAY_VERSION, kind: "hello", roomId });

    channel.onmessage = (event) => {
      const message = parseBridgeRecordingMessage(event.data);
      if (!message || message.kind !== "snapshot" || message.roomId !== roomId) return;
      setSnapshot(message);
    };

    // BroadcastChannel has no replay: ask on mount, and again whenever the popup comes back.
    const askAgainWhenVisible = () => {
      if (document.visibilityState === "visible") hello();
    };
    document.addEventListener("visibilitychange", askAgainWhenVisible);
    hello();

    return () => {
      document.removeEventListener("visibilitychange", askAgainWhenVisible);
      channel.onmessage = null;
      channel.close();
      channelRef.current = null;
    };
  }, [roomId]);

  const stop = useCallback(() => {
    channelRef.current?.postMessage({ v: BRIDGE_RECORDING_RELAY_VERSION, kind: "stop", roomId });
  }, [roomId]);

  const startedAt = snapshot?.startedAt ?? null;
  const dismissStartNotice = useCallback(() => setDismissedStartedAt(startedAt), [startedAt]);

  return {
    view: bridgeRecordingChipView(snapshot, roomId),
    stop,
    startNotice: shouldShowRecordingStartNotice(snapshot, roomId, dismissedStartedAt),
    dismissStartNotice,
  };
}
