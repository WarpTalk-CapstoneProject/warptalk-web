/**
 * Live text — the words of a turn still being spoken. 4 Oct 2026.
 *
 * WHY
 *   A short sentence reached the caption ~2.5s after the speaker stopped: nothing was shown until
 *   the turn closed, although the recogniser already had the words ~1s behind the speaker. The
 *   pipeline now publishes them as they come (TranscriptInterimReceived), and this is how a client
 *   holds them.
 *
 * THE RULES
 *   - One live line per speaker. A newer item from the same speaker replaces the older one; a
 *     later update of the same item replaces its text.
 *   - The speaker's FINAL line (TranscriptSegmentReceived) clears it. Live text is a preview the
 *     final line replaces, never a second copy of it.
 *   - A line nobody has updated for LIVE_LINE_MAX_AGE_MS is dropped: a turn the pipeline filtered
 *     out (noise, a foreign script) produces no final line, and its preview must not hang there.
 *
 * Pure, so the node test runner can hold it; the store and the views only call it.
 */

export type LiveLine = {
  speakerId: string;
  speakerName: string;
  itemId: string;
  text: string;
  language: string;
  /** Client clock, ms. Only ever compared with this client's own clock. */
  receivedAt: number;
};

export type LiveLines = Readonly<Record<string, LiveLine>>;

export const LIVE_LINE_MAX_AGE_MS = 6000;

export function upsertLiveLine(
  lines: LiveLines,
  incoming: Omit<LiveLine, "receivedAt">,
  now: number,
): LiveLines {
  const text = incoming.text.trim();
  if (!incoming.speakerId || !text) return lines;
  const current = lines[incoming.speakerId];
  if (current && current.itemId === incoming.itemId && current.text === text) return lines;
  return { ...lines, [incoming.speakerId]: { ...incoming, text, receivedAt: now } };
}

/** The speaker's final line arrived: their preview is done. */
export function clearLiveLine(lines: LiveLines, speakerId: string): LiveLines {
  if (!(speakerId in lines)) return lines;
  const next = { ...lines };
  delete next[speakerId];
  return next;
}

/** Drops this speaker's line only if it is still the one that was scheduled to expire. */
export function expireLiveLine(lines: LiveLines, speakerId: string, receivedAt: number): LiveLines {
  return lines[speakerId]?.receivedAt === receivedAt ? clearLiveLine(lines, speakerId) : lines;
}

/**
 * The lines to show, oldest first. No clock here on purpose: views call this during render, where
 * reading the time is impure. Staleness is enforced where time is allowed — the session schedules
 * expireLiveLine LIVE_LINE_MAX_AGE_MS after every update.
 */
export function orderedLiveLines(lines: LiveLines): LiveLine[] {
  return Object.values(lines).sort((a, b) => a.receivedAt - b.receivedAt);
}
