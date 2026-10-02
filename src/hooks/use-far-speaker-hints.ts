"use client";

/**
 * Forwards live Google Meet speaker names from the capturer's desktop to the hub (desktop #44,
 * backend #499). The batching and the hub contract are lib/meeting/far-speaker-hints.
 *
 * Mounted by PersistentMeetingSession, i.e. the hidden MAIN window — never the popup
 * (/desktop-transcript): the desktop sends caption events to the main window only, and the main
 * window is the one holding the hub connection the hints travel on.
 *
 * A no-op unless every one of these holds, which `enabled` carries from the session:
 *   - an EXTERNAL_BRIDGE room whose meeting is open (not ended, not idle-reaped);
 *   - this desktop is the bridge CAPTURER — the server refuses anyone else, and a member's Meet
 *     window is not the one being bridged;
 *   - the room has a Meet code;
 * and only on a desktop build that has the caption methods (per-method guards in
 * lib/desktop/bridge): a browser or an older desktop never gets past `streamMeetCaptions`.
 *
 * Losing any of them (role taken over, meeting ended, unmount) stops the desktop's read and
 * unsubscribes. A hub (re)connect (`hubGeneration`) resends whatever was not delivered.
 */

import { useEffect, useRef, type MutableRefObject } from "react";
import { HubConnectionState, type HubConnection } from "@microsoft/signalr";

import { ensureMeetCaptionsOn, streamMeetCaptions } from "@/lib/desktop/bridge";
import {
  FarSpeakerHintBatcher,
  REPORT_FAR_SPEAKER_HINTS,
} from "@/lib/meeting/far-speaker-hints";

export function useFarSpeakerHints({
  roomId,
  meetCode,
  enabled,
  connectionRef,
  hubGeneration,
}: {
  roomId: string;
  meetCode: string | null | undefined;
  /** Bridge room, meeting open, this desktop is the capturer. */
  enabled: boolean;
  connectionRef: MutableRefObject<HubConnection | null>;
  /** Bumped on every hub start/reconnect; a change resends what is pending. */
  hubGeneration: number;
}): void {
  const batcherRef = useRef<FarSpeakerHintBatcher | null>(null);

  useEffect(() => {
    if (!enabled || !roomId || !meetCode) return;

    const batcher = new FarSpeakerHintBatcher({
      meetCode,
      send: (hints, clientNowMs) => {
        const connection = connectionRef.current;
        if (!connection || connection.state !== HubConnectionState.Connected) {
          return Promise.reject(new Error("hub not connected"));
        }
        return connection.invoke(REPORT_FAR_SPEAKER_HINTS, roomId, hints, clientNowMs);
      },
    });

    const stop = streamMeetCaptions(meetCode, (event) => batcher.add(event));
    if (!stop) return; // A browser, or a desktop build without the caption stream.
    batcherRef.current = batcher;

    // CC has to be on for there to be anything to read. Best-effort: the desktop only presses
    // Meet's own CC button, and a refusal ("disabled", "cc-button-hidden") costs only the names.
    void ensureMeetCaptionsOn(meetCode).then((result) => {
      if (result && !result.ok) {
        console.info("[bridge] Meet captions not turned on:", result.reason ?? result.state);
      }
    });

    return () => {
      if (batcherRef.current === batcher) batcherRef.current = null;
      // Stop the read first (its final flush still reaches us), then send what is left.
      void stop().then(() => batcher.dispose({ finalFlush: true }));
    };
  }, [enabled, roomId, meetCode, connectionRef]);

  useEffect(() => {
    if (hubGeneration > 0) batcherRef.current?.flushNow();
  }, [hubGeneration]);
}
