/**
 * A colour that belongs to one person, for as long as the transcript is open.
 *
 * WHY THIS EXISTS
 *   A transcript prints every line the same way and repeats a name above each one. That is enough
 *   to answer "who said this line" and no help at all with the question people actually ask of a
 *   long meeting — "where does this person stop talking and the other one start". Somebody reading
 *   a paragraph that runs for ten lines has to re-read the name at the top of each to stay
 *   oriented, and a name is a word: it takes reading, not glancing.
 *
 *   So each speaker gets a colour, and it is used on everything that belongs to them — the dot on
 *   the timeline, the rail beside their turn, the edge of their bubble, the ring on their avatar.
 *   The eye follows a colour down a page without being asked to.
 *
 * WHY IT IS DERIVED RATHER THAN ASSIGNED
 *   Nothing stores a colour for a person, and adding one would mean a column, a migration and a
 *   picker for something nobody wants to choose. Deriving it from the speaker's id instead means
 *   the same person is the same colour in every meeting, on every device, for every reader,
 *   forever — with nothing to keep in step.
 *
 *   The cost is collisions: two speakers can land on one colour. That is why the colour is never
 *   the ONLY thing distinguishing a speaker — the name and the avatar are still there, and the
 *   colour is the fast path, not the answer.
 */

/** How many speaker colours the theme defines. Keep in step with globals.css. */
export const SPEAKER_COLOR_COUNT = 6;

/**
 * The CSS custom property holding this speaker's colour, ready for a `var()`.
 *
 * A token rather than a hex value because the two themes need genuinely different colours — what
 * reads on #ffffff is unreadable on #0f1011 — and the component that draws a dot has no business
 * knowing which theme is on.
 */
export function speakerColorToken(speakerId: string | null | undefined): string {
  return `--speaker-${speakerColorIndex(speakerId)}`;
}

/** `var(--speaker-N)`, for a style attribute or an arbitrary Tailwind value. */
export function speakerColorVar(speakerId: string | null | undefined): string {
  return `var(${speakerColorToken(speakerId)})`;
}

/**
 * 1..SPEAKER_COLOR_COUNT, stable for a given id.
 *
 * FNV-1a rather than a sum of char codes: ids here are UUIDv7, which share a long prefix within
 * one meeting and differ in their last characters. A sum spreads those almost evenly, but any
 * hash that weights position poorly can collapse a whole room onto two colours, and the failure
 * looks like the feature simply not working.
 */
export function speakerColorIndex(speakerId: string | null | undefined): number {
  const id = (speakerId ?? "").trim();
  if (!id) return 1;

  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    // FNV prime, via shifts — a plain `hash *= 16777619` overflows to a float and loses the low
    // bits that carry the difference between two ids that end a character apart.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }

  return (hash % SPEAKER_COLOR_COUNT) + 1;
}

/**
 * One or two letters for somebody with no picture.
 *
 * Duplicated deliberately from lib/meeting/participant-identity: that module is the LIVE meeting's
 * identity join and pulls in the language catalogue with it, none of which a saved transcript
 * needs. This is four lines; the import would be a dependency from the record onto the room.
 */
export function speakerInitials(name: string | null | undefined): string {
  const letters = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}

/** What a transcript knows about the person who said a line. */
export type TranscriptSpeaker = {
  /** The speaker's user id — what transcript_segments.speaker_participant_id actually holds. */
  id: string | null;
  name: string;
  /** Absent for anyone with no picture, which is the normal state and not an error. */
  avatarUrl?: string;
};

/**
 * Resolves a segment's speaker against whatever directory the page has.
 *
 * The directory is the workspace member list, because that is the only place a face lives: the
 * participants API carries no avatar at all (see lib/meeting/participant-identity for the same
 * join in the live meeting). Somebody who was in the meeting and is not a member of the workspace
 * — an external guest, a bridge — resolves to their recorded name and no picture, which is the
 * correct answer for them rather than a degraded one.
 */
export function resolveTranscriptSpeaker(
  speakerId: string | null | undefined,
  speakerName: string | null | undefined,
  directory?: Readonly<Record<string, { fullName?: string | null; avatarUrl?: string | null }>>,
): TranscriptSpeaker {
  const id = (speakerId ?? "").trim() || null;
  const entry = id ? directory?.[id] : undefined;

  // The recorded name wins over the directory's. It is what the person was called IN that meeting,
  // and a display name changed since then would silently rewrite the record of who spoke.
  const name = (speakerName ?? "").trim() || entry?.fullName?.trim() || "Unknown speaker";

  return {
    id,
    name,
    avatarUrl: entry?.avatarUrl?.trim() || undefined,
  };
}
