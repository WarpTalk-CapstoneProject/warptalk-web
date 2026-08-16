/**
 * WT-432 — deciding how an artifact's stored content should be read.
 *
 * A summary export is JSON; a transcript export is markdown. The two artifact viewers used to
 * treat both as opaque text, so the summary was shown to users as its own raw JSON — escapes and
 * all — while `parseMeetingSummaryContent` sat unused a directory away.
 *
 * Pure and separate from the component that renders it, matching meeting-summary.ts: the node
 * test runner strips types but cannot parse JSX, so a decision that lives inside a .tsx cannot be
 * tested. This one can, and it is the part with edge cases.
 */

import { parseMeetingSummaryContent } from "../../types/meetingSummary.ts";
import type { MeetingSummaryContent } from "@/types/meetingSummary";

/**
 * The summary behind an artifact's content, or undefined when the content is not a summary.
 *
 * `parseMeetingSummaryContent` answers "is this valid JSON", which is a weaker question: it
 * returns a fully-formed summary object for `{}`, for `[1,2,3]`, and for any other JSON an
 * artifact might one day store. Rendering those as a summary would produce a heading over
 * nothing — so a payload has to actually carry summary content to be treated as one.
 */
export function readSummaryArtifact(
  content: string | null | undefined,
): MeetingSummaryContent | undefined {
  if (!content?.trim()) return undefined;

  const summary = parseMeetingSummaryContent(content);
  if (!summary) return undefined;

  const carriesSummary =
    summary.summary.length > 0 ||
    (summary.sections?.length ?? 0) > 0 ||
    summary.insufficientData !== undefined;

  return carriesSummary ? summary : undefined;
}
