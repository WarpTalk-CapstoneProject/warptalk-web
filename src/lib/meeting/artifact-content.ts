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
import { parseSummarySections } from "./meeting-summary.ts";
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

/**
 * An artifact's stored content as something a person can read.
 *
 * A summary export stores JSON and a transcript export stores markdown, so one of the two has to
 * be unwrapped before it reaches a reader. Never throws and never mangles: anything that is not a
 * summary payload comes back exactly as it arrived, which is what a transcript needs.
 *
 * Lived inline in the history page, where the artifact library could not reach it — and a second
 * copy of it there would have been a second answer to "what does this summary say", which is how
 * the room page and the archive came to disagree about artifact labels before.
 */
export function readableArtifactBody(raw: string): string {
  const summary = readSummaryArtifact(raw);
  if (!summary) return raw;

  if (summary.insufficientData === true) {
    return summary.summary || "The assistant could not generate a summary for this meeting.";
  }

  const lines: string[] = [summary.summary.trim()];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return lines.join("\n");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return lines.join("\n");
  }

  for (const section of parseSummarySections(parsed as Record<string, unknown>)) {
    const items = section.items.map((item) => `• ${item.owner ? `${item.owner}: ` : ""}${item.text}`);
    if (items.length) lines.push("", section.title, ...items);
  }

  return lines.join("\n");
}
