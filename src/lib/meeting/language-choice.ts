/**
 * One language per person, and the escape hatch for the people who need two.
 *
 * WHY THIS EXISTS
 *   The meeting bar asked for two languages — "I speak" and "I hear" — and exposed the plumbing
 *   rather than the intent. What a participant actually knows about themselves is one fact:
 *   the language they use. A translation product should ask for that once and derive the pair.
 *
 *   It was not a cosmetic problem. In the 15 Aug test the team set every combination they could
 *   think of trying to make voice clone work, concluded it was broken, and were reading a
 *   perfectly healthy pipeline the whole time — the routes simply did not exist for the pairs
 *   they had built. Two controls that must agree are two chances to disagree.
 *
 * WHAT THE PAIR STILL MEANS UNDERNEATH
 *   Nothing here changes the mesh. A route is created for (speaker.speak → listener.hear)
 *   whenever those differ, so with one language per person a VN/EN/JP room derives its six
 *   directions on its own, and two people sharing a language correctly get no route and hear each
 *   other unprocessed.
 *
 * WHY "HEAR SOMETHING ELSE" SURVIVES
 *   Speaking one language and preferring to hear another is real — somebody who speaks Vietnamese
 *   but follows English better, or drops a few English words into a Vietnamese sentence. The
 *   backend supports it today and deleting it would remove a working capability to simplify a
 *   menu. It moves behind a disclosure instead: invisible until asked for, intact when asked for.
 */

// Relative, with the extension, for the same reason transcript-display.ts spells it out: this
// module's unit tests run under the plain node test runner, which does not resolve "@/", and
// this is a real value rather than an erased type import.
import { normalizeLanguageCode } from "../language/languages.ts";

export type LanguageChoice = {
  /** The language this participant speaks and, unless they said otherwise, hears. */
  speak: string;
  /** What they hear. Equal to `speak` unless they opened the disclosure and chose differently. */
  hear: string;
};

/**
 * Whether the two languages are the same choice seen twice.
 *
 * An unset side counts as matching: somebody mid-way through choosing has not asked for a split,
 * and showing them the two-column form because one dropdown has not resolved yet is how the old
 * bar taught people that this was a two-part decision.
 */
export function isSingleLanguageChoice(
  speak?: string | null,
  hear?: string | null,
): boolean {
  const normalizedSpeak = normalizeLanguageCode(speak ?? "");
  const normalizedHear = normalizeLanguageCode(hear ?? "");
  if (!normalizedSpeak || !normalizedHear) return true;
  return normalizedSpeak === normalizedHear;
}

/**
 * The pair a single pick produces: both sides move together.
 *
 * This is the whole behavioural change. Picking "Vietnamese" has to write BOTH columns, because
 * the mesh reads them independently and a half-applied choice is the split-brain state this is
 * meant to remove.
 */
export function applySingleLanguageChoice(language: string): LanguageChoice {
  const normalized = normalizeLanguageCode(language);
  return { speak: normalized, hear: normalized };
}

/**
 * What the control says on its face.
 *
 * `mode` drives the arrow: a matched pair is one word, a deliberate split keeps the "en → vi"
 * form because hiding a divergence the user asked for would make the control lie about the state
 * it is in.
 */
export function describeLanguageChoice(
  speak?: string | null,
  hear?: string | null,
): { mode: "unset" | "single" | "split"; speak: string; hear: string } {
  const normalizedSpeak = normalizeLanguageCode(speak ?? "");
  const normalizedHear = normalizeLanguageCode(hear ?? "");

  if (!normalizedSpeak && !normalizedHear) {
    return { mode: "unset", speak: "", hear: "" };
  }
  if (isSingleLanguageChoice(normalizedSpeak, normalizedHear)) {
    // Whichever side resolved first stands in for both while the other catches up.
    const settled = normalizedSpeak || normalizedHear;
    return { mode: "single", speak: settled, hear: settled };
  }
  return { mode: "split", speak: normalizedSpeak, hear: normalizedHear };
}
