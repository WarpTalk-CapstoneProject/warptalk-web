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
 *
 * Returns `meetCaptionsOff`: Meet's CC looks off on the captured call (lib/meeting/meet-captions-off),
 * so there are no names to read. The session relays it to the bridge popup — this window is hidden
 * while bridging — and this hook also says it as a toast here whenever this window is visible.
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { HubConnectionState, type HubConnection } from "@microsoft/signalr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ensureMeetCaptionsOn, streamMeetCaptions } from "@/lib/desktop/bridge";
import {
  FarSpeakerHintBatcher,
  REPORT_FAR_SPEAKER_HINTS,
} from "@/lib/meeting/far-speaker-hints";
import { MeetCaptionsOffWatch } from "@/lib/meeting/meet-captions-off";

/** One toast at a time, replaced rather than stacked. */
const MEET_CAPTIONS_OFF_TOAST_ID = "bridge-meet-captions-off";

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
}): { meetCaptionsOff: boolean } {
  const t = useTranslations("rooms.bridgeWidget");
  const batcherRef = useRef<FarSpeakerHintBatcher | null>(null);
  const [meetCaptionsOff, setMeetCaptionsOff] = useState(false);

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
      // Bug B3: a warning reaches the desktop's main.log, so a refused or failing hop is visible.
      // The first failure of a run, then every tenth, so a long outage does not flood it.
      onSendError: (error, failures) => {
        if (failures !== 1 && failures % 10 !== 0) return;
        console.warn("[bridge] Meet speaker names not delivered to the hub:", {
          failures,
          reason: error instanceof Error ? error.message : String(error),
        });
      },
    });

    const watch = new MeetCaptionsOffWatch({ onChange: setMeetCaptionsOff });
    const stop = streamMeetCaptions(
      meetCode,
      (event) => batcher.add(event),
      (status) => watch.status(status),
    );
    if (!stop) {
      watch.dispose();
      return; // A browser, or a desktop build without the caption stream.
    }
    batcherRef.current = batcher;
    let active = true;

    // CC has to be on for there to be anything to read. Best-effort: the desktop only presses
    // Meet's own CC button; a refusal it could not get past ("cc-button-hidden") is said to the
    // user as the CC-off notice, one ("disabled") that CC cannot fix is not.
    void ensureMeetCaptionsOn(meetCode).then((result) => {
      if (result && !result.ok) {
        console.info("[bridge] Meet captions not turned on:", result.reason ?? result.state);
      }
      if (active) watch.ensureResult(result);
    });

    return () => {
      active = false;
      watch.dispose();
      setMeetCaptionsOff(false);
      if (batcherRef.current === batcher) batcherRef.current = null;
      // Stop the read first (its final flush still reaches us), then send what is left.
      void stop().then(() => batcher.dispose({ finalFlush: true }));
    };
  }, [enabled, roomId, meetCode, connectionRef]);

  useEffect(() => {
    if (hubGeneration > 0) batcherRef.current?.flushNow();
  }, [hubGeneration]);

  // The same notice as a toast in THIS window, when it is on screen: while bridging it is hidden
  // and the popup carries the notice; shown again (by the user or "Show WarpTalk"), it says it too.
  useEffect(() => {
    if (!meetCaptionsOff) {
      toast.dismiss(MEET_CAPTIONS_OFF_TOAST_ID);
      return;
    }
    if (typeof document === "undefined") return;
    let shown = false;
    const show = () => {
      if (shown || document.visibilityState !== "visible") return;
      shown = true;
      toast.warning(t("meetCaptions.title"), {
        id: MEET_CAPTIONS_OFF_TOAST_ID,
        description: t("meetCaptions.body"),
        duration: 15_000,
      });
    };
    show();
    document.addEventListener("visibilitychange", show);
    return () => document.removeEventListener("visibilitychange", show);
  }, [meetCaptionsOff, t]);

  return { meetCaptionsOff };
}
