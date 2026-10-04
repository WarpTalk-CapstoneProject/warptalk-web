"use client";

/**
 * SLOT: "REC" in the popup's top row while the room is being recorded. WT-910.
 *
 * WHY IT IS HERE
 *   A bridged Meet call is recorded by default (PO, 2026-10-01; lib/meeting/bridge-recording), and
 *   the popup is the only WarpTalk surface a bridge user looks at — the main window, where the
 *   native meeting draws its REC badge, is hidden behind Google Meet. A recording nobody on this
 *   side can see is the thing the native meeting's "never started for you" rule exists to prevent,
 *   so the standing notice has to be in this window, for the whole time it is true.
 *
 * WHERE THE STATE COMES FROM
 *   The main window (use-bridge-recording-relay): it holds the RecordingStateChanged broadcast, and
 *   this window's own hub connection never joins the room group. Without a main window running the
 *   room there is no snapshot and the chip draws nothing, rather than guessing.
 *
 * STOP
 *   Offered only to the room host or the capturer — the backend refuses anybody else for a bridge
 *   room. It is a request: the main window re-checks it and calls the same mutation the native
 *   button does, and the chip goes away when the room says the recording stopped, not on the press.
 *   There is no Start here on purpose: starting is the consent prompt's checkbox.
 *
 * No props — see widget-context.tsx.
 */

import { useBridgeRecordingPrompt } from "@/hooks/use-bridge-recording-relay";

import { useBridgeWidget } from "./widget-context";

export function RecordingChip() {
  const { roomId, ended } = useBridgeWidget();
  const { view, stop } = useBridgeRecordingPrompt(roomId);

  if (ended || view.kind !== "recording") return null;

  return (
    <span
      data-bridge-recording-chip
      role="status"
      aria-label="This meeting is being recorded"
      className="flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink"
    >
      {/* Static, like the egress page's badges: a pulsing dot in an always-on-top window is a
          distraction over the call for an hour. */}
      <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
      REC
      {view.canStop ? (
        <button
          type="button"
          onClick={stop}
          aria-label="Stop recording"
          className="ml-0.5 rounded px-0.5 font-semibold normal-case tracking-normal text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Stop
        </button>
      ) : null}
    </span>
  );
}
