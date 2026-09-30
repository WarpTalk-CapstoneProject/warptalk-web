/**
 * What the live caption lane shows: the current caption, and nothing to scroll back through.
 *
 * WHY THERE IS NO HISTORY HERE ANY MORE (WT-873)
 *   The lane used to keep five hundred utterances rendered and open them as an "Earlier
 *   captions" panel when the reader scrolled up in it. That panel grew UPWARD over the camera
 *   view, so reading back through captions meant covering the faces of the people speaking — and
 *   it did the same job as the Transcript side panel, which is the record (every line, the
 *   original beside the translation, timestamps). Captions are for reading the room live; the
 *   panel is for reading back. The lane keeps a corner button into the panel instead.
 *
 * WHY THE SPEAKER IS NOT ON EVERY LINE
 *   Each line used to carry avatar + name, left-aligned like a chat thread, which read as a chat
 *   feed laid over video rather than a subtitle. A subtitle names the speaker when the speaker
 *   changes. So a line shows its speaker only when it is the first line on screen or the line
 *   above it was somebody else; a person talking on just shows their words.
 *
 * Pure and dependency-free: node-run contract tests import it without a bundler.
 */

/** How many utterances the lane shows at once: the one being spoken and the one before it. */
export const LIVE_CAPTION_VISIBLE_LINES = 2;

export type LiveCaptionLine<T> = {
  line: T;
  /** Draw avatar + name before this line: first on screen, or the speaker changed. */
  showSpeaker: boolean;
};

function speakerKey(speaker: string | null | undefined): string {
  return (speaker ?? "").trim().toLowerCase();
}

/**
 * The newest `limit` lines, each marked with whether it opens a new speaker run. Speaker ids are
 * compared case-insensitively — the roster and the pipeline do not agree on UUID casing.
 */
export function liveCaptionLines<T>(
  lines: readonly T[],
  speakerOf: (line: T) => string | null | undefined,
  limit: number = LIVE_CAPTION_VISIBLE_LINES,
): LiveCaptionLine<T>[] {
  if (limit <= 0 || lines.length === 0) return [];
  const visible = lines.slice(-limit);
  return visible.map((line, index) => ({
    line,
    showSpeaker:
      index === 0 || speakerKey(speakerOf(visible[index - 1])) !== speakerKey(speakerOf(line)),
  }));
}
