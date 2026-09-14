/**
 * What to do when the desktop app sees a Google Meet call that no WarpTalk room accounts for.
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
 *   defaults are taken from what the user already told us (their settings, then their browser
 *   locale) and narrowed to the workspace's list before the request is sent. The dock can change it.
 *
 * Pure, so every rule above is testable without a desktop build.
 */

import { extractMeetCodeFromUrl } from "./bridge-trigger.ts";
import { isExternalBridge, EXTERNAL_BRIDGE_TYPE } from "./meeting-types.ts";
import { suggestLanguageProfile, normalizeLanguage } from "../language/language-profile.ts";

export interface BridgeAutoRoomCandidate {
  id: string;
  translationRoomType?: string | null;
  externalMeetingUrl?: string | null;
  /** Whether the room can still be joined; a finished room is not reused. */
  joinable: boolean;
}

export interface BridgeAutoRoomInput {
  /** The room code the desktop sensor read off the browser's address bar. */
  meetCode?: string | null;
  /** The workspace's rooms the shell already has. */
  rooms: readonly BridgeAutoRoomCandidate[];
  /** This member's flag in the active workspace; null means not known, which is not a refusal. */
  canCreateMeetings: boolean | null;
  /** The workspace's allowed languages. Empty means unrestricted. */
  allowedLanguages: readonly string[];
  settingsSpeak?: string | null;
  settingsListen?: string | null;
  locales?: readonly string[];
}

export interface BridgeAutoRoomRequest {
  title: string;
  translationRoomType: typeof EXTERNAL_BRIDGE_TYPE;
  sourceLanguage: string;
  targetLanguages: string[];
  externalProvider: "GOOGLE_MEET";
  externalMeetingUrl: string;
}

export type BridgeAutoRoomPlan =
  | { kind: "wait" }
  | { kind: "reuse"; roomId: string }
  | { kind: "create"; request: BridgeAutoRoomRequest }
  | { kind: "refuse"; reason: string };

const MEET_CODE = /^[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}$/;

export const NO_CREATE_PERMISSION_REASON =
  "You do not have permission to create meetings in this workspace. Ask a workspace admin to turn it on.";

export function planBridgeAutoRoom(input: BridgeAutoRoomInput): BridgeAutoRoomPlan {
  const meetCode = input.meetCode?.trim().toLowerCase();
  if (!meetCode || !MEET_CODE.test(meetCode)) return { kind: "wait" };

  // A room the user already has for this exact call wins over making another one - including one
  // created a minute ago by this very function and not yet back from the list refetch.
  const existing = input.rooms.find(
    (room) =>
      room.joinable &&
      isExternalBridge(room.translationRoomType) &&
      extractMeetCodeFromUrl(room.externalMeetingUrl) === meetCode,
  );
  if (existing) return { kind: "reuse", roomId: existing.id };

  // Known to be off: say so rather than send a request the server is certain to refuse.
  if (input.canCreateMeetings === false) return { kind: "refuse", reason: NO_CREATE_PERMISSION_REASON };

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
  const listen = isAllowed(profile.listen) ? profile.listen : speak;

  return {
    kind: "create",
    request: {
      title: "Google Meet call",
      translationRoomType: EXTERNAL_BRIDGE_TYPE,
      sourceLanguage: speak,
      // The create dialog's shape: the source is one of the targets.
      targetLanguages: Array.from(new Set([speak, listen])),
      externalProvider: "GOOGLE_MEET",
      externalMeetingUrl: `https://meet.google.com/${meetCode}`,
    },
  };
}
