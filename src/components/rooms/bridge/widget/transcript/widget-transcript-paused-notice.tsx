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
 *
 * WT-910: but only while it is TRUE. The sentence used to be unconditional, so a room whose
 * translation had been stopped (header: "Translation stopped") and whose transcript was then paused
 * said, two lines lower, that translation, dubbing and subtitles were still running. The notice now
 * takes whether translation is running and says the second sentence only when it is; with
 * translation stopped it says that instead, so the header and the notice cannot disagree. Unknown
 * (`null`) says neither — a guess either way is the same contradiction waiting to happen.
 */

import { PauseCircle } from "@phosphor-icons/react/dist/ssr";

export function WidgetTranscriptPausedNotice({
  since,
  translationRunning,
}: {
  since: string | null;
  /** Whether a translation session is running; null while that is not known yet. */
  translationRunning: boolean | null;
}) {
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
          Nothing said from now on is written down.
          {translationRunning === true
            ? " Live translation, dubbing and subtitles are still running."
            : translationRunning === false
              ? " Translation is stopped; resuming the transcript does not start it."
              : null}
        </p>
      </div>
    </div>
  );
}
