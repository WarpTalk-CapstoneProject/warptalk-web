"use client";

/**
 * SLOT: "Recording started. Tell everyone in the call." WT-916.
 *
 * WHY IT EXISTS
 *   The REC chip tells everyone on the WarpTalk side. People who are only in Google Meet see none
 *   of it, and WarpTalk cannot draw inside Meet — so the only way they learn the call is being
 *   recorded is the host saying so. This is the nudge to say it, at the moment it becomes true.
 *
 * WHEN IT SHOWS
 *   Once per recording start, to whoever can control the bridge (room host or capturer), until it
 *   is dismissed or the recording stops. The rule is `shouldShowRecordingStartNotice` in
 *   lib/meeting/bridge-recording.ts, pure and tested; this file only draws it.
 *
 * One line in the notice strip above the panes, never in the dock row: the dock has no room at
 * this width, and a notice about the call belongs with the other notices about the call.
 *
 * No props — see widget-context.tsx.
 */

import { useBridgeRecordingPrompt } from "@/hooks/use-bridge-recording-relay";
import { BRIDGE_RECORD_CHOICE } from "@/lib/audio/browser-capture-consent";

import { useBridgeWidget } from "./widget-context";

export function RecordingStartNotice() {
  const { roomId, ended } = useBridgeWidget();
  const { startNotice, dismissStartNotice } = useBridgeRecordingPrompt(roomId);

  if (ended || !startNotice) return null;

  return (
    <div
      data-bridge-recording-start-notice
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-destructive/10 px-3.5 py-1.5 text-[11px] leading-snug text-ink"
    >
      <span className="min-w-0 flex-1 font-medium">{BRIDGE_RECORD_CHOICE.started}</span>
      <button
        type="button"
        onClick={dismissStartNotice}
        className="shrink-0 rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {BRIDGE_RECORD_CHOICE.dismiss}
      </button>
    </div>
  );
}
