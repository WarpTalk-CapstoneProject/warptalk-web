/**
 * The summary in the reading rail, turned into the model a Word file is written from.
 *
 * The same argument as the transcript's: the rail is not showing "the summary", it is showing ONE
 * rendering of it — a template, a language, and the overview rule that hides the flat paragraph
 * when the traceable narrative already is that paragraph. Downloading the server's
 * `summary_export` artifact instead hands over a different document from the one on screen, which
 * is the bug this replaces: a reader who had switched to Japanese, or to the Standup shape, got
 * the host's English General summary in the file.
 *
 * Pure, and with no "@/" value imports, so the shape can be tested without a meeting.
 */

import { formatCitationTime } from "../meeting/meeting-summary.ts";
import type {
  RecordDocumentMeta,
  SummaryDocumentItem,
  SummaryDocumentModel,
  SummaryDocumentSection,
} from "./record-documents.ts";

/** The traceable template's prose section — the one that stands in for the overview. */
const NARRATIVE_SECTION_KEY = "narrative";

/** What this module needs from a summary item: the rail's own shape, structurally. */
export type SummaryModelItem = {
  text: string;
  owner?: string;
  /** Milliseconds from the start of the meeting, or null for a summary written before citations. */
  atMs: number | null;
  /** The other moments the point rests on. */
  alsoAtMs: readonly number[];
};

export type SummaryModelSection = {
  key: string;
  title: string;
  items: readonly SummaryModelItem[];
};

export type SummaryModelContent = {
  /** The overview paragraph, which gives way to a narrative section when there is one. */
  summary?: string | null;
  sections?: readonly SummaryModelSection[];
  insufficientData?: boolean;
};

export function buildSummaryDocumentModel({
  meta,
  summary,
  templateLabel,
  isPersonalRendering,
  insufficientDataMessage,
}: {
  meta: RecordDocumentMeta;
  /** The summary AS SHOWN — the reader's rendering when they have one, the published one otherwise. */
  summary: SummaryModelContent | null | undefined;
  /** The shape's label as the picker writes it ("Standup"). */
  templateLabel?: string | null;
  /**
   * True when the reader is looking at their own (shape, language) rather than the one the host
   * published — `rendering && !rendering.isCanonical` at the call site. The document says so under
   * its title, because a rendering reads identically to the published summary and a file that does
   * not admit which one it is will be forwarded as the record of the meeting.
   */
  isPersonalRendering?: boolean;
  /** The sentence the rail shows in place of a summary, when there is none. */
  insufficientDataMessage?: string | null;
}): SummaryDocumentModel {
  const sections: readonly SummaryModelSection[] = summary?.sections ?? [];
  // The same substitution the rail and Copy make: a summary whose narrative IS the overview would
  // otherwise print its opening paragraph twice, once unverifiable and once with its moments.
  const hasNarrative = sections.some((section) => section.key === NARRATIVE_SECTION_KEY);
  const overview = hasNarrative ? null : (summary?.summary?.trim() || null);

  return {
    meta,
    templateLabel: templateLabel ?? null,
    overview,
    sections: sections.map(toDocumentSection),
    insufficientDataMessage: summary?.insufficientData ? (insufficientDataMessage ?? null) : null,
    isPersonalRendering: Boolean(isPersonalRendering),
  };
}

function toDocumentSection(section: SummaryModelSection): SummaryDocumentSection {
  return {
    key: section.key,
    title: section.title,
    items: section.items.map(toDocumentItem),
  };
}

function toDocumentItem(item: SummaryModelItem): SummaryDocumentItem {
  return {
    text: item.text,
    owner: item.owner ?? null,
    citations: citationsFor(item),
  };
}

/**
 * The moments a point rests on, formatted the way the rail prints them — PRIMARY FIRST.
 *
 * `atMs` is the moment a click jumps to, not necessarily the earliest one, and sorting these
 * would quietly promote a supporting turn to the head of the list. A point with no moment gets an
 * empty list rather than a placeholder: "no moment recorded" is the rail's wording for a reader
 * looking at a control, and a document says it by having nothing to cite.
 */
function citationsFor(item: SummaryModelItem): string[] {
  const moments = item.atMs === null ? [...item.alsoAtMs] : [item.atMs, ...item.alsoAtMs];
  const seen = new Set<number>();
  const citations: string[] = [];
  for (const moment of moments) {
    if (typeof moment !== "number" || Number.isNaN(moment) || seen.has(moment)) continue;
    seen.add(moment);
    citations.push(formatCitationTime(moment));
  }
  return citations;
}
