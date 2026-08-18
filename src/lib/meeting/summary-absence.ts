/**
 * Why the Summary tab has nothing to show — told apart, because the causes are not the same.
 *
 * WHY THIS EXISTS
 *   A meeting listed `summary export (TEXT/MARKDOWN) · Ready` under Artifacts while the Summary
 *   tab beside it said "This meeting ended without a summary artifact." Two tabs, one meeting,
 *   opposite answers — and the Summary tab was the one that was wrong.
 *
 *   The summary existed. What was missing was permission to read it: room artifacts default to
 *   HOST_ONLY, and BuildRoomTimelinePageAsync omits `content` for anyone the room's
 *   ArtifactAccessHelper refuses, while still listing the row. The client saw an artifact with no
 *   body, could not parse a summary out of it, and reported the meeting as having produced none.
 *
 *   That is the same class of defect as an artifact download answering 404 for a row that exists:
 *   "you may not see this" rendered as "this does not exist". A user reading it goes looking for a
 *   broken summary generator instead of asking the host for access.
 */

export type SummaryAbsence =
  | "generating"
  | "failed"
  | "insufficient-data"
  /** The artifact is there and readable by somebody — just not by this viewer. */
  | "withheld"
  /** No summary artifact was ever written for this meeting. */
  | "absent";

export type SummaryAbsenceInput = {
  isGenerating: boolean;
  /** "ready" | "failed" | … as the room record reports it. */
  summaryState?: string | null;
  /** True when a SUMMARY_EXPORT artifact row exists for this meeting, whatever its body. */
  hasSummaryArtifact: boolean;
  /** True when this client actually parsed a summary out of that artifact. */
  hasParsedSummary: boolean;
  /** The worker ran and said the transcript was too thin. */
  insufficientData?: boolean;
};

export function describeSummaryAbsence(input: SummaryAbsenceInput): SummaryAbsence {
  if (input.isGenerating) return "generating";
  if (input.summaryState === "failed") return "failed";

  // Before the withheld check: the worker ran, produced a row, and said the transcript was too
  // thin. That is a real answer about the meeting, not a permission problem, and it stays the
  // more specific of the two.
  if (input.insufficientData) return "insufficient-data";

  // The distinction the old code could not draw. A row exists, its body did not reach us, and the
  // reason is on the server — either the access policy withheld it or it was never written.
  // Either way, "this meeting produced no summary" is a claim we cannot support.
  if (input.hasSummaryArtifact && !input.hasParsedSummary) return "withheld";

  return "absent";
}

export function summaryAbsenceMessage(absence: SummaryAbsence): string {
  switch (absence) {
    case "generating":
      return "WarpTalk's AI assistant is analyzing the transcript. This usually takes under a minute.";
    case "failed":
      return "Summary generation did not complete for this meeting. The transcript is still available.";
    case "insufficient-data":
      return "There wasn't enough transcript content in this meeting to generate a summary.";
    case "withheld":
      // Names the likely cause and who can change it, rather than the flat denial that sent
      // people looking for a broken generator.
      return "A summary was produced for this meeting, but it is not shared with you. The meeting host controls who can read it.";
    case "absent":
      return "This meeting ended without a summary artifact.";
  }
}
