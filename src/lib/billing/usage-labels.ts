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

/** Short enough for a table row or a legend. Falls back to the raw name, de-underscored. */
export function usageTypeLabel(usageType: string): string {
  return SHORT_LABELS[usageType.toLowerCase()] ?? usageType.replace(/_/g, " ");
}

/** The long form, for a breakdown that is read like a bill. */
export function usageTypeDetailLabel(usageType: string): string {
  if (usageType === "translation" || usageType === "voice_translation")
    return "Real-time Translation (Speech-to-Text / STT)";
  if (usageType === "summary" || usageType === "meeting_summary")
    return "AI Meeting Insights (Summarization)";
  if (usageType === "chat") return "AI Workspace Co-pilot Chat";
  if (usageType === "text_to_speech") return "AI Voice Synthesis (Text-to-Speech / TTS)";
  if (usageType === "voice_cloning") return "Custom AI Voice Cloning (Voice Cloning)";
  return usageType.replace(/_/g, " ");
}
