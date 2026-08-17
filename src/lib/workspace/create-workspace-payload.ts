/**
 * What "Create workspace" actually sends, and why a Gmail account gets a different shape.
 *
 * WHY THIS IS A MODULE AND NOT TWO LINES IN THE FORM
 *   WT-418 relaxed the rule that a public-domain account may not found a workspace. That relaxation
 *   landed in three places and was missed in two, both in the same submit handler:
 *
 *     - the guard read `getDomainFromEmail`, which returns null for a public domain BY DESIGN, so
 *       every Gmail user was turned away with "A valid business email is required" before a request
 *       was ever sent. The button had already been fixed to enable — so it enabled, and then the
 *       form refused.
 *     - the payload asked to verify the account's own domain unconditionally, which for gmail.com
 *       is the one thing the server must refuse (CannotVerifyPublicDomain).
 *
 *   Two dead ends in a row, behind a button that said yes. Putting the decision here means the next
 *   person changing this rule changes one thing, and the tests say what the shapes are.
 *
 * THE RULE, STATED ONCE
 *   Founding a workspace and claiming a domain are different permissions.
 *
 *   Anybody with a real email address may found one. Claiming a verified domain is what grants the
 *   Internal tier to everyone who later joins from that domain — so verifying gmail.com would
 *   silently make every Gmail user on the platform internal to that workspace, which is why the
 *   server refuses it and why this must not ask.
 *
 *   A personal-domain workspace is therefore a workspace with no domain claim. That is not a
 *   degraded state; it is the correct one.
 */

// Relative, with the extension, for the reason transcript-display.ts spells out: this module's
// unit tests run under the plain node test runner, which does not resolve "@/", and these are
// real values rather than erased type imports.
import { extractEmailDomain, isPublicEmailDomain } from "./email-domain.ts";

export type CreateWorkspacePayload = {
  name: string;
  logoUrl: string | null;
  /** Empty for a public-domain account: there is no domain it may claim. */
  verifiedDomains: string[];
  /**
   * Whether joiners from a verified domain are classified Internal.
   *
   * False when there is no domain to verify. Sending `true` with no domain is not merely
   * pointless — the server reads it as "verify my own domain", which for gmail.com it must refuse.
   */
  requireVerifiedDomainForInternal: boolean;
};

/**
 * Whether this account may found a workspace at all.
 *
 * Deliberately only asks for a parseable address. Everything stricter belongs to the server, and
 * a client-side rule that is stricter than the server's is how this bug survived a release: the
 * server was fixed and the form went on refusing.
 */
export function canFoundWorkspace(email?: string | null): boolean {
  return extractEmailDomain(email) !== null;
}

/**
 * The request body for this account.
 *
 * Returns null when the address cannot be parsed — the one case the form legitimately blocks,
 * and the caller shows the account error rather than sending a request that must fail.
 */
export function buildCreateWorkspacePayload(
  email: string | null | undefined,
  fields: { name: string; logoUrl?: string | null },
): CreateWorkspacePayload | null {
  const domain = extractEmailDomain(email);
  if (!domain) return null;

  // The only branch in this module. A public domain is not a lesser account — it is an account
  // with no domain to claim, and claiming is a separate permission from founding.
  const claimable = isPublicEmailDomain(domain) ? [] : [domain];

  return {
    name: fields.name.trim(),
    logoUrl: fields.logoUrl?.trim() || null,
    verifiedDomains: claimable,
    requireVerifiedDomainForInternal: claimable.length > 0,
  };
}
