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
