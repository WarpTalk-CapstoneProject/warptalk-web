/**
 * WT-13: AI meeting-summary structured content.
 *
 * This is the JSON shape stored inline on a "summary_export" TranslationRoomArtifactDto's
 * `content` field, produced by warptalk-ai/ai_assistant_worker (MeetingAssistant
 * .generate_structured_summary) and passed through as-is by
 * WarpTalk.TranslationRoomService's ArtifactsFinalizer.BuildStructuredSummaryContent.
 */

import type { MeetingSummarySectionView } from "@/lib/meeting/meeting-summary";
// Relative on purpose: the node test runner resolves no path aliases, so a VALUE imported
// through "@/" makes this module — and everything that parses a summary — untestable.
import { parseSummarySections } from "../lib/meeting/meeting-summary.ts";

export interface MeetingSummaryActionItem {
  owner: string;
  task: string;
}

export interface MeetingSummarySection {
  summary: string;
  decisions: string[];
  actionItems: MeetingSummaryActionItem[];
}

export interface MeetingSummaryContent extends MeetingSummarySection {
  /** Which summary template produced this, e.g. "standup". Absent on summaries written
   *  before templates existed — those are all in the General shape by definition. */
  templateKey?: string;
  /** Every section the template produced, normalised and carrying its citations. The
   *  legacy `decisions` / `actionItems` above are kept alongside so existing consumers
   *  (roomHistory.service, older panels) do not have to change at once. */
  sections?: MeetingSummarySectionView[];
  /** True when the AI assistant had nothing to summarize (e.g. an empty transcript) or
   * generation failed — render an "insufficient data" state instead of an empty summary. */
  insufficientData?: boolean;
  /** Present only when the room has more than one target language AND nobody chose a
   * summary language: a translated {summary, decisions, actionItems} per language code,
   * alongside the top-level (primary-language) section. Choosing a language means one
   * document, so the two never appear together. */
  translations?: Record<string, MeetingSummarySection>;
  /** ISO 639-1 the summary was WRITTEN in, as recorded by the worker that wrote it.
   *
   * Absent or empty means nobody chose one and the model followed the transcript — which is
   * every summary written before the choice existed. That is deliberately not the same as
   * "we do not know what language this is": it is the honest statement that no code here can
   * say, and it is why this is never guessed at by inspecting the text. */
  summaryLanguage?: string;
}

export function parseMeetingSummaryContent(raw: string | null | undefined): MeetingSummaryContent | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sections = parseSummarySections(parsed);

    // The legacy fields are DERIVED from the normalised sections rather than read straight
    // off the JSON. An item is `{text, atMs}` now and was a bare string before; flattening
    // here means every existing consumer keeps working against one shape without knowing
    // which era the summary came from.
    const decisions = (sections.find((section) => section.key === "decisions")?.items ?? []).map(
      (item) => item.text,
    );
    const actionItems = (
      sections.find((section) => section.key === "actionItems")?.items ?? []
    ).map((item) => ({ owner: item.owner ?? "", task: item.text }));

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      decisions,
      actionItems,
      sections,
      templateKey: typeof parsed.templateKey === "string" ? parsed.templateKey : undefined,
      insufficientData: parsed.insufficientData as boolean | undefined,
      translations: parsed.translations as MeetingSummaryContent["translations"],
      summaryLanguage:
        typeof parsed.summaryLanguage === "string" && parsed.summaryLanguage.trim()
          ? parsed.summaryLanguage.trim().toLowerCase()
          : undefined,
    };
  } catch {
    return undefined;
  }
}
