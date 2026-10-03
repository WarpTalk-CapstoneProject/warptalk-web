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
 * A POLICY THAT IS NOT KNOWN IS NOT AN UNRESTRICTED POLICY (WT-910)
 *   The workspace policy arrives as a list where null/empty means "unrestricted". The read that
 *   brings it can also simply not have answered: still loading, no room code to ask with yet, or
 *   failed. Those used to reach this helper as the same `undefined`, so the popup's first screen
 *   listed EVERY meeting language under "Another language" until (or unless) the policy arrived —
 *   and a host could pick one the workspace forbids. So the caller now says which it is
 *   (`policyStatus`), and only a policy that was actually loaded may unlock anything beyond the
 *   room: while it is not known, the room's own languages (L2) plus the current one are offered and
 *   nothing else. The room's list is NOT narrowed in that state — there is no policy to narrow it
 *   by, and those languages are already in the meeting.
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import {
  isLanguageAllowedByPolicy,
  meetingLanguageSet,
  meetingLanguagesForPolicy,
  normalizeLanguageCode,
} from "../language/languages.ts";

/**
 * Whether the workspace policy has been read. "known": loaded (its list may still be null/empty,
 * which then really means unrestricted). "loading": no answer yet, including no room code to ask
 * with. "error": the read failed.
 */
export type BridgeLanguagePolicyStatus = "known" | "loading" | "error";

/**
 * The policy status from what a query reports. Only data that belongs to THIS room counts: a
 * placeholder carried over from the previous query key is another room's policy. Data that was
 * loaded and then failed to refresh is still a loaded policy.
 */
export function bridgeLanguagePolicyStatus(query: {
  hasData: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
}): BridgeLanguagePolicyStatus {
  if (query.hasData && !query.isPlaceholderData) return "known";
  return query.isError ? "error" : "loading";
}

export type BridgeLanguageOptions = {
  /** "My language": the room's languages (L2 ∩ L1), plus the current one. */
  roomLanguages: string[];
  /** "Another language": L1 minus L2. Empty for a member, and while the policy is not known. */
  otherLanguages: string[];
  /**
   * Why "Another language" is withheld from someone who would otherwise get it: the workspace
   * policy is still loading, or could not be loaded. Null when nothing is withheld (the policy is
   * known, or this user is a member and is never offered it).
   */
  otherLanguagesWithheld: "loading" | "error" | null;
};

export function bridgeLanguageOptions(input: {
  sourceLanguage?: string | null;
  targetLanguages?: readonly (string | null | undefined)[] | null;
  /** The language shown as selected now (normalized or not), or "" / null. */
  current?: string | null;
  /** The workspace policy (L1). Empty or absent means unrestricted — only when `policyStatus` is "known". */
  allowedTargetLanguages?: string[] | null;
  /** Whether `allowedTargetLanguages` was actually loaded. Anything but "known" ignores it. */
  policyStatus: BridgeLanguagePolicyStatus;
  /** `canControlBridge`: host or capturer. Only they are offered languages outside the room. */
  canAddLanguages: boolean;
}): BridgeLanguageOptions {
  const policyKnown = input.policyStatus === "known";
  const policy = policyKnown ? input.allowedTargetLanguages : null;
  const current = normalizeLanguageCode(input.current ?? "");
  const room: string[] = [];
  for (const language of meetingLanguageSet(input.sourceLanguage, input.targetLanguages)) {
    const code = normalizeLanguageCode(language);
    if (!code || room.includes(code)) continue;
    if (code === current || isLanguageAllowedByPolicy(code, policy)) room.push(code);
  }
  if (current && !room.includes(current)) room.push(current);

  if (!input.canAddLanguages) {
    return { roomLanguages: room, otherLanguages: [], otherLanguagesWithheld: null };
  }
  if (input.policyStatus !== "known") {
    return { roomLanguages: room, otherLanguages: [], otherLanguagesWithheld: input.policyStatus };
  }

  const otherLanguages = meetingLanguagesForPolicy(policy ?? undefined)
    .map((language) => language.code)
    .filter((code) => !room.includes(code));

  return { roomLanguages: room, otherLanguages, otherLanguagesWithheld: null };
}

/**
 * What the dock's far-side language pill lists: every meeting language the workspace allows. The
 * same rule as above applies while the policy is not known — only the room's own languages, never
 * the whole hard-coded list. The current far-side language always stays, first when it had to be
 * added, for the reason given in the header.
 */
export function bridgeFarSideLanguageOptions(input: {
  sourceLanguage?: string | null;
  targetLanguages?: readonly (string | null | undefined)[] | null;
  /** What the far side is set to now, or "" / null. */
  current?: string | null;
  allowedTargetLanguages?: string[] | null;
  policyStatus: BridgeLanguagePolicyStatus;
}): string[] {
  const current = normalizeLanguageCode(input.current ?? "");
  const codes: string[] = [];
  if (input.policyStatus === "known") {
    for (const language of meetingLanguagesForPolicy(input.allowedTargetLanguages)) codes.push(language.code);
  } else {
    for (const language of meetingLanguageSet(input.sourceLanguage, input.targetLanguages)) {
      const code = normalizeLanguageCode(language);
      if (code && !codes.includes(code)) codes.push(code);
    }
  }
  if (current && !codes.includes(current)) codes.unshift(current);
  return codes;
}
