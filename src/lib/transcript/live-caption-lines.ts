/**
 * What the live caption lane shows.
 *
 * HISTORY IS BACK, INSIDE THE LANE (4 Oct 2026, product owner)
 *   WT-873 cut the lane to the last two lines because its history opened as a panel that grew
 *   UPWARD over the camera view. Readers then had no way to glance back at a sentence they
 *   missed short of opening the transcript panel. The history now scrolls INSIDE the lane's own
 *   box — it never grows over the video — and the corner control collapses the lane to the one
 *   line being spoken, or opens it again. LIVE_CAPTION_HISTORY_LINES bounds what is rendered.
 *
 * WHY THE SPEAKER IS NOT ON EVERY LINE
 *   Each line used to carry avatar + name, left-aligned like a chat thread, which read as a chat
 *   feed laid over video rather than a subtitle. A subtitle names the speaker when the speaker
 *   changes. So a line shows its speaker only when it is the first line on screen or the line
 *   above it was somebody else; a person talking on just shows their words.
 *
 * Pure and dependency-free: node-run contract tests import it without a bundler.
 */

/** How many utterances the open lane keeps to scroll back through. Bounded: it is live DOM. */
export const LIVE_CAPTION_HISTORY_LINES = 200;

/** The collapsed lane: the line being spoken, nothing else. */
export const LIVE_CAPTION_COLLAPSED_LINES = 1;

function languageBase(language: string | null | undefined): string {
  return (language ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Whether live text (the words of a turn still being spoken) belongs in THIS reader's lane.
 *
 * Only when the speaker talks the reader's language. Live text is the original, unpunctuated and
 * still changing; for a reader in another language it put a foreign half-sentence in the lane,
 * which the translation then replaced a second later — the "fast but wrong" the owner saw on
 * 4 Oct. A reader whose language is not resolved yet sees it: a cold lane reads as broken.
 */
export function isLiveTextForReader(
  liveLanguage: string | null | undefined,
  readerLanguage: string | null | undefined,
): boolean {
  const reader = languageBase(readerLanguage);
  if (!reader) return true;
  return languageBase(liveLanguage) === reader;
}

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
  limit: number = LIVE_CAPTION_HISTORY_LINES,
): LiveCaptionLine<T>[] {
  if (limit <= 0 || lines.length === 0) return [];
  const visible = lines.slice(-limit);
  return visible.map((line, index) => ({
    line,
    showSpeaker:
      index === 0 || speakerKey(speakerOf(visible[index - 1])) !== speakerKey(speakerOf(line)),
  }));
}
