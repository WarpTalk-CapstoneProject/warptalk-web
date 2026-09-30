/**
 * What a billed service is called on screen, and which service a raw billing name belongs to.
 *
 * TWO VOCABULARIES, ONE SERVICE
 *   The server names the same work in two places, and the Usage page reads both:
 *
 *   - `credit_transactions.charge_type`, which reaches the web only inside the description the
 *     settlement function writes: `'Aggregated ' || p_charge_type`
 *     (warptalk-backend billing/database/migrations/017-add-just-entered-overage-to-settlement.sql).
 *   - `usage_records.usage_type`, which is what `/usages/workspace/{id}/breakdown` groups by
 *     (`FeatureAdoptionDto.usageType`).
 *
 *   On the live settlement path they are the SAME string: the AI billing worker passes one value as
 *   both arguments (warptalk-ai billing_worker/worker.py) — `TRANSLATION`, `AUDIO_DUBBING_STANDARD`,
 *   `AUDIO_DUBBING_VOICE_CLONE`, and before 10 Aug 2026 also `STT` and `AI_ASSISTANT`. The rate card
 *   additionally prices `AI_SUMMARY` and `VOICE_CLONE_ENROLLMENT`. The older C# paths wrote the
 *   lower-case `UsageConstants.UsageTypes` names (`voice_translation`, `text_to_speech`, …), and
 *   rows written by them are still in the history. Every one of those spellings is folded to one
 *   service key here, so a chart built from transaction descriptions and a card built from the
 *   breakdown land on the same row.
 *
 * NOTHING IS DROPPED
 *   A name this table does not know still becomes a service — keyed by its raw name, labelled with
 *   it, flagged `known: false`. A new charge type then shows up on the page as itself on the day it
 *   is first billed, rather than vanishing from a total that no longer adds up.
 *
 * SHORT LABELS ONLY
 *   The long "Real-time Translation (Speech-to-Text / STT)" forms were the Usage page's complaint:
 *   they truncated in every row they were put in. A service label here fits a card title and a
 *   chart legend.
 */

export interface UsageService {
  /** Stable grouping key. Known services use a fixed key; unknown ones `raw:<lower-cased name>`. */
  key: string;
  label: string;
  /** False when the raw name matched nothing below and the label is the raw name itself. */
  known: boolean;
}

const SERVICES = {
  translation: "Live translation",
  dubbing: "Voice dubbing",
  clone_dubbing: "Cloned-voice dubbing",
  transcription: "Transcription",
  assistant: "AI assistant",
  summary: "Meeting summary",
  voice_cloning: "Voice cloning",
  document_translation: "Document translation",
} as const;

type KnownServiceKey = keyof typeof SERVICES;

/** Every server spelling, lower-cased, to the service it bills. */
const ALIASES: Record<string, KnownServiceKey> = {
  // charge_type == usage_type on the live path (warptalk-ai billing worker, rate card seeds)
  translation: "translation",
  audio_dubbing_standard: "dubbing",
  audio_dubbing_voice_clone: "clone_dubbing",
  stt: "transcription",
  ai_assistant: "assistant",
  ai_summary: "summary",
  voice_clone_enrollment: "voice_cloning",
  // UsageConstants.UsageTypes, written by the older C# usage paths
  voice_translation: "translation",
  text_to_speech: "dubbing",
  speech_to_text: "transcription",
  chat: "assistant",
  summary: "summary",
  meeting_summary: "summary",
  voice_cloning: "voice_cloning",
  document_translation: "document_translation",
};

/**
 * Optional i18n hook, defaulted to the English constants above so callers that have not
 * migrated yet keep compiling and keep today's copy — same pattern as
 * `getPlanDescription`/`buildFeatureList` in `src/lib/utils.ts`.
 */
type UsageLabelTranslator = (key: string) => string;

/** Translation key for each canonical service, under the `usageLabels` namespace. */
const SERVICE_LABEL_KEYS: Record<KnownServiceKey, string> = {
  translation: "usageLabels.translation",
  dubbing: "usageLabels.dubbing",
  clone_dubbing: "usageLabels.cloneDubbing",
  transcription: "usageLabels.transcription",
  assistant: "usageLabels.assistant",
  summary: "usageLabels.summary",
  voice_cloning: "usageLabels.voiceCloning",
  document_translation: "usageLabels.documentTranslation",
};

/** The service a raw charge type or usage type bills. Never returns nothing. */
export function usageServiceOf(raw: string | null | undefined, t?: UsageLabelTranslator): UsageService {
  const name = (raw ?? "").trim();
  const known = ALIASES[name.toLowerCase()];
  if (known) {
    const label = t ? t(SERVICE_LABEL_KEYS[known]) : SERVICES[known];
    return { key: known, label, known: true };
  }
  if (!name) return { key: "raw:", label: t ? t("usageLabels.otherUsage") : "Other usage", known: false };
  return { key: `raw:${name.toLowerCase()}`, label: name.replace(/_/g, " "), known: false };
}

/** Short enough for a table row or a legend. Falls back to the raw name, de-underscored. */
export function usageTypeLabel(usageType: string, t?: UsageLabelTranslator): string {
  return usageServiceOf(usageType, t).label;
}

const AGGREGATED = /^Aggregated\s+(\S.*)$/;

/**
 * The charge type a settlement transaction was written with, read back out of its description.
 * Null for anything the settlement function did not write (top-ups, adjustments, legacy rows).
 */
export function chargeTypeFromDescription(description: string | null | undefined): string | null {
  const match = AGGREGATED.exec((description ?? "").trim());
  return match ? match[1].trim() : null;
}
