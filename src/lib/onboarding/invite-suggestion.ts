/**
 * Whether to suggest inviting people, on this visit.
 *
 * The card used to be unconditional: every Owner and Admin saw "Invite team members" above
 * their account, forever, including the ones with a full team who had invited everybody months
 * ago. A permanent suggestion is not a suggestion — it is furniture, and furniture stops being
 * read. It also cannot be dismissed, so the only way to stop seeing it was to stop looking at
 * that corner of the sidebar.
 *
 * So it is a suggestion now: it appears sometimes, it can be sent away, and it stops appearing
 * once the workspace plainly does not need it.
 *
 * WHY THE RANDOMNESS IS SEEDED AND NOT `Math.random()`
 *   A coin flipped during render is flipped again on the next render. The card would appear and
 *   vanish as you navigated, mid-click on its own button, which reads as a bug rather than as a
 *   suggestion. The roll here is a hash of the workspace and the calendar day, so it holds still
 *   for a whole day, differs between workspaces, and differs from one day to the next — the
 *   behaviour "random" is meant to describe, without the flicker that `Math.random()` produces.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** After dismissing, do not suggest again for this long. */
export const INVITE_SNOOZE_DAYS = 14;

/**
 * At or above this many members, stop suggesting entirely.
 *
 * Not a claim that a team of eight is complete — a claim that a workspace this size does not
 * need a sidebar card to think of it, and that a suggestion which never stops is noise.
 */
export const CROWDED_MEMBER_COUNT = 8;

/**
 * How often to suggest, by how small the workspace still is. Percent chance per day.
 *
 * A workspace of one is the only certainty: an Owner alone in a workspace they just made is
 * precisely who the card is for, and rolling dice on that is withholding the one prompt that is
 * always relevant. Everything above it tapers, because each extra member is evidence the Owner
 * already knows how to invite people.
 */
const DAILY_CHANCE_BY_MEMBERS: Record<number, number> = {
  1: 100,
  2: 60,
  3: 45,
  4: 30,
  5: 20,
  6: 20,
  7: 15,
};

export interface InviteSuggestionInput {
  /** Seeds the roll, so two workspaces do not get the same answer on the same day. */
  workspaceId: string;
  /**
   * Members currently in the workspace. Pass 0 while it is still loading: a card that appears
   * and then disappears once the count arrives is worse than one that appears a moment late.
   */
  memberCount: number;
  /** When this workspace's card was last dismissed, or null if it never was. */
  dismissedAtMs: number | null;
  nowMs: number;
}

export function shouldSuggestInvite({
  workspaceId,
  memberCount,
  dismissedAtMs,
  nowMs,
}: InviteSuggestionInput): boolean {
  // Not known yet. Silence is the honest state while the count is in flight.
  if (memberCount <= 0) return false;

  if (memberCount >= CROWDED_MEMBER_COUNT) return false;

  if (dismissedAtMs != null && nowMs - dismissedAtMs < INVITE_SNOOZE_DAYS * DAY_MS) {
    return false;
  }

  const chance = DAILY_CHANCE_BY_MEMBERS[memberCount] ?? 15;
  if (chance >= 100) return true;

  const dayIndex = Math.floor(nowMs / DAY_MS);
  return hashToPercent(`${workspaceId}:${dayIndex}`) < chance;
}

/**
 * FNV-1a, folded to 0–99.
 *
 * Any stable hash would do; this one is four lines and has no dependency. What matters is that
 * the same seed always gives the same number, and that one character of difference in the seed
 * gives an unrelated one — otherwise every workspace created in the same minute would roll
 * together and the suggestion would arrive for all of them at once.
 */
function hashToPercent(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}
