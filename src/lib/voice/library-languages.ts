/**
 * Which languages the voice library may be browsed in, for one workspace.
 *
 * WHY THE POLICY DECIDES, NOT THE REGISTRY ALONE
 *     The picker used to offer every `voiceCatalog`-scope language, whatever the workspace allows.
 *     A workspace that translates only into Vietnamese and English was still offered — and still
 *     FETCHED — every other language's catalogue, for voices nobody in it could ever be dubbed in,
 *     because dubbing only ever happens into an allowed target language.
 *
 * EMPTY MEANS UNRESTRICTED, and this is the line that must not be got wrong. The server disables
 *     its whitelist outright when `allowedTargetLanguages` is empty
 *     (see normalizeLanguagePolicy), so a filter that read empty as "nothing permitted" would show
 *     every workspace that never set a policy an empty picker. `isLanguageAllowedByPolicy` owns
 *     that rule; this file only composes it.
 */

// Relative on purpose: the node test runner resolves no path aliases.
import {
  isLanguageAllowedByPolicy,
  languagesInScope,
  type SupportedLanguage,
} from "../language/languages.ts";

/** The voice-library languages a workspace permits, in registry order. */
export function voiceLibraryLanguages(
  allowedTargetLanguages?: string[] | null,
): SupportedLanguage[] {
  return languagesInScope("voiceCatalog").filter((language) =>
    isLanguageAllowedByPolicy(language.code, allowedTargetLanguages),
  );
}

/**
 * The language to actually show — and therefore fetch.
 *
 * The page keeps one shared language and defaults it to Vietnamese. On a workspace that does not
 * allow Vietnamese that default would fetch a catalogue the picker does not even offer, and the
 * dropdown would display a value that is not among its own options. So a disallowed current value
 * snaps to the first permitted one BEFORE anything is fetched.
 *
 * Returns null only when the workspace permits no voice-library language at all — a policy naming
 * languages Cartesia publishes nothing in. The caller must render that as a state, not fetch.
 */
export function resolveLibraryLanguage(
  current: string,
  options: readonly SupportedLanguage[],
): string | null {
  if (options.length === 0) return null;
  const bare = current.split(/[-_]/)[0]?.toLowerCase() ?? current;
  return options.some((language) => language.code === bare) ? bare : options[0].code;
}

/**
 * The languages a new voice profile may be recorded in, for one workspace.
 *
 * Narrowed by the same policy as the library, because the sample is meant to be the person
 * speaking the way they speak in meetings, and a meeting here can only be held in an allowed
 * language (the server rejects a room whose SOURCE language is outside it too). The dialog used
 * to offer every profile language, so on a Vietnamese-and-English workspace the Create dialog
 * offered Japanese beside a library picker that did not.
 *
 * Unlike the library, an empty result falls back to every profile language instead of nothing:
 * a cloned voice is not bound to its sample's language — it dubs the person into any target — so
 * a policy naming only languages that cannot be recorded in must not make recording impossible.
 */
export function voiceProfileLanguages(
  allowedTargetLanguages?: string[] | null,
): SupportedLanguage[] {
  const all = languagesInScope("voiceProfile");
  const permitted = all.filter((language) =>
    isLanguageAllowedByPolicy(language.code, allowedTargetLanguages),
  );
  return permitted.length > 0 ? permitted : all;
}

/**
 * The profile language to show: the given locale when it is on offer, otherwise the first option.
 *
 * The dialog defaults to the library's current language, which can be one the profile list does
 * not carry (Korean is browsable but not recordable) or one the policy has since dropped. Left
 * alone, the Select would display a value that is not among its own options.
 */
export function resolveProfileLanguage(
  current: string,
  options: readonly SupportedLanguage[],
): string {
  const bare = current.split(/[-_]/)[0]?.toLowerCase() ?? current;
  return (options.find((language) => language.code === bare) ?? options[0])?.locale ?? current;
}
