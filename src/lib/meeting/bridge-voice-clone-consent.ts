/**
 * Who the host can record a voice-clone consent for in an EXTERNAL_BRIDGE room (WT-933).
 *
 * THE DECISION (PO, 2026-10-03)
 *   The HOST records it. They ask the people in the Google Meet call, paste a notice into Meet's
 *   chat, and tick the names of the people who said yes; unticking withdraws. There is no consent
 *   link and nothing a Meet-side person opens.
 *
 * WHERE THE NAMES COME FROM
 *   Everybody on the Meet side is one participant, the stand-in seat, and the gateway puts the
 *   person on each of its transcript lines: `speakerName` is the name read off Meet's captions, or
 *   a fallback label when no caption named anybody (lib/transcript/speaker-identity). The list is
 *   the people those lines name, so it grows as people speak and is empty while captions are off.
 *
 * WHAT THIS FILE DOES NOT DO
 *   It never hashes a name. The consent field is the backend's (`fold` + SHA-256, matched to the
 *   AI worker's); the web sends the name as shown and gets the same string back. The fold below is
 *   only for telling two spellings of one person apart from two people, so one person is one row.
 *
 * Pure: no React, no network, so each rule is a unit test.
 */

import { bridgeFarSideSpeakerName, isBridgeStandInSpeaker } from "../transcript/speaker-identity.ts";

/** The status endpoint takes at most this many names; the list is cut to it. */
export const MAX_VOICE_CLONE_CONSENT_NAMES = 50;

/** The server answers 400 for a longer name, and one such name would fail the whole status call. */
export const MAX_VOICE_CLONE_CONSENT_NAME_LENGTH = 100;

/** The minimum a transcript line needs for this; the popup's live and saved lines both satisfy it. */
export type VoiceCloneConsentSegmentLike = {
  speakerId?: string | null;
  speakerName?: string | null;
};

/**
 * One person, however their name was spelled: the backend's own fold (NFKC, lower case, single
 * spaces), so two rows never stand for one consent field. Used for comparing only.
 */
function sameNameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/**
 * The Meet-side people the host can tick, in the order they first spoke.
 *
 * Stand-in lines only; names trimmed; one row per person whatever the casing; the fallback label,
 * the seat's roster name and a bare id are nobody and are left out; at most
 * MAX_VOICE_CLONE_CONSENT_NAMES. The first spelling seen is the one shown and sent.
 */
export function meetSideVoiceCloneNames(segments: readonly VoiceCloneConsentSegmentLike[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    if (names.length >= MAX_VOICE_CLONE_CONSENT_NAMES) break;
    if (!isBridgeStandInSpeaker(segment.speakerId)) continue;
    const name = bridgeFarSideSpeakerName(segment.speakerName);
    if (!name || name.length > MAX_VOICE_CLONE_CONSENT_NAME_LENGTH) continue;
    const key = sameNameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * The names the status endpoint said are consented, kept to the ones still listed. The server
 * returns names exactly as submitted, so this is a plain membership test.
 */
export function consentedAmong(names: readonly string[], consented: readonly string[] | null | undefined): string[] {
  const answered = new Set(consented ?? []);
  return names.filter((name) => answered.has(name));
}
