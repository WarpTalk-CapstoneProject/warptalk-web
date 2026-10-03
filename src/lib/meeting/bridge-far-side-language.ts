/**
 * What the far side of an EXTERNAL_BRIDGE room speaks.
 *
 * THE BUG THIS EXISTS FOR
 *   A bridge room is two seats: the host, and one "External Meeting" stand-in for everyone on the
 *   other side of the Google Meet call. The audio mesh only builds a route between two seats whose
 *   languages differ, so the stand-in's language IS the translation. The server used to seed it
 *   from `targetLanguages[0]`, and both clients that create bridge rooms (the create dialog and the
 *   desktop's automatic Meet room) put the host's own language first. Every bridge room was born
 *   with both seats on one language: nothing translated, nothing dubbed, no error anywhere.
 *
 *   The fix is to SAY it: the create request carries `externalMeetingLanguage`, and the far side's
 *   language is also listed first in `targetLanguages` so a server that predates the field still
 *   seeds the right one.
 *
 * THE DEFAULT — THE NATIVE PRE-JOIN'S RULE, NOT A LANGUAGE OF OURS (WT-909)
 *   Nobody has told us what the other side speaks when a room is created automatically, and there
 *   is always ONE language picked, as on a native meeting's pre-join screen: the first option of
 *   the list the picker offers (lib/language/prejoin.ts falls back to `options[0]` the same way).
 *   That list is the workspace's allowed languages, or the meeting-language catalog when it allows
 *   everything — the very list the far-side pill shows — minus the host's own language. This used
 *   to be English, or Vietnamese for an English speaker, written here: a pair of our own, not the
 *   list's. The popup's first screen shows the pick and changes it before Start.
 *   A workspace that allows ONE language has no second language to give; the room is still
 *   created (the host may be about to ask an admin) and the popup says why nothing will be
 *   translated, rather than producing a room that is silently dead.
 *
 * Pure: no React, no network, so each rule is a unit test.
 */

import { normalizeLanguage } from "../language/language-profile.ts";
import { meetingLanguagesForPolicy } from "../language/languages.ts";

/**
 * The stand-in's user id, which is also its LiveKit identity and its key in every per-room Redis
 * hash. The backend's WarpTalk.Shared.ExternalBridgeConstants.ParticipantUserId.
 */
export const BRIDGE_STAND_IN_USER_ID = "00000000-0000-0000-0000-00000000b21d";

function normalizedList(languages: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const language of languages) {
    const code = normalizeLanguage(language);
    if (code) seen.add(code);
  }
  return Array.from(seen);
}

/**
 * The far side's default: the first offered language that differs from `speak` — the workspace's
 * allowed list in its order, or the meeting-language catalog when nothing is restricted. False
 * `translatable` only when the workspace allows nothing but the host's own language — `language`
 * is then that language.
 */
export function defaultFarSideLanguage(
  speak: string,
  allowedLanguages: readonly string[],
): { language: string; translatable: boolean } {
  const host = normalizeLanguage(speak) ?? speak;
  const allowed = normalizedList(allowedLanguages);
  const offered = allowed.length > 0 ? allowed : normalizedList(meetingLanguagesForPolicy([]).map((l) => l.code));

  const other = offered.find((language) => language !== host);
  return other ? { language: other, translatable: true } : { language: host, translatable: false };
}

export interface BridgeRoomLanguages {
  sourceLanguage: string;
  /** The far side's language first, then the host's, then anything else the room offers. */
  targetLanguages: string[];
  externalMeetingLanguage: string;
  /** False when host and far side had to share one language: the room will translate nothing. */
  translatable: boolean;
}

/**
 * The language half of a bridge room's create request.
 *
 * `candidates` are languages the creator already declared for the room (the create dialog's
 * picker). The first one that is not the host's is taken as the far side, because that is what a
 * person picking "Vietnamese, English" for a bridge room they speak Vietnamese in means. With no
 * such candidate, `defaultFarSideLanguage` decides.
 */
export function planBridgeRoomLanguages({
  speak,
  candidates = [],
  allowedLanguages,
}: {
  speak: string;
  candidates?: readonly string[];
  allowedLanguages: readonly string[];
}): BridgeRoomLanguages {
  const host = normalizeLanguage(speak) ?? speak;
  const declared = normalizedList(candidates);
  const allowed = normalizedList(allowedLanguages);
  const isAllowed = (language: string) => allowed.length === 0 || allowed.includes(language);

  const declaredOther = declared.find((language) => language !== host && isAllowed(language));
  const farSide = declaredOther
    ? { language: declaredOther, translatable: true }
    : defaultFarSideLanguage(host, allowed);

  return {
    sourceLanguage: host,
    targetLanguages: Array.from(new Set([farSide.language, host, ...declared])),
    externalMeetingLanguage: farSide.language,
    translatable: farSide.translatable,
  };
}

export type FarSideLanguageProblem = "single-language-workspace" | "same-language" | null;

/**
 * Why a bridge room will translate nothing, or null when it will. Shown in the popup next to the
 * "They speak" picker, so a dead room says so instead of staying quiet.
 *
 * Unknown languages (still loading) are not a problem yet: a warning that flashes on and off while
 * the participant read answers is noise.
 */
export function farSideLanguageProblem({
  hostLanguage,
  farSideLanguage,
  allowedLanguages,
}: {
  hostLanguage: string | null | undefined;
  farSideLanguage: string | null | undefined;
  allowedLanguages: readonly string[] | null | undefined;
}): FarSideLanguageProblem {
  const host = normalizeLanguage(hostLanguage);
  const farSide = normalizeLanguage(farSideLanguage);
  if (!host || !farSide || host !== farSide) return null;
  const allowed = normalizedList(allowedLanguages ?? []);
  return allowed.length > 0 && allowed.every((language) => language === host)
    ? "single-language-workspace"
    : "same-language";
}
