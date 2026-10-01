/**
 * What to do when the desktop app sees a Google Meet call: CLAIM it (W4b part 1, WT-868).
 *
 * W4b: THE CLAIM REPLACES THE CREATE
 *   This used to create a room (`POST /translation-rooms`) unless the shell's room list already had
 *   one for the call. That gave every WarpTalk user in the same Meet call their own room, each
 *   capturing the far side. The backend now owns "one room per Meet code per workspace":
 *   `POST /translation-rooms/bridge/claim` finds or creates it, seats the caller, and says whether
 *   this desktop is the CAPTURER (publishes the far side) or a MEMBER (its own mic only) — see
 *   lib/meeting/bridge-capturer. So the client no longer decides reuse-vs-create, and no longer
 *   refuses on `canCreateMeetings`: a member may JOIN a call's room without the create permission,
 *   and when there is nothing to join the server refuses the create in its own words.
 *
 *   The language planning below is unchanged. It is the claim body: used to CREATE when nobody has,
 *   and `sourceLanguage` is also this user's own language when joining.
 *
 * THE FLOW THIS REPLACES
 *   It used to open a separate window asking "Translate this call with WarpTalk?" with a language
 *   grid, and only create the room on Accept. The owner rejected that shape: the popup should be the
 *   transcript itself, and the language is chosen in its dock like in every other bridge meeting.
 *   So the room is made as soon as the call is seen, the main window carries it, and the transcript
 *   popup opens on it. Nothing is listened to until Start in the dock, which is still where capture
 *   consent is asked.
 *
 * WHY A MEET CODE IS REQUIRED
 *   The code is what makes this idempotent. The same call is seen every three seconds, across
 *   reloads, and by a room the user already has for it; without a key to match on, each of those
 *   would create another "Google Meet call". A picture-in-picture sighting carries no code, so it
 *   waits for the normal window that does rather than guess.
 *
 * WHY THE LANGUAGES ARE RESOLVED HERE
 *   The server refuses a room whose languages the workspace does not allow (403, "... is not
 *   allowed by the workspace policy"), and an automatic create has no form to show that on. So the
 *   host's language is taken from what the user already told us (their settings, then their
 *   browser locale) and narrowed to the workspace's list before the request is sent. The dock can
 *   change it.
 *
 * AND WHY THE FAR SIDE IS NAMED EXPLICITLY
 *   The room's second seat — the "External Meeting" stand-in — needs a language that is NOT the
 *   host's, or there is nothing to translate in either direction. This used to send
 *   `targetLanguages: [speak, listen]` and let the server seed the stand-in from the first entry,
 *   which was the host's own language: every automatic room was dead on arrival. The far side is now
 *   `bridge-far-side-language.ts`'s default, sent as `externalMeetingLanguage` and listed first.
 *   The popup's "They speak" picker changes it mid-call.
 *
 * Pure, so every rule above is testable without a desktop build.
 */

import { suggestLanguageProfile, normalizeLanguage } from "../language/language-profile.ts";
import { planBridgeRoomLanguages } from "./bridge-far-side-language.ts";

export interface BridgeClaimPlanInput {
  /** The room code the desktop sensor read off the browser's address bar. */
  meetCode?: string | null;
  /** The workspace's allowed languages. Empty means unrestricted. */
  allowedLanguages: readonly string[];
  settingsSpeak?: string | null;
  settingsListen?: string | null;
  locales?: readonly string[];
}

/** The body of `POST /translation-rooms/bridge/claim`, minus the workspace (the caller adds it). */
export interface BridgeClaimBody {
  /** The bare, lower-case Meet code. The server also accepts a link; the code is what is keyed on. */
  meetCode: string;
  /** This user's language: the room's source when creating, their speak/listen when joining. */
  sourceLanguage: string;
  /** The far side's language first, so a server that predates `externalMeetingLanguage` agrees. */
  targetLanguages: string[];
  /** What the other side of the call speaks: the stand-in participant's language. */
  externalMeetingLanguage: string;
}

export type BridgeClaimPlan =
  | { kind: "wait" }
  | {
      kind: "claim";
      body: BridgeClaimBody;
      /**
       * False when the workspace allows only the host's language, so both seats share it and a
       * room created from this will translate nothing. Still claimed; the popup says why.
       */
      translatable: boolean;
    };

const MEET_CODE = /^[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}$/;

export function planBridgeClaim(input: BridgeClaimPlanInput): BridgeClaimPlan {
  const meetCode = input.meetCode?.trim().toLowerCase();
  if (!meetCode || !MEET_CODE.test(meetCode)) return { kind: "wait" };

  const allowed = input.allowedLanguages
    .map((language) => normalizeLanguage(language))
    .filter((language): language is string => Boolean(language));

  const profile = suggestLanguageProfile({
    settingsSpeak: input.settingsSpeak,
    settingsListen: input.settingsListen,
    locales: input.locales,
    available: allowed,
  });

  // `suggestLanguageProfile` ends in "en" when nothing it knows is available. A workspace narrowed
  // to languages that exclude English must not be sent English: fall back to its own first language.
  const isAllowed = (language: string) => allowed.length === 0 || allowed.includes(language);
  const speak = isAllowed(profile.speak) ? profile.speak : allowed[0];

  // Not the user's own listen setting: that says what THEY like to hear, which in a bridge room is
  // their own language (the host hears the far side translated into what they speak). It says
  // nothing about what the people in this particular call speak.
  const languages = planBridgeRoomLanguages({ speak, allowedLanguages: allowed });

  return {
    kind: "claim",
    translatable: languages.translatable,
    body: {
      meetCode,
      sourceLanguage: languages.sourceLanguage,
      targetLanguages: languages.targetLanguages,
      externalMeetingLanguage: languages.externalMeetingLanguage,
    },
  };
}
