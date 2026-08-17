/**
 * One rule for which languages a pre-join screen offers, and which pair it starts on. WT-494.
 *
 * There are two ways into a meeting and they behaved differently, which is the whole ticket:
 *
 * - `/join?code=…` asked the user with two dropdowns — but seeded them from the HARDCODED pair
 *   vi-VN / en-US, ignoring the languages the user had saved in their settings.
 * - The setup modal (opened from the meetings list and from room detail) asked nothing at all and
 *   derived the pair silently from user settings, falling back to the room's configuration.
 *
 * So the same person joining the same meeting got different languages depending on which entry
 * point they used, and only one of the two paths let them see or correct it. Neither behaviour was
 * wrong on its own; having both was.
 *
 * The rule below is the union of what each path got right: the user's own saved languages are
 * honoured (the modal's behaviour, WT-434 — a rejoin must not reset a returning speaker), the room
 * stands in when they have none (both paths), and the result is always shown and editable (the
 * /join behaviour). Everything is then snapped into the offered set, so no path can start on a
 * language the server would refuse.
 */

// Explicit .ts extensions: this module is covered by a node --test unit test, which resolves ESM
// strictly. The same reason room-history-mapping.ts imports "../api/api-status.ts".
import {
  meetingLanguagesForRoom,
  normalizeLanguageCode,
  type SupportedLanguage,
} from "./languages.ts";
import {
  resolveRoomDefaultListenLanguage,
  type RoomLanguageDefaults,
} from "./participant-language-preference.ts";

export type PreJoinLanguageInputs = {
  /** From GET join-language-policy/{code}: what the room's WORKSPACE permits. */
  allowedTargetLanguages?: string[] | null;
  /** From the same call: what the ROOM itself declares. WT-490. */
  roomLanguages?: string[] | null;
  /** The viewer's remembered speak language, from their user settings. */
  savedSpeakLanguage?: string | null;
  /** The viewer's remembered listen language. */
  savedListenLanguage?: string | null;
  /**
   * The room, when the caller has it. `/join` holds only a code before joining, so this is
   * absent there and the offered set does the narrowing on its own.
   */
  room?: RoomLanguageDefaults | null;
};

export type PreJoinLanguages = {
  /** The options both dropdowns render, in registry order. */
  options: SupportedLanguage[];
  speakLanguage: string;
  listenLanguage: string;
};

/** Whether a value is one of the offered options, comparing bare codes to tolerate tags. */
function isOffered(value: string, options: SupportedLanguage[]): boolean {
  const code = normalizeLanguageCode(value);
  return options.some((option) => option.code === code);
}

/**
 * The locale tag for a value, because the pair travels as tags ("vi-VN") while policies and user
 * settings are stored as bare codes ("vi"). Comparing the two shapes directly is how a whitelist
 * silently matches nothing.
 */
function toOfferedLocale(
  value: string | null | undefined,
  options: SupportedLanguage[],
): string | null {
  if (!value) return null;
  const code = normalizeLanguageCode(value);
  return options.find((option) => option.code === code)?.locale ?? null;
}

/**
 * What a pre-join screen should offer and start on.
 *
 * Pure, and keyed only on its inputs, so both surfaces can call it and both can be tested without
 * a browser. The precedence for each side of the pair:
 *
 *   1. The viewer's own saved language, if it is offered here.
 *   2. The room's — its source language for SPEAK, its default target for LISTEN.
 *   3. The first offered option.
 *
 * Step 3 is what stops a screen ever presenting a language the room or workspace forbids: an
 * unoffered value at any step falls through rather than being kept. When nothing is offered at all
 * (a policy naming only non-meeting languages) the pair comes back empty and the caller's own
 * submit validation refuses, rather than this function inventing a language.
 */
export function resolvePreJoinLanguages(inputs: PreJoinLanguageInputs): PreJoinLanguages {
  const options = meetingLanguagesForRoom(inputs.allowedTargetLanguages, inputs.roomLanguages);
  const fallback = options[0]?.locale ?? "";

  // The room's own languages are candidates only while they survive the same filters. A room whose
  // source language its workspace has since stopped permitting must not seed a forbidden pick.
  const roomSpeak = inputs.room?.sourceLanguage ?? null;
  const roomListen = inputs.room ? resolveRoomDefaultListenLanguage(inputs.room) : null;

  const speakLanguage =
    toOfferedLocale(inputs.savedSpeakLanguage, options) ??
    toOfferedLocale(roomSpeak, options) ??
    fallback;

  const listenLanguage =
    toOfferedLocale(inputs.savedListenLanguage, options) ??
    toOfferedLocale(roomListen, options) ??
    fallback;

  return { options, speakLanguage, listenLanguage };
}

/**
 * Keep an already-chosen pair legal when the offered set changes.
 *
 * The offered set resolves asynchronously — the policy call lands after first paint — so a pair
 * chosen against the unfiltered set has to be re-checked once the real one arrives. A value the
 * user picked themselves is left alone as long as it is still offered; only an unoffered one moves.
 */
export function snapPairIntoOptions(
  pair: { speakLanguage: string; listenLanguage: string },
  options: SupportedLanguage[],
): { speakLanguage: string; listenLanguage: string } {
  const fallback = options[0]?.locale ?? "";
  return {
    speakLanguage: isOffered(pair.speakLanguage, options) ? pair.speakLanguage : fallback,
    listenLanguage: isOffered(pair.listenLanguage, options) ? pair.listenLanguage : fallback,
  };
}
