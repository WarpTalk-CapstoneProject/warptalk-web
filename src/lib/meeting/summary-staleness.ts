/**
 * Whether a meeting's summary still describes the transcript it was written from.
 *
 * WHY THIS IS DERIVED AND NOT A FLAG
 *   A `is_stale` column has to be set by every path that could invalidate a summary and cleared by
 *   every path that could refresh one. Miss either and it lies in a direction nobody notices —
 *   stuck on, it becomes furniture people learn to ignore; stuck off, it says a summary is current
 *   when it is not. Comparing two timestamps that already exist cannot drift, because there is
 *   nothing to keep in step.
 *
 * WHAT ACTUALLY HAPPENS ON A CORRECTION
 *   Correcting a segment DOES re-translate it — TranscriptCorrectionService writes the corrected
 *   text onto the segment and pushes `translate:requests` with `is_correction: true`, and the
 *   translate worker supersedes the old translation. That half has always worked. What never
 *   happened is the summary: it was written once from the text as first heard, and nothing told
 *   anybody it had stopped matching.
 *
 * NULL updatedAt IS UNKNOWN, NOT "NEVER UPDATED"
 *   Artifacts written before the column existed have no honest value. Falling back to `createdAt`
 *   is the reading that cannot invent a claim: at worst it reports a summary as stale that was in
 *   fact regenerated before the column shipped, which asks somebody to press a button they did not
 *   need to press. The opposite error hides a summary that no longer matches the record.
 */

export interface StalenessSegment {
  isCorrected?: boolean;
  updatedAt?: string | null;
}

export interface StalenessArtifact {
  createdAt?: string | null;
  updatedAt?: string | null;
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** When the summary's content last changed, falling back to when it was written. */
export function summaryWrittenAt(artifact: StalenessArtifact | null | undefined): number | null {
  if (!artifact) return null;
  return toTime(artifact.updatedAt) ?? toTime(artifact.createdAt);
}

/**
 * The newest correction, or null when nothing has been corrected.
 *
 * Only CORRECTED segments count. Every segment carries an `updatedAt` that moves for reasons that
 * have nothing to do with its text — and a summary that reported itself stale after an unrelated
 * write would be the flag-that-lies problem in a different costume.
 */
export function lastCorrectionAt(
  segments: readonly StalenessSegment[] | null | undefined,
): number | null {
  if (!segments?.length) return null;

  const times = segments
    .filter((segment) => segment.isCorrected)
    .map((segment) => toTime(segment.updatedAt))
    .filter((time): time is number => time !== null);

  return times.length ? Math.max(...times) : null;
}

/**
 * Whether the transcript has been corrected since the summary was last written.
 *
 * False whenever either side is unknown. A staleness warning is an accusation that the document on
 * screen is wrong, and making one on missing evidence trains people to dismiss it.
 */
export function isSummaryStale(
  segments: readonly StalenessSegment[] | null | undefined,
  artifact: StalenessArtifact | null | undefined,
): boolean {
  const corrected = lastCorrectionAt(segments);
  const written = summaryWrittenAt(artifact);

  if (corrected === null || written === null) return false;
  return corrected > written;
}
