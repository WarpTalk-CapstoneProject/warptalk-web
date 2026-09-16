"use client";

/**
 * The window the desktop app floats over Google Meet during an external-bridge meeting. WT-525.
 *
 * It is a separate route rather than a mode of the in-meeting panel because the user is not
 * looking at WarpTalk: they are in Google Meet, and this floats over it. That rules out the
 * meeting chrome entirely — no participant grid, no control bar, no navigation — and it means the
 * page has to be legible at 460px wide and from further away than a normal panel.
 *
 * PHASE 2: A WIDGET, NOT A TRANSCRIPT WINDOW
 *   The page is now only routing and the signed-out state. Everything else is the widget in
 *   components/rooms/bridge/widget/: `BridgeWidgetProvider` owns the room's state (the hub
 *   connection, the transcript, translation and pause state, the reader's language) and
 *   `WidgetShell` lays out the slots — header, the Transcript and WarpBot tabs, and a dock that
 *   carries only WarpTalk's own controls, because Google Meet owns the call. The contract, and who
 *   owns which slot, is written at the top of widget-context.tsx.
 *
 *   The WT-577 control strip (bridge-overlay-controls.tsx) is no longer rendered here; Start/Stop
 *   and Pause move into the dock's session slot and the voice controls into its settings slot.
 *
 * WHAT WT-577 FIXED, AND WHERE IT LIVES NOW
 *   THEME. `bg-[#0b0b0c] text-white` once overrode the theme the root layout applies, so a
 *   light-theme user got one black window among their own. The shell uses theme tokens only.
 *
 *   SCROLLING. The transcript follows the newest line only while the reader is at the bottom, and
 *   offers the "Latest" chip otherwise — in transcript-pane.tsx now.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   Per-speaker avatars and the "name this voice" flow (WT-577 items 5-6) need the inbound leg
 *   split into distinct speakers first. Until WT-585 lands the diarization, every line from the
 *   far side genuinely carries one speaker id, and drawing "Speaker 2" over a stream nothing has
 *   separated would be an assertion this page cannot support.
 */

import { use } from "react";

import { WidgetShell } from "@/components/rooms/bridge/widget/widget-shell";
import { BridgeWidgetProvider } from "@/components/rooms/bridge/widget/widget-context";
import { useAuthStore } from "@/stores/auth-store";

export default function DesktopTranscriptPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Every read the widget makes is authenticated, so without a token there is nothing it could
  // honestly draw — and this window has no navigation to the sign-in page. It says where to go.
  if (!accessToken) {
    return (
      <main className="flex h-[100dvh] flex-col bg-canvas px-4 py-4 text-ink">
        <p className="text-sm text-ink-muted">
          Sign in to the WarpTalk window to see the transcript.
        </p>
      </main>
    );
  }

  return (
    // Keyed by room: a window re-pointed at another room must not carry the last one's transcript,
    // hub connection or ended state into it.
    <BridgeWidgetProvider key={roomId} roomId={roomId}>
      <WidgetShell />
    </BridgeWidgetProvider>
  );
}
