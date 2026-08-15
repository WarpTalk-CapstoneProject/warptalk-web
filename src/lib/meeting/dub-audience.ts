/**
 * Whether anything this participant says is actually being dubbed for somebody.
 *
 * WHY THIS EXISTS
 *   A tester turned Voice Clone on, saw the row read "My voice" with the fingerprint filled,
 *   and reported: "đầu bên kia vẫn nghe giọng gốc của tôi" — the other side still hears my
 *   real voice. Both switches looked on and nothing happened.
 *
 *   Nothing was broken. Production, meeting 01a003d5, every route ever created for it:
 *
 *     src=..0002 -> tgt=..0001   en -> vi   voice_clone_enabled=true   COMPLETED
 *
 *   One route, and it points the other way. Routes are generated per (speaker, listener)
 *   pair and only where the languages differ, so a participant nobody is listening to in
 *   another language has NO outgoing route — nothing of theirs is translated, so there is no
 *   dub for a cloned voice to be used in. The setting was saved, honoured, and irrelevant.
 *
 *   The AI side already distinguishes this: base_worker's consent gate reports
 *   `no_route_for_speaker` rather than `not_opted_in` precisely so nobody concludes the user
 *   opted out. This is the same fact, told to the person it is about.
 *
 * The client can answer it without asking the server: it already holds every participant's
 * declared speak/listen languages, which is the same input the backend generates routes from.
 */

import { normalizeLanguage } from "../language/language-profile.ts";

/** The fields this needs. Deliberately structural, so both the room DTO and the live
 *  presence shape satisfy it without either being imported here. */
export interface DubAudienceParticipant {
  userId: string;
  listenLanguage?: string | null;
  status?: string | null;
}

/** Participants who have actually arrived. Somebody invited but not present is not an
 *  audience, and counting them would tell a user their voice is being dubbed for a person
 *  who is not in the room. */
const PRESENT_STATUSES = new Set(["joined", "connected"]);

/**
 * True when at least one OTHER present participant is listening in a language different from
 * `speakLanguage` — i.e. when at least one route out of this speaker can exist.
 *
 * Compared through normalizeLanguage — the same helper the language picker uses: a route is generated for "vi" vs "en", not for "vi-VN" vs "vi".
 * Treating those as different is what would make this claim an audience that does not exist.
 *
 * Returns false when `speakLanguage` is missing rather than guessing — an unknown speak
 * language cannot be said to differ from anything, and the honest answer to "is your voice
 * reaching anyone" is then "we cannot say", which this collapses to "do not promise".
 */
export function hasDubAudience(
  speakLanguage: string | null | undefined,
  myUserId: string | null | undefined,
  participants: readonly DubAudienceParticipant[] | null | undefined,
): boolean {
  const mine = normalizeLanguage(speakLanguage);
  if (!mine || !participants) return false;

  return participants.some((participant) => {
    if (!participant.userId || participant.userId === myUserId) return false;
    if (participant.status && !PRESENT_STATUSES.has(participant.status.toLowerCase())) {
      return false;
    }
    const theirs = normalizeLanguage(participant.listenLanguage);
    return Boolean(theirs) && theirs !== mine;
  });
}
