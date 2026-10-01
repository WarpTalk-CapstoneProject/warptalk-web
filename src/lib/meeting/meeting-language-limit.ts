/**
 * WT-709 — a participant chooses within the MEETING's languages; the host widens them.
 *
 * TWO LIMITS, AND WHO CAN MOVE EACH
 *   Languages narrow: the workspace's whitelist (L1) contains the meeting's declared languages
 *   (L2 — its source plus its targets). backend#512 made the translation-room hub hold every
 *   participant to L2 on JoinTranslationRoom, SetSpeakLanguage and SetListenLanguage. Before it, a
 *   participant could sit in a vi/en meeting speaking Korean as long as the WORKSPACE allowed
 *   Korean, and the in-meeting picker's "Other languages" disclosure was how they got there.
 *
 *   That disclosure now offers a language the server refuses, so it cannot stay as it was. The way
 *   out is the one the backend chose: the HOST widens the room (POST /translation-rooms/{id}/
 *   languages) and the RoomLanguagesChanged broadcast grows everybody's picker. A participant asks;
 *   the host adds; the rule holds.
 *
 * THE REFUSALS SAY DIFFERENT THINGS ON PURPOSE
 *   "Not one of this meeting's languages" is answered by asking the host, who can fix it from
 *   inside the call. "This workspace does not allow that language" is answered by a workspace
 *   Owner, and telling a guest to ask the host about that one sends them on an errand that cannot
 *   succeed. The hub keeps the two sentences apart for exactly this reason, so this keeps the two
 *   verdicts apart too.
 *
 * Extensions on the imports on purpose: this module runs under node --experimental-strip-types,
 * which does not resolve extensionless relative imports.
 */
import {
  getLanguageName,
  isLanguageAllowedByPolicy,
  languagesInScope,
  meetingLanguageSet,
  normalizeLanguageCode,
} from "../language/languages.ts";
import { isExternalBridge } from "./meeting-types.ts";

export type MeetingLanguageRoom = {
  sourceLanguage?: string | null;
  targetLanguages?: readonly (string | null | undefined)[] | null;
  translationRoomType?: string | null;
};

/**
 * The meeting's declared languages (L2) as bare codes, or null when the meeting places NO such
 * limit on who may pick what.
 *
 * Null for the same two kinds of room the server exempts (translation-room LanguagePolicy
 * .DeclaredLanguages, Gateway RoomLanguagePolicy):
 *   - an EXTERNAL_BRIDGE room — one shared room per Meet code, joined with whatever language each
 *     WarpTalk user picked in the popup; nobody declared its languages ahead of time;
 *   - a room with nothing declared — a fixture, a row that predates the fields, or a room still
 *     loading. EMPTY MEANS UNKNOWN, never "nothing allowed": reading it the other way would empty
 *     the picker for as long as the room query is in flight.
 */
export function meetingDeclaredLanguages(room?: MeetingLanguageRoom | null): string[] | null {
  if (!room || isExternalBridge(room.translationRoomType)) return null;
  const declared = meetingLanguageSet(room.sourceLanguage, room.targetLanguages).map((code) =>
    normalizeLanguageCode(code),
  );
  return declared.length > 0 ? declared : null;
}

/**
 * What the in-meeting picker offers, as bare codes.
 *
 * With a declared set: exactly that set, narrowed by the workspace policy. Nothing outside it is
 * offered — not the languages this participant "added" in an older session, not the one they are
 * on if the server would refuse it — because every one of those is a pick the hub answers with a
 * refusal. The trigger still names the language they are on, so leaving it out of the list hides
 * nothing; it only stops the menu offering a choice that cannot be held.
 *
 * The one thing kept past the policy is the current language when it IS a meeting language: a
 * workspace that narrowed its whitelist mid-series leaves the room holding a language it no longer
 * permits, and removing the selected row from its own menu would leave the participant nowhere to
 * move from (WT-497's rule, unchanged).
 *
 * Without a declared set (bridge, unknown) this is the pre-WT-709 menu: the room's languages, the
 * ones this participant added, and their current one — the server does not hold them to L2 there.
 */
export function meetingPickerLanguages({
  room,
  allowedTargetLanguages,
  current,
  added = [],
}: {
  room?: MeetingLanguageRoom | null;
  allowedTargetLanguages?: string[] | null;
  current?: string | null;
  added?: readonly string[];
}): string[] {
  const currentCode = normalizeLanguageCode(current ?? "");
  const declared = meetingDeclaredLanguages(room);

  const offered = new Set<string>();
  if (declared) {
    declared.forEach((code) => offered.add(code));
  } else {
    meetingLanguageSet(room?.sourceLanguage, room?.targetLanguages).forEach((code) =>
      offered.add(normalizeLanguageCode(code)),
    );
    added.forEach((code) => offered.add(normalizeLanguageCode(code)));
    if (currentCode) offered.add(currentCode);
  }

  return Array.from(offered).filter(
    (code) =>
      Boolean(code) &&
      (isLanguageAllowedByPolicy(code, allowedTargetLanguages) || code === currentCode),
  );
}

/**
 * The languages the room's host may add mid-meeting: every meeting language the workspace permits
 * that the meeting does not already declare.
 *
 * The server checks the same two things (and the plan's language quota, which only it knows) in
 * AddRoomLanguageAsync, so this is what to OFFER, not the enforcement. Empty when the meeting has
 * no declared set to add to — there is nothing a bridge room's host could widen.
 */
export function languagesHostCanAdd({
  room,
  allowedTargetLanguages,
}: {
  room?: MeetingLanguageRoom | null;
  allowedTargetLanguages?: string[] | null;
}): string[] {
  const declared = meetingDeclaredLanguages(room);
  if (!declared) return [];
  const already = new Set(declared);
  return languagesInScope("meeting")
    .map((language) => language.code)
    .filter(
      (code) => !already.has(code) && isLanguageAllowedByPolicy(code, allowedTargetLanguages),
    );
}

export type LanguageRefusal = "not-in-meeting" | "not-in-workspace";

function refusalText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message?: unknown };
    return typeof message === "string" ? message : "";
  }
  return "";
}

/**
 * Which limit refused a language, read from the server's own sentence — or null when the failure
 * is not a language refusal at all (a dropped socket, a timeout, a 500).
 *
 * A SignalR HubException reaches the client as a rejected invoke whose message ENDS with the hub's
 * text ("An unexpected error occurred invoking 'SetSpeakLanguage' on the server. HubException:
 * That language is not one of this meeting's languages. …"), so this matches a phrase rather than
 * the whole string. The phrases are the backend's, verbatim:
 *   - TranslationRoomHub.RoomLanguageNotInMeetingMessage and the REST join's
 *     ValidationLanguageNotAllowedByPolicy both say "not one of this meeting's languages";
 *   - the hub's L1 refusal and ValidationLanguageNotAllowedByWorkspace both say "This workspace
 *     does not allow".
 * The hub CHOSE to throw instead of returning a bool so that this sentence is what arrives; the
 * catch blocks that ignored it and printed "Could not update the language" are the silent drop
 * this exists to end.
 */
export function classifyLanguageRefusal(error: unknown): LanguageRefusal | null {
  const text = refusalText(error).toLowerCase();
  if (!text) return null;
  if (text.includes("not one of this meeting's languages")) return "not-in-meeting";
  if (text.includes("this workspace does not allow")) return "not-in-workspace";
  return null;
}

/**
 * Where a refused side goes back to: the language the hub last CONFIRMED for it, or failing that
 * the meeting's own source language — the same fallback the server gives a profile default that
 * misses the meeting's languages (JoinTranslationRoomAsync's FitDefault). Never the refused value
 * itself, and null only when neither is known, so the caller can keep what it has rather than
 * inventing a language.
 *
 * Going back is the point. The control bar shows the client's state, and a refused pick left in
 * that state is a button naming a language the server never accepted — WT-528's "the button
 * shows intent, not server truth", reached by a new road.
 */
export function languageAfterRefusal({
  refused,
  confirmed,
  room,
}: {
  refused: string;
  confirmed?: string | null;
  room?: MeetingLanguageRoom | null;
}): string | null {
  const refusedCode = normalizeLanguageCode(refused);
  const confirmedCode = normalizeLanguageCode(confirmed ?? "");
  if (confirmedCode && confirmedCode !== refusedCode) return confirmedCode;
  const sourceCode = normalizeLanguageCode(room?.sourceLanguage ?? "");
  if (sourceCode && sourceCode !== "auto" && sourceCode !== refusedCode) return sourceCode;
  return null;
}

/**
 * Which side(s) of a refused JoinTranslationRoom to move.
 *
 * The hub checks speak and then listen and refuses the PAIR with one sentence, without saying which
 * half failed, so this asks each side the question the server asked, with what the client knows.
 * When it cannot tell — no declared set to check against, or both halves pass its own check —
 * every non-blank side moves. Rejoining with the same pair is refused identically, and a join that
 * never lands leaves this person outside the room's group, receiving nothing, while each retry
 * fails quietly. A blank speak language is never one of them: the hub has nothing to judge there.
 */
export function refusedSides({
  refusal,
  speak,
  listen,
  room,
  allowedTargetLanguages,
}: {
  refusal: LanguageRefusal;
  speak?: string | null;
  listen?: string | null;
  room?: MeetingLanguageRoom | null;
  allowedTargetLanguages?: string[] | null;
}): ("speak" | "listen")[] {
  const declared = meetingDeclaredLanguages(room);
  const sides = [
    { side: "speak" as const, code: normalizeLanguageCode(speak ?? "") },
    { side: "listen" as const, code: normalizeLanguageCode(listen ?? "") },
  ].filter(({ code }) => Boolean(code));

  const failing = sides.filter(({ code }) =>
    refusal === "not-in-meeting"
      ? declared !== null && !declared.includes(code)
      : !isLanguageAllowedByPolicy(code, allowedTargetLanguages),
  );

  return (failing.length > 0 ? failing : sides).map(({ side }) => side);
}

/**
 * The sentence a refused participant reads: which language, which limit, what to do, and what
 * they are on now. Each half names an exit that can actually work for the person reading it.
 */
export function describeLanguageRefusal({
  kind,
  language,
  revertedTo,
  canAddLanguages = false,
}: {
  kind: LanguageRefusal;
  language: string;
  revertedTo?: string | null;
  /** The reader is the room's host and can add the language themselves. */
  canAddLanguages?: boolean;
}): { title: string; description: string } {
  const name = getLanguageName(language);
  const stillOn = revertedTo ? ` You're still on ${getLanguageName(revertedTo)}.` : "";

  if (kind === "not-in-workspace") {
    return {
      title: `This workspace doesn't allow ${name} in meetings`,
      description: `Only a workspace owner can change that.${stillOn}`,
    };
  }

  return {
    title: `${name} isn't one of this meeting's languages`,
    description: canAddLanguages
      ? `Add it to the meeting first, from the language menu.${stillOn}`
      : `Ask the host to add ${name} to the meeting.${stillOn}`,
  };
}
