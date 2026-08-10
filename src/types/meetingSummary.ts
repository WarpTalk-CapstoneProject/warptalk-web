/**
 * WT-13: AI meeting-summary structured content.
 *
 * This is the JSON shape stored inline on a "summary_export" TranslationRoomArtifactDto's
 * `content` field, produced by warptalk-ai/ai_assistant_worker (MeetingAssistant
 * .generate_structured_summary) and passed through as-is by
 * WarpTalk.TranslationRoomService's ArtifactsFinalizer.BuildStructuredSummaryContent.
 */

import type { MeetingSummarySectionView } from "@/lib/meeting/meeting-summary";
import { parseSummarySections } from "@/lib/meeting/meeting-summary";

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
  /** Present only when the room has more than one target language: a translated
   * {summary, decisions, actionItems} per language code, alongside the top-level
   * (primary-language) section. */
  translations?: Record<string, MeetingSummarySection>;
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
    };
  } catch {
    return undefined;
  }
}
