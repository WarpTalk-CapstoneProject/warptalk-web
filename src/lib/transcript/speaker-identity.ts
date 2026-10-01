/**
 * Who said a transcript line — the one rule every surface uses, including for the Google Meet side
 * of a bridge room.
 *
 * THE BUG THIS EXISTS FOR
 *   In an EXTERNAL_BRIDGE room everybody on the Google Meet side arrives as ONE participant: the
 *   stand-in seat (`BRIDGE_STAND_IN_USER_ID`). The roster names that seat "External Meeting". The
 *   gateway puts the real person on the segment instead — `speakerName` is the Meet speaker read
 *   off Meet's captions when it is confident, "Google Meet participants" otherwise — and after the
 *   meeting a relabel job rewrites the saved names from Google's own transcript.
 *
 *   Two things broke on that:
 *     1. NAME. The live transcript preferred the roster's name over the segment's, so every Meet
 *        line said "External Meeting" although the server had sent "Lan" or "Minh".
 *     2. IDENTITY. Every grouping keyed the speaker by participant id, and all Meet people share
 *        one. "Lan", then "Minh", then "Lan" merged into one turn under Lan's name, one colour, one
 *        avatar, one share of the talk time.
 *
 * THE RULE
 *   For the stand-in, the PERSON is the participant id plus the name on the segment, and the name
 *   is the segment's, never the roster's. Every other speaker is unchanged: participant id first,
 *   display name when no id was recorded.
 *
 * Pure: no React, no network, so each rule is a unit test.
 */

// Relative, with the extension: this module's tests run under node's strip-types runner, which
// does not resolve "@/". bridge-far-side-language is the single home of the stand-in's id.
import { BRIDGE_STAND_IN_USER_ID } from "../meeting/bridge-far-side-language.ts";

export { BRIDGE_STAND_IN_USER_ID };

/**
 * What the gateway writes on a Meet-side line when it could not tell who spoke. A WIRE value — the
 * backend's own fallback, matched so the UI can swap in its translated label — not UI copy. The
 * label a reader sees is `meetingTranscript.speaker.googleMeetParticipants`.
 */
export const BRIDGE_FAR_SIDE_FALLBACK_NAME = "Google Meet participants";

/** The roster's name for the stand-in seat. Never a person, so never printed for a line. */
const BRIDGE_STAND_IN_SEAT_NAME = "External Meeting";

/** Any GUID, version nibble included — the stand-in's own id is version 0 and must count. */
const ANY_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SpeakerLabels = {
  /** A Meet-side line with no person on it. Defaults to the wire fallback (English). */
  farSideFallback?: string;
  /** Anyone else with no name. Defaults to "Unknown speaker". */
  unknown?: string;
};

/** The minimum a line needs to say who spoke — the saved and the live shapes both satisfy it. */
export type SpeakerIdentityLike = {
  /** Saved shape. */
  speakerParticipantId?: string | null;
  /** Live shape (and saved lines converted to it). */
  speakerId?: string | null;
  speakerName?: string | null;
};

export function isBridgeStandInSpeaker(speakerId: string | null | undefined): boolean {
  return (speakerId ?? "").trim().toLowerCase() === BRIDGE_STAND_IN_USER_ID;
}

/** The participant id a line recorded, whichever shape it is in. */
export function transcriptSpeakerId(segment: SpeakerIdentityLike): string | null {
  return segment.speakerParticipantId ?? segment.speakerId ?? null;
}

/**
 * The Meet person on a stand-in line, or null when the line names nobody.
 *
 * "Nobody" includes the gateway's own fallback, the roster's seat name and a GUID — saved lines
 * from before the gateway carried names hold the stand-in's id as their name.
 */
export function bridgeFarSideSpeakerName(speakerName: string | null | undefined): string | null {
  const name = (speakerName ?? "").trim();
  if (!name) return null;
  const folded = name.toLowerCase();
  if (folded === BRIDGE_FAR_SIDE_FALLBACK_NAME.toLowerCase()) return null;
  if (folded === BRIDGE_STAND_IN_SEAT_NAME.toLowerCase()) return null;
  if (ANY_GUID.test(name)) return null;
  return name;
}

/**
 * Who spoke, as a key for grouping, de-duplicating and colouring.
 *
 * The stand-in is one key PER MEET PERSON (`id::name`, case-folded); the unnamed Meet lines share
 * one key of their own. Everybody else keys exactly as before — participant id, else the name.
 */
export function transcriptSpeakerKey(segment: SpeakerIdentityLike): string {
  const id = transcriptSpeakerId(segment);
  if (isBridgeStandInSpeaker(id)) {
    const person = bridgeFarSideSpeakerName(segment.speakerName);
    return `${BRIDGE_STAND_IN_USER_ID}::${person ? person.toLowerCase() : ""}`;
  }
  return id ?? segment.speakerName ?? "";
}

/**
 * The name to print for a line.
 *
 * Stand-in: the segment's Meet person, or the far-side fallback label — never the seat name, never
 * a GUID. Anyone else: the recorded name, or the unknown label.
 */
export function transcriptSpeakerDisplayName(
  speakerId: string | null | undefined,
  speakerName: string | null | undefined,
  labels: SpeakerLabels = {},
): string {
  if (isBridgeStandInSpeaker(speakerId)) {
    return (
      bridgeFarSideSpeakerName(speakerName)
      ?? labels.farSideFallback
      ?? BRIDGE_FAR_SIDE_FALLBACK_NAME
    );
  }
  return speakerName?.trim() || labels.unknown || "Unknown speaker";
}

/**
 * Swap the wire fallback for the reader's translated label, and nothing else.
 *
 * For a surface that already holds a resolved name (the live store resolved it on arrival) and
 * only needs it localized. A real person's name passes through untouched.
 */
export function localizeFarSideSpeakerName(
  speakerId: string | null | undefined,
  speakerName: string,
  farSideFallback: string,
): string {
  if (!isBridgeStandInSpeaker(speakerId)) return speakerName;
  return bridgeFarSideSpeakerName(speakerName) ?? farSideFallback;
}
