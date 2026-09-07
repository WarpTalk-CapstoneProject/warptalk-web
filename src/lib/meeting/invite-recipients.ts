/**
 * WT-552: who a host is about to invite into a meeting that is already running.
 *
 * The dialog takes a free-text box because that is how the addresses arrive — pasted out of a
 * calendar entry or a chat message, comma-separated, semicolon-separated, or one per line. This
 * turns that paste into a decided list BEFORE anything is sent, so the host can see who is
 * actually going to get an email.
 *
 * Three of the four states are not errors and must not read as errors:
 *
 *   - `already-in-room` — they are on the roster. Inviting them again sends a "you're invited"
 *     email to somebody who is in the meeting, which reads as the meeting restarting.
 *   - `already-invited` — the server treats this as a no-op (a host adding one person to a group
 *     of five should not have to remember which of them were already invited). Saying so here
 *     means the host is not surprised when the count comes back lower than the list they typed.
 *   - `duplicate` — the same address twice in one paste. Counted once, silently.
 *
 * Only `invalid` is a refusal, and it names the entry rather than failing the whole paste: one
 * fat-fingered address must not throw away the other four.
 *
 * Matching is case-insensitive throughout. Addresses are stored as typed, so the same person can
 * appear as `Someone@Acme.com` on the invitation and `someone@acme.com` in the box.
 */

export type RecipientState =
  | "new"
  | "already-invited"
  | "already-in-room"
  | "duplicate"
  | "invalid";

export interface ParsedRecipient {
  /** Trimmed as typed — this is what gets sent, and what is shown back to the host. */
  email: string;
  state: RecipientState;
}

export interface RecipientContext {
  /** Addresses with an invitation row on this room, whatever its status. */
  invitedEmails?: readonly (string | null | undefined)[];
  /** Addresses of people already on the roster. */
  participantEmails?: readonly (string | null | undefined)[];
}

/**
 * Deliberately not RFC 5322. This is the check that stops an obvious typo and a stray word from
 * the paste ("and", a display name, a trailing "<") reaching the server as an invitation — the
 * server does its own, and the mail provider is the real authority on whether an address exists.
 */
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Commas, semicolons, and newlines are all how a pasted list arrives. */
const SEPARATORS = /[\s,;]+/;

export function parseRecipients(
  raw: string,
  context: RecipientContext = {},
): ParsedRecipient[] {
  const invited = lowercaseSet(context.invitedEmails);
  const inRoom = lowercaseSet(context.participantEmails);
  const seen = new Set<string>();

  return raw
    .split(SEPARATORS)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((email) => ({ email, state: classify(email) }));

  function classify(email: string): RecipientState {
    const key = email.toLowerCase();
    // Order matters. A malformed entry is never "already invited", and the duplicate check runs
    // before the roster checks so the second copy of an in-room address is reported once, as the
    // reason it will not be sent, rather than twice.
    if (!EMAIL.test(email)) return "invalid";
    if (seen.has(key)) return "duplicate";
    seen.add(key);
    if (inRoom.has(key)) return "already-in-room";
    if (invited.has(key)) return "already-invited";
    return "new";
  }
}

/** What actually goes on the wire. Everything else is either already handled or refused. */
export function sendableRecipients(parsed: readonly ParsedRecipient[]): string[] {
  return parsed.filter((r) => r.state === "new").map((r) => r.email);
}

/**
 * The one state that blocks the send. A paste of five where one is malformed must be fixed, not
 * silently trimmed to four — the host would never learn the fifth person was not invited.
 */
export function hasInvalid(parsed: readonly ParsedRecipient[]): boolean {
  return parsed.some((r) => r.state === "invalid");
}

export const RECIPIENT_NOTES: Record<RecipientState, string | null> = {
  new: null,
  "already-invited": "Already invited",
  "already-in-room": "Already here",
  duplicate: "Listed twice",
  invalid: "Not an email address",
};

/**
 * What the toast says after a send. The server's count is the truth — it de-duplicates against
 * rows this client may not have refetched — so the message is built from IT, not from the list
 * that was submitted.
 */
export function describeInviteResult(invited: number, requested: number): string {
  if (invited === 0) {
    return requested === 1
      ? "That person was already invited."
      : "Everyone on that list was already invited.";
  }
  const people = invited === 1 ? "person" : "people";
  if (invited < requested) {
    return `Invited ${invited} ${people}. The rest were already invited.`;
  }
  return `Invited ${invited} ${people}.`;
}

function lowercaseSet(
  values: readonly (string | null | undefined)[] | undefined,
): Set<string> {
  const set = new Set<string>();
  for (const value of values ?? []) {
    if (value) set.add(value.toLowerCase());
  }
  return set;
}
