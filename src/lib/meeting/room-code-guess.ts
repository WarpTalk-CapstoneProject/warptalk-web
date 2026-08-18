/**
 * Whether a search box entry is plausibly a room code, and therefore worth offering
 * "Join meeting <code>" for above the navigation results.
 *
 * Deliberately loose. A code looks like `xjm-fgcz-gbd` today, but pinning that exact shape
 * here would mean the shortcut quietly stops appearing the day the generator changes, with
 * nothing failing to say so. The join screen is the authority on whether a code is real; this
 * only decides whether offering to try is sensible.
 *
 * What it must not do is treat a pasted URL or a search phrase as a code — that would send
 * someone into a join attempt for a string that was never a room code, and the error they'd
 * get back would be about the wrong thing.
 */
export function looksLikeRoomCode(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 4 && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(trimmed);
}

/** A room id as the API issues them: uuid v4/v7, hyphenated, case-insensitive. */
const ROOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a URL segment is a room ID rather than a room code. WT-528.
 *
 * NOT the negation of `looksLikeRoomCode` above, and it cannot be: that one is deliberately loose
 * and a uuid passes it too, so inverting it would call every room id a code.
 *
 * WHY A PAGE NEEDS TO ASK
 *     `/room/{x}` and `/rooms/{x}` forward their segment VERBATIM to `/{slug}/rooms/{x}`, and the
 *     page behind it reads the segment as an id. Server-built invitation and reminder links used
 *     to carry the CODE, so the room lookup failed and the page reported "You don't have access to
 *     this room yet" — a wrong diagnosis, since the room was fine and only the identifier was of
 *     the wrong kind. Worse, it then offered "Ask to join", which POSTs the code to an endpoint
 *     whose Guid binding rejects it with a 400 the client cannot read.
 *
 *     The links are fixed at the source, but ones already sent still carry codes, so the page has
 *     to be able to tell the two apart and say which of the two things went wrong.
 */
export function looksLikeRoomId(value: string): boolean {
  return ROOM_ID.test(value.trim());
}
