"use client";

/**
 * SLOT: what replaces the tabs and the dock once the room has ENDED. Owner: WT-525 t3.
 *
 * CONTRACT
 *   `export function EndedView()` — no props; read from `useBridgeWidget()`.
 *   The shell renders it, below the header, in place of the tabs and the dock whenever `ended`
 *   is true, inside a `flex min-h-0 flex-1 flex-col` region.
 *
 * THE POPUP HAS NO END BUTTON (PO, 2026-10-01), AND WHAT ACTUALLY ENDS THE ROOM (WT-913)
 *   A bridge room follows its Google Meet call, and what tells WarpTalk is the DESKTOP, not
 *   Google: the desktop app reads Meet's own buttons, and when the room's host leaves the call
 *   the main window ends the room 30 s later (lib/meeting/bridge-meet-follow; the popup only gets
 *   to answer "End now" or "Keep open" in between). The comment that stood here said the backend
 *   learns of the conference's end from Google. Nothing in the bridge path relies on that: the
 *   Google Meet plugin is at most a silent fallback, and most users never connect it.
 *
 *   The other ways a room ends are the server's own sweeps once everyone is gone (nobody left
 *   connected, or the room idle), and an End made from the room's page in the main window.
 *
 *   So this screen only reports that the room HAS ended and hands the user to what was kept. It
 *   claims nothing about the Meet call itself, which may still be going for everyone else.
 *
 * "OPEN MEETING RECORD": WHERE IT GOES, AND HOW
 *   The room's own page, `/rooms/{roomId}` — the WT-364 address that forwards to the room page in
 *   the workspace the reader has open. Its first tab is Recap — recording, transcript and summary
 *   — and it is where TranslationRoomEnded sends everybody (persistent-meeting-session), so the
 *   popup does not invent a second destination for the same moment.
 *
 *   First choice: ask the main window over the relay (`open-room-record`), which opens it where
 *   the user is already signed in. Only when no main window is listening does it fall back to
 *   `openInSystemBrowser` (and `window.open` where there is no desktop bridge at all) — that
 *   browser may not be signed in to WarpTalk and then shows sign-in first.
 */

import { ArrowSquareOut, CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { openInSystemBrowser } from "@/lib/desktop/bridge";
import { roomDetailPath } from "@/lib/workspace/workspace-routes";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { useBridgeWidget } from "./widget-context";

export function EndedView() {
  const { roomId, room, relay } = useBridgeWidget();
  // WT-587: an ephemeral room writes nothing down. "The transcript is saved" would be a promise
  // the system does not keep, and a recap button would open a page with nothing on it. Absent
  // reads as saved, as it does everywhere else.
  const savesTranscript = room?.settings?.saveTranscript !== false;
  // Persisted to localStorage, which this window shares with the main one (same origin), so it is
  // the workspace the user had open there.
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  async function openRecord() {
    if (relay.openRoomRecord()) return;
    // Without a slug, `/rooms/{id}` — the WT-364 address that forwards to the room page using
    // the workspace the reader has open, and to the workspace picker when there is none. Better
    // than fabricating a slug, which is a 404.
    const path = workspaceSlug ? roomDetailPath(workspaceSlug, roomId) : `/rooms/${roomId}`;
    // Absolute: the system browser has no origin to resolve a path against.
    const url = new URL(path, window.location.origin).toString();
    if (await openInSystemBrowser(url)) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section
      aria-labelledby="bridge-widget-ended-title"
      className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-6 py-6"
    >
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
          <CheckCircle size={14} weight="fill" className="text-semantic-success" aria-hidden="true" />
          WarpTalk room ended
        </p>
        <h1 id="bridge-widget-ended-title" className="text-base font-semibold text-ink">
          WarpTalk has stopped listening and translating
        </h1>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          {savesTranscript
            ? "The transcript is saved, and the summary will be ready in a moment."
            : "This meeting was not being recorded, so there is no transcript or summary."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {savesTranscript ? (
          <Button size="sm" onClick={() => void openRecord()}>
            Open meeting record
            <ArrowSquareOut size={13} aria-hidden="true" />
          </Button>
        ) : null}
        {/* Closes this popup only. Meet is a different app, and the main WarpTalk window is a
            different window, so neither is touched. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.close()}
          className="border-border bg-surface-1 text-ink hover:bg-surface-3"
        >
          Close
        </Button>
      </div>
    </section>
  );
}
