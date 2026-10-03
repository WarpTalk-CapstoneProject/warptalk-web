"use client";

import { useEffect, useRef } from "react";

import {
  classifySupervisedPublish,
  nextSupervisedPublishDelayMs,
} from "@/lib/meeting/bridge-recording";

/**
 * Keeps one bridge track (the Meet window, the Meet audio) on the wire while `enabled`.
 *
 * The single owner of re-publishing that track: it asks `publish` on a loop — every
 * MEET_WINDOW_SUPERVISE_INTERVAL_MS while the track is up (the publisher answers "published" at
 * once then, no work), and on the recovery back-off after failures. A drop by any road (the capture
 * ending, a LiveKit disconnect/reconnect, a refused publish, a remount) is therefore retried.
 *
 * `kick` true starts the loop with an immediate attempt instead of after one interval; a change of
 * `kick` restarts it (the Meet window: Meet settled back on its tab). An attempt still in flight is
 * shared by the publisher, so a restart never races it, and BRIDGE_PUBLISH_IN_FLIGHT is never
 * counted as a failure.
 */
export function useSupervisedPublish({
  enabled,
  kick = false,
  publish,
  label,
}: {
  enabled: boolean;
  kick?: boolean;
  /** Null when there is no publisher (not mounted yet): counted as a failure, so it backs off. */
  publish: () => Promise<string> | null;
  /** For the console: "Meet window", "Meet audio". */
  label: string;
}): void {
  const publishRef = useRef(publish);
  useEffect(() => {
    publishRef.current = publish;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let lastFailure: string | null = null;
    const check = async () => {
      const attempt = publishRef.current();
      const result = attempt ? await attempt : "no-publisher";
      if (cancelled) return;
      const outcome = classifySupervisedPublish(result);
      if (outcome === "up") {
        if (failures > 0) console.info(`[bridge] ${label} is back on the recording after ${failures} failed attempt(s).`);
        failures = 0;
        lastFailure = null;
      } else if (outcome === "failed") {
        failures += 1;
        // Once per reason, not once per attempt: this can repeat for the length of a meeting.
        if (result !== lastFailure) console.warn(`[bridge] ${label} still off the recording: ${result}.`);
        lastFailure = result;
      }
      timer = setTimeout(() => void check(), nextSupervisedPublishDelayMs(failures));
    };
    timer = setTimeout(() => void check(), kick ? 0 : nextSupervisedPublishDelayMs(0));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, kick, label]);
}
