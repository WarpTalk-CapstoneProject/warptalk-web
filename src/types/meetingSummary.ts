/**
 * WT-13: AI meeting-summary structured content.
 *
 * This is the JSON shape stored inline on a "summary_export" TranslationRoomArtifactDto's
 * `content` field, produced by warptalk-ai/ai_assistant_worker (MeetingAssistant
 * .generate_structured_summary) and passed through as-is by
 * WarpTalk.TranslationRoomService's ArtifactsFinalizer.BuildStructuredSummaryContent.
 */

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
    const parsed = JSON.parse(raw) as Partial<MeetingSummaryContent>;
    return {
      summary: parsed.summary ?? "",
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      insufficientData: parsed.insufficientData,
      translations: parsed.translations,
    };
  } catch {
    return undefined;
  }
}
