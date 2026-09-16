/**
 * What a usage type is called on screen.
 *
 * The server sends `voice_translation`, `text_to_speech`, `ai_assistant` — names for a rate card,
 * not for a reader. Two names are needed because two surfaces ask different questions:
 *
 *   usageTypeLabel        "Live translation"                       — a dense list or a chart axis,
 *                                                                    where the row already sits
 *                                                                    next to its number
 *   usageTypeDetailLabel  "Real-time Translation (Speech-to-Text)" — the billing page, where the
 *                                                                    line has to stand alone on an
 *                                                                    invoice-like breakdown
 *
 * Both are here rather than copied into each page: the same server constant was already spelled
 * out in three separate files, so a new usage type meant three edits and typically got one.
 */

/** Server values, from `UsageConstants.UsageTypes`. */
const SHORT_LABELS: Record<string, string> = {
  translation: "Live translation",
  voice_translation: "Live translation",
  speech_to_text: "Speech to text",
  text_to_speech: "Voice synthesis",
  voice_cloning: "Voice cloning",
  summary: "Meeting summary",
  meeting_summary: "Meeting summary",
  chat: "Assistant chat",
  ai_assistant: "Assistant chat",
  document_translation: "Document translation",
};

/**
 * Optional i18n hook, defaulted to the English constants above so callers that have not
 * migrated yet keep compiling and keep today's copy — same pattern as
 * `getPlanDescription`/`buildFeatureList` in `src/lib/utils.ts`.
 */
type UsageLabelTranslator = (key: string) => string;

const SHORT_LABEL_KEYS: Record<string, string> = {
  translation: "usageLabels.translation",
  voice_translation: "usageLabels.translation",
  speech_to_text: "usageLabels.speechToText",
  text_to_speech: "usageLabels.textToSpeech",
  voice_cloning: "usageLabels.voiceCloning",
  summary: "usageLabels.summary",
  meeting_summary: "usageLabels.summary",
  chat: "usageLabels.chat",
  ai_assistant: "usageLabels.chat",
  document_translation: "usageLabels.documentTranslation",
};

/** Short enough for a table row or a legend. Falls back to the raw name, de-underscored. */
export function usageTypeLabel(usageType: string, t?: UsageLabelTranslator): string {
  const key = SHORT_LABEL_KEYS[usageType.toLowerCase()];
  if (t && key) return t(key);
  return SHORT_LABELS[usageType.toLowerCase()] ?? usageType.replace(/_/g, " ");
}

/** The long form, for a breakdown that is read like a bill. */
export function usageTypeDetailLabel(usageType: string, t?: UsageLabelTranslator): string {
  if (usageType === "translation" || usageType === "voice_translation")
    return t ? t("usageLabels.detailTranslation") : "Real-time Translation (Speech-to-Text / STT)";
  if (usageType === "summary" || usageType === "meeting_summary")
    return t ? t("usageLabels.detailSummary") : "AI Meeting Insights (Summarization)";
  if (usageType === "chat") return t ? t("usageLabels.detailChat") : "AI Workspace Co-pilot Chat";
  if (usageType === "text_to_speech")
    return t ? t("usageLabels.detailTextToSpeech") : "AI Voice Synthesis (Text-to-Speech / TTS)";
  if (usageType === "voice_cloning")
    return t ? t("usageLabels.detailVoiceCloning") : "Custom AI Voice Cloning (Voice Cloning)";
  return usageType.replace(/_/g, " ");
}
