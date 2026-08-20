/**
 * Who a participant IS in a live meeting: their name, their face, and the language they picked.
 *
 * WHY THIS EXISTS
 *   The meeting had two of those three and rendered one. `GET /translation-rooms/{id}/participants`
 *   returns DisplayName, Role, Status and both languages — and no picture. The participant row
 *   lives in the translation-room database, the avatar lives on the user record in auth, and
 *   `TranslationRoomParticipantMapper.ToDto` has never joined the two. The web DTO declares
 *   `avatarUrl?: string` anyway, so anything that reached for it got `undefined` and quietly fell
 *   back to two letters — which is why every tile in the meeting was a monogram.
 *
 *   The workspace member list DOES carry the avatar (WorkspaceMemberService resolves it from auth
 *   over gRPC), and a workspace meeting's participants are workspace members. So the join is done
 *   once, here, instead of three components each doing it slightly differently.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   Invent a face for somebody who has none. An external or bridge participant holds no member row,
 *   so they resolve to initials — that is the correct answer for them, not a degraded one.
 */

// Relative, with the extension: this module's unit tests run under the plain node test
// runner, which does not resolve the "@/" alias for real values.
import { getFlagEmoji } from "../language/language-flag.ts";
import { getLanguageName, normalizeLanguageCode } from "../language/languages.ts";

export type ParticipantIdentity = {
  userId: string;
  /** What to print. Always non-empty. */
  name: string;
  /** One or two letters, for when there is no picture. Never empty — "?" at worst. */
  initials: string;
  /** Absent when this person has no avatar, which is a normal state and not an error. */
  avatarUrl?: string;
  /** The language they speak, as they last declared it. Locale tag or bare code, as stored. */
  speakLanguage?: string;
  /** The language they listen in. */
  listenLanguage?: string;
};

type ParticipantLike = {
  userId: string;
  displayName?: string | null;
  speakLanguage?: string | null;
  listenLanguage?: string | null;
};

type MemberLike = {
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

type SelfLike = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
} | null;

export function getInitials(value: string | null | undefined): string {
  const parts = (value ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return parts || "?";
}

/**
 * One lookup table for the whole meeting, keyed by userId — which is also the LiveKit identity,
 * so a video tile can resolve its own person without a second map.
 *
 * `self` wins over the member row for the CURRENT user only: a profile picture changed during the
 * meeting is live in the auth store and up to 30 seconds stale in the members query, and the one
 * face a person notices being wrong is their own.
 *
 * `selfLanguages` is the same argument for languages. A participant's own pick is local state the
 * instant they make it and only reaches `participants` on the next roster refetch, so without this
 * the flag on your own tile lags your own choice by seconds.
 */
export function buildParticipantIdentities({
  participants,
  members = [],
  self = null,
  selfLanguages,
}: {
  participants: ParticipantLike[];
  members?: MemberLike[];
  self?: SelfLike;
  selfLanguages?: { speak?: string | null; listen?: string | null };
}): Record<string, ParticipantIdentity> {
  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const identities: Record<string, ParticipantIdentity> = {};

  for (const participant of participants) {
    if (!participant.userId) continue;

    const member = memberByUserId.get(participant.userId);
    const isSelf = Boolean(self && self.id === participant.userId);

    // The meeting's own display name first: it is what the room calls this person, including a
    // guest who typed a name that matches no account.
    const name =
      participant.displayName?.trim() ||
      (isSelf ? self?.fullName?.trim() || self?.email?.trim() : "") ||
      member?.fullName?.trim() ||
      member?.email?.trim() ||
      "Participant";

    const avatarUrl =
      (isSelf ? self?.avatarUrl : null) || member?.avatarUrl || undefined;

    identities[participant.userId] = {
      userId: participant.userId,
      name,
      initials: getInitials(name),
      avatarUrl: avatarUrl ?? undefined,
      speakLanguage:
        (isSelf ? selfLanguages?.speak : null) || participant.speakLanguage || undefined,
      listenLanguage:
        (isSelf ? selfLanguages?.listen : null) || participant.listenLanguage || undefined,
    };
  }

  // Somebody can be on the LiveKit stage before their participant row has been read back — the
  // roster polls, the media does not. Seeding the local user from the auth store means your own
  // tile never shows a stranger's monogram during those first seconds.
  if (self && !identities[self.id]) {
    const name = self.fullName?.trim() || self.email?.trim() || "You";
    identities[self.id] = {
      userId: self.id,
      name,
      initials: getInitials(name),
      avatarUrl: self.avatarUrl ?? undefined,
      speakLanguage: selfLanguages?.speak ?? undefined,
      listenLanguage: selfLanguages?.listen ?? undefined,
    };
  }

  return identities;
}

/**
 * The identity for one id, or a usable stand-in built from whatever name the caller already has.
 *
 * Never returns undefined on purpose: every call site is a render that has to draw something, and
 * an interpreter bot or a participant who has not been read back yet still needs a name and two
 * letters rather than a branch at each site.
 */
export function identityFor(
  identities: Record<string, ParticipantIdentity>,
  userId: string | null | undefined,
  fallbackName?: string | null,
): ParticipantIdentity {
  const known = userId ? identities[userId] : undefined;
  if (known) return known;

  const name = fallbackName?.trim() || "Participant";
  return {
    userId: userId ?? "",
    name,
    initials: getInitials(name),
  };
}

/**
 * The language badge, as a flag and a sentence.
 *
 * One person, one language is the shape the meeting bar now writes (WT-434), so the flag shows the
 * language they SPEAK — that is what the people around them are hearing translated. The sentence
 * spells out both sides only when they actually differ, because "Speaks Vietnamese · hears
 * Vietnamese" is noise on the common case and the difference is the whole story on the rare one.
 *
 * Returns an empty flag rather than a placeholder glyph for a language with no region, so a caller
 * can decide between "no badge" and "a badge with no flag" instead of being handed mojibake.
 */
export function describeParticipantLanguage(
  speakLanguage?: string | null,
  listenLanguage?: string | null,
): { flag: string; label: string } | null {
  const speak = speakLanguage?.trim();
  const listen = listenLanguage?.trim();
  if (!speak && !listen) return null;

  const primary = speak || listen!;
  const flag = getFlagEmoji(primary);
  const speaksName = speak ? getLanguageName(speak) : null;
  const hearsName = listen ? getLanguageName(listen) : null;

  const differ =
    speak && listen && normalizeLanguageCode(speak) !== normalizeLanguageCode(listen);

  const label = differ
    ? `Speaks ${speaksName} · hears ${hearsName}`
    : speaksName
      ? `Speaks ${speaksName}`
      : `Hears ${hearsName}`;

  return { flag, label };
}
