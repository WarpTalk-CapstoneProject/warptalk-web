/**
 * What the popup's "My language" picker offers. Pure, so the language hierarchy can be held by a
 * unit test rather than by reading a component.
 *
 * THE HIERARCHY (L1 workspace ⊇ L2 room ⊇ L3 artifact, decided 2026-09-17)
 *   - "My language" lists the ROOM's languages (L2): its source and targets — in a bridge room that
 *     includes what the far side speaks — narrowed by the workspace policy (L1). Everybody gets it.
 *   - "Another language" lists what the WORKSPACE allows (L1) and the room does not offer. Picking
 *     one is how a language enters this meeting, so it is offered only to someone who may change
 *     the room — the host or the bridge capturer (`canControlBridge`). A member picks within L2.
 *
 *   Decided here (PO asked for a decision): the native meeting offers "Another language" to every
 *   participant, but a bridge room is a shared Meet call where a member's pick would add a
 *   translation target for the whole call — that is the host's/capturer's call, like "They speak".
 *
 *   The language this user is on NOW always stays in the list, even if the policy has since
 *   dropped it or it is off the room's list: removing the selected option from its own menu leaves
 *   no way to see what is selected, nor to move off it.
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import {
  isLanguageAllowedByPolicy,
  meetingLanguageSet,
  meetingLanguagesForPolicy,
  normalizeLanguageCode,
} from "../language/languages.ts";

export type BridgeLanguageOptions = {
  /** "My language": the room's languages (L2 ∩ L1), plus the current one. */
  roomLanguages: string[];
  /** "Another language": L1 minus L2. Empty for a member. */
  otherLanguages: string[];
};

export function bridgeLanguageOptions(input: {
  sourceLanguage?: string | null;
  targetLanguages?: readonly (string | null | undefined)[] | null;
  /** The language shown as selected now (normalized or not), or "" / null. */
  current?: string | null;
  /** The workspace policy (L1). Empty or absent means unrestricted. */
  allowedTargetLanguages?: string[] | null;
  /** `canControlBridge`: host or capturer. Only they are offered languages outside the room. */
  canAddLanguages: boolean;
}): BridgeLanguageOptions {
  const current = normalizeLanguageCode(input.current ?? "");
  const room: string[] = [];
  for (const language of meetingLanguageSet(input.sourceLanguage, input.targetLanguages)) {
    const code = normalizeLanguageCode(language);
    if (!code || room.includes(code)) continue;
    if (code === current || isLanguageAllowedByPolicy(code, input.allowedTargetLanguages)) room.push(code);
  }
  if (current && !room.includes(current)) room.push(current);

  const otherLanguages = input.canAddLanguages
    ? meetingLanguagesForPolicy(input.allowedTargetLanguages ?? undefined)
        .map((language) => language.code)
        .filter((code) => !room.includes(code))
    : [];

  return { roomLanguages: room, otherLanguages };
}
