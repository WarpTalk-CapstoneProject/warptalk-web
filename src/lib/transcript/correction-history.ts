/**
 * WT-311: the revision history of one transcript line.
 *
 * Every correction is an immutable row in transcript_corrections, and the corrections endpoint
 * returns them in whatever order the database found them. The reader wants the latest first —
 * that is the wording on screen, and everything under it is how it got there.
 *
 * Pure so it can be tested without a panel: the node test runner strips types but cannot parse
 * JSX, so a rule that lives inside the component that renders it cannot be tested.
 */

/** The fields the history needs; `TranscriptCorrectionDto` carries more and satisfies this. */
export type CorrectionRevision = {
  id: string;
  userId: string;
  originalText: string;
  correctedText: string;
  createdAt: string;
};

/**
 * Newest first. A tie — or a date that does not parse — falls back to the id, so two renders of
 * the same rows always agree on the order rather than leaving it to the server's scan.
 */
export function sortCorrectionsNewestFirst<T extends Pick<CorrectionRevision, "id" | "createdAt">>(
  corrections: readonly T[],
): T[] {
  return [...corrections].sort((left, right) => {
    const difference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (Number.isFinite(difference) && difference !== 0) return difference;
    return right.id.localeCompare(left.id);
  });
}

/**
 * Who made a correction, as a name.
 *
 * The row stores only a user id. The workspace member list is the one place a name for it
 * lives — the same directory the transcript takes its faces from — and the reader's own id is
 * "You", because a history that names you in the third person reads as somebody else's edit.
 */
export function correctionAuthorName(
  userId: string | null | undefined,
  currentUserId: string | null | undefined,
  directory?: Readonly<Record<string, { fullName?: string | null }>>,
): string {
  if (!userId) return "Unknown editor";
  if (currentUserId && userId === currentUserId) return "You";
  const name = directory?.[userId]?.fullName?.trim();
  return name || "Unknown editor";
}
