"use client";

/**
 * SLOT: what replaces the tabs and the dock once the session has been ended from the widget.
 * Owner: WT-525 t3.
 *
 * CONTRACT
 *   `export function EndedView()` — no props; read from `useBridgeWidget()`.
 *   The shell renders it, below the header, in place of the tabs and the dock whenever `ended`
 *   is true, inside a `flex min-h-0 flex-1 flex-col` region.
 *
 * THE ONE SENTENCE THAT MUST BE TRUE OF ANY VERSION OF THIS SCREEN
 *   The Google Meet call is still going. End stopped WarpTalk, not the call — Meet owns the call,
 *   and a user who reads "ended" as "my meeting is over" leaves a call their colleagues are still
 *   in. So it is the first thing the sub text says, before what was saved.
 *
 * "OPEN RECAP": WHERE IT GOES, AND WHY THE SYSTEM BROWSER
 *   The room's own page (`roomDetailPath`). Its first tab is Recap — recording, transcript and
 *   summary — and it is where "End meeting for all" sends the host, and where TranslationRoomEnded
 *   sends everybody else (persistent-meeting-session), so the popup does not invent a third
 *   destination for the same moment.
 *
 *   The desktop bridge has no way to point the MAIN window at a URL. `activateBridgeRoom` is not
 *   one: it makes the room the main window's active meeting, which for a room just ended would
 *   mount a meeting session for it rather than open its record. So this uses
 *   `openInSystemBrowser`, and `window.open` where there is no bridge (the route in a browser tab).
 *   Inside the desktop app the two land in the same place — the popup's window-open handler
 *   already hands every URL to the system browser — but saying so explicitly keeps the choice
 *   here instead of in another repo's handler.
 *   Known cost: the system browser may not be signed in to WarpTalk, and then shows sign-in first.
 *   TODO(WT-525): a bridge method that navigates the main window would open the recap where the
 *   user is already signed in.
 */

import { ArrowSquareOut, CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { openInSystemBrowser } from "@/lib/desktop/bridge";
import { roomDetailPath } from "@/lib/workspace/workspace-routes";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { useBridgeWidget } from "./widget-context";

export function EndedView() {
  const { roomId, room } = useBridgeWidget();
  // WT-587: an ephemeral room writes nothing down. "The transcript is saved" would be a promise
  // the system does not keep, and a recap button would open a page with nothing on it. Absent
  // reads as saved, as it does everywhere else.
  const savesTranscript = room?.settings?.saveTranscript !== false;
  // Persisted to localStorage, which this window shares with the main one (same origin), so it is
  // the workspace the user had open there.
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  async function openRecap() {
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
          Session ended
        </p>
        <h1 id="bridge-widget-ended-title" className="text-base font-semibold text-ink">
          WarpTalk has stopped translating
        </h1>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          {savesTranscript
            ? "Your Google Meet call is still going. The transcript is saved, and the summary will be ready in a moment."
            : "Your Google Meet call is still going. This meeting was not being recorded, so there is no transcript or summary."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {savesTranscript ? (
          <Button size="sm" onClick={() => void openRecap()}>
            Open recap
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
