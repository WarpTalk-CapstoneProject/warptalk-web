"use client";

/**
 * What a paused transcript says in the Meet widget. WT-525 t2, WT-605.
 *
 * The same notice, word for word and class for class, as `TranscriptPausedNotice` in
 * live/side-panel/transcript-panel.tsx. That one is private to its module and this task may not
 * edit it, so the markup is matched rather than imported. TODO(WT-525): export it from there (or
 * move it beside the other transcript pieces) and render it here, so the copy has one home.
 *
 * The second sentence is the point and must not be dropped. Pausing the transcript is NOT the
 * meeting stopping: translation, dubbing and subtitles run exactly as before. In this window that
 * matters more than anywhere, because it floats over a Google Meet call where people are visibly
 * still being translated — a notice that let someone believe otherwise would have them restart a
 * translation that never stopped.
 */

import { PauseCircle } from "@phosphor-icons/react/dist/ssr";

export function WidgetTranscriptPausedNotice({ since }: { since: string | null }) {
  // Null when the pause is known without a start time — the broadcast carries none, and the
  // window list may not have caught up yet. The notice then says it is paused without a clock
  // rather than inventing one.
  const startedAt = since
    ? new Date(since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      role="status"
      className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-ink"
    >
      <PauseCircle weight="fill" className="mt-[2px] h-4 w-4 shrink-0 text-amber-500" />
      <div>
        <span className="font-medium">Transcript paused{startedAt ? ` at ${startedAt}` : ""}</span>
        <p className="mt-0.5 text-ink-muted">
          Nothing said from now on is written down. Live translation, dubbing and subtitles are
          still running.
        </p>
      </div>
    </div>
  );
}
