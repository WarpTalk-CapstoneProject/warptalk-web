/**
 * Which languages a finished meeting's summary and biên bản may be switched into.
 *
 * WT-703 made the server refuse to GENERATE a summary rendering or a minutes translation in any
 * language outside the meeting's own (its source and target languages, narrowed by the
 * workspace whitelist and the active catalog), and it tells the room page which those are:
 * `TranslationRoomDto.artifactLanguages.generatable`. The pickers never read it. They kept
 * offering every language the product can translate into, so on the demo workspace's meetings
 * (en → en, vi) five of the six non-English choices were refused with a 400 — the summary
 * picker showed the refusal, the minutes picker swallowed it — and from the reader's side the
 * other languages simply never came.
 *
 * Pure and relative-import-only so the node test runner covers it.
 */

import {
  getLanguageName,
  languagesInScope,
  normalizeLanguageCode,
} from "../language/languages.ts";

export type ArtifactLanguageOption = { code: string; label: string };

/**
 * The languages to offer, in the product's usual order.
 *
 * `generatable` is the server's list. Absent (`null`/`undefined`) means the server did not send
 * one — an older API, a meeting not finished yet, or a lookup that failed — and then every
 * product language is offered, because the server still enforces its rule on each request and
 * an empty picker would hide a choice that may well be allowed. PRESENT but empty means the
 * meeting has no language anything new can be written in, and nothing is offered.
 *
 * `keep` are codes that must stay selectable whatever the list says — the language on screen
 * right now, and languages the record already stores — because what already exists stays
 * readable (WT-703 bounds generating new content, not reading it), and a select whose current
 * value is not among its options renders blank.
 */
export function artifactLanguageOptions(
  generatable: readonly string[] | null | undefined,
  keep: readonly (string | null | undefined)[] = [],
): ArtifactLanguageOption[] {
  const product = languagesInScope("chatTarget").map((language) => ({
    code: language.code,
    label: language.name,
  }));

  if (!generatable) return product;

  const allowed = new Set(
    [...generatable, ...keep].map((code) => normalizeLanguageCode(code ?? "")).filter(Boolean),
  );

  const offered = product.filter((option) => allowed.has(option.code));
  // A meeting language the product list does not carry (the catalog can run ahead of the web)
  // is still the meeting's language, so it is offered under whatever name we can give it.
  for (const code of allowed) {
    if (!offered.some((option) => option.code === code)) {
      offered.push({ code, label: getLanguageName(code) });
    }
  }
  return offered;
}
