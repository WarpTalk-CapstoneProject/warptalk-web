/**
 * WT-551: naming the person behind a document action.
 *
 * A document stores WHO uploaded and approved it as a bare user id. Turning that into a name
 * needs the workspace member list, and there are exactly two ways it can fail:
 *
 *   - the actor left the workspace, so there is no member row to find;
 *   - the member list is paged, and the actor is past the page the caller fetched.
 *
 * Both are normal. Neither is a name.
 *
 * The side panel used to answer the first case with `?? "Uploader"`, which put the literal word
 * "Uploader" in a row labelled "Uploaded by" — read as a person's name by anyone looking at it,
 * and indistinguishable from a real member called that. The card grid answered the same question
 * with an em dash, and matched the id differently while it was at it. Two opinions about one
 * question, and the more visible one was the wrong one.
 *
 * This is that question, asked once.
 */

export interface DocumentActorMember {
  /** The account. This is what a document's `uploadedBy` / `approvedBy` actually holds. */
  userId?: string | null;
  /**
   * The MEMBERSHIP row's id — a different id, and not what a document stores.
   *
   * Matched anyway because the card grid always has, and dropping it here would be a silent
   * behaviour change on a surface nobody asked about. It cannot produce a false match: both are
   * uuids from different tables.
   */
  id?: string | null;
  fullName?: string | null;
  email?: string | null;
}

export function findDocumentActor<T extends DocumentActorMember>(
  members: readonly T[] | null | undefined,
  actorId: string | null | undefined,
): T | null {
  if (!actorId) return null;
  return (
    (members ?? []).find(
      (member) => member.userId === actorId || member.id === actorId,
    ) ?? null
  );
}

/**
 * The actor's name, or null when there is nobody to name.
 *
 * Null rather than a fallback string on purpose: the caller decides how absence LOOKS — an em
 * dash in a row, a muted "Uploader: —" beside an avatar — and cannot accidentally render a
 * placeholder as if it were the answer.
 */
export function documentActorName(
  members: readonly DocumentActorMember[] | null | undefined,
  actorId: string | null | undefined,
): string | null {
  const member = findDocumentActor(members, actorId);
  if (!member) return null;
  // Email is the fallback the card grid already uses: a member who has not set a display name
  // still has an address, and an address identifies a person where a blank does not.
  return member.fullName?.trim() || member.email?.trim() || null;
}
