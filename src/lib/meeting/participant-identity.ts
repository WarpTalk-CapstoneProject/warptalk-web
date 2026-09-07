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
import { getLanguageName } from "../language/languages.ts";

/**
 * One page, big enough for any workspace that fits in a meeting.
 *
 * Shared so every in-meeting caller asks for the SAME page — `useWorkspaceMembers` keys its cache
 * on (workspaceId, page, pageSize, search), so a second caller passing a different size would
 * open a second request against a gateway that rate-limits by IP, and the two copies could
 * disagree about who is in the workspace.
 */
export const MEETING_MEMBER_PAGE_SIZE = 100;

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
 * The language badge: a flag, and the name of that language. Nothing else.
 *
 * One person, one language is the shape the meeting bar now writes (WT-434), so the badge shows
 * the language they SPEAK — that is what the people around them are hearing translated, and it
 * falls back to their listen language only when nobody has told us what they speak.
 *
 * It deliberately does NOT narrate both sides. An earlier version said "Speaks Vietnamese · hears
 * English" whenever a stored profile carried a split, which put a sentence on a badge whose whole
 * job is to be read at a glance beside a face. The split is still real and still routes correctly;
 * the place to read it is the People panel, not a flag.
 *
 * Returns an empty flag rather than a placeholder glyph for a language with no region, so a caller
 * can decide between "no badge" and "a badge with no flag" instead of being handed mojibake.
 */
export function describeParticipantLanguage(
  speakLanguage?: string | null,
  listenLanguage?: string | null,
): { flag: string; label: string } | null {
  const primary = speakLanguage?.trim() || listenLanguage?.trim();
  if (!primary) return null;

  return { flag: getFlagEmoji(primary), label: getLanguageName(primary) };
}
