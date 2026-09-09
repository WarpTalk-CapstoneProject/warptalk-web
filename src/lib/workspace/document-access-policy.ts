/**
 * What a document access policy is, and how to recognise one.
 *
 * WHY THIS IS NOT JUST `isExternalViewPolicy` ANY MORE
 *   The server has always understood three permissions — `view`, `download` and `ai_retrieval`
 *   (WorkspaceDocumentPermissions) — and DocumentAccessEvaluator implements all three, including
 *   the hierarchy between them: a DENY on `view` also refuses download and AI retrieval, and an
 *   ALLOW on either narrower permission implies view.
 *
 *   The web knew about exactly one of them. Every write path hardcoded `permission: "View"`, and
 *   this module could recognise exactly one policy shape: external + view + allow. So two of the
 *   three permissions could not be granted or revoked from any screen, and a `download` or
 *   `ai_retrieval` rule created by any other means rendered as nothing at all — the panel did not
 *   have a name for it.
 *
 *   That is the whole of "permission config của doc chưa full scope". Nothing was missing on the
 *   server.
 *
 * CASING
 *   The server's constants are lower-case and AddAccessPolicyAsync lower-cases what it is sent
 *   before validating, so `View` and `view` both persist as `view`. Everything here normalises on
 *   the way in and is canonical lower-case on the way out, so no caller has to know which spelling
 *   a given row happens to carry.
 */

/** The permissions the server recognises, in the spelling it stores them in. */
export const DOCUMENT_PERMISSIONS = ["view", "download", "ai_retrieval"] as const;

export type DocumentPermission = (typeof DOCUMENT_PERMISSIONS)[number];

/** What each permission is called on screen. */
export const DOCUMENT_PERMISSION_LABELS: Record<DocumentPermission, string> = {
  view: "View",
  download: "Download",
  ai_retrieval: "AI",
};

/**
 * The one-line explanation each permission carries in the panel.
 *
 * `ai_retrieval` is the one that needs saying out loud: a DENY here stops the assistant answering
 * from this document for ONE person while everyone else keeps their answers, which is a different
 * question from the document-level "Allow AI Assistant indexing" switch.
 */
export const DOCUMENT_PERMISSION_HINTS: Record<DocumentPermission, string> = {
  view: "Open and read this document",
  download: "Save a copy of the original file",
  ai_retrieval: "Let the assistant answer from this document",
};

export interface DocumentAccessPolicyLike {
  subjectType?: string | null;
  subjectKey?: string | null;
  permission?: string | null;
  effect?: string | null;
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * The permission this row carries, or null when it is a spelling we do not serve.
 *
 * Null rather than falling back to `view`: a row we cannot name must not render as a view rule,
 * because removing it would then not do what the chip beside it said it would.
 */
export function policyPermission(
  policy: DocumentAccessPolicyLike,
): DocumentPermission | null {
  const permission = normalize(policy.permission);
  return (DOCUMENT_PERMISSIONS as readonly string[]).includes(permission)
    ? (permission as DocumentPermission)
    : null;
}

function isEffect(policy: DocumentAccessPolicyLike, effect: "allow" | "deny"): boolean {
  return normalize(policy.effect) === effect;
}

/** A rule attached to one named user. */
export function isUserPolicy(
  policy: DocumentAccessPolicyLike,
  permission: DocumentPermission,
  effect: "allow" | "deny",
): boolean {
  return (
    normalize(policy.subjectType) === "user" &&
    policyPermission(policy) === permission &&
    isEffect(policy, effect)
  );
}

/**
 * The workspace role a document rule may name.
 *
 * ONLY "Member", and that is a product decision rather than a technical limit.
 * `DocumentAccessEvaluator` matches a Role policy against the caller's role name whoever they
 * are, so a DENY on Owner would genuinely lock every owner out of the document. It is
 * recoverable — `CanManagePoliciesAsync` answers from role and ownership and never reads
 * policies, so an owner can still delete the rule — but a control whose obvious use is to lock
 * yourself out is a control that should not exist. Owners and admins already reach every
 * document in the workspace, so a rule naming them has no use case to weigh against that.
 *
 * "Member" is the one that answers the question people actually ask: may ordinary members of
 * this workspace see this document.
 */
export const DOCUMENT_POLICY_ROLE = "Member";

/** A rule attached to a workspace ROLE rather than to one named person. */
export function isRolePolicy(
  policy: DocumentAccessPolicyLike,
  roleName: string,
  permission: DocumentPermission,
  effect: "allow" | "deny",
): boolean {
  return (
    normalize(policy.subjectType) === "role" &&
    normalize(policy.subjectKey) === normalize(roleName) &&
    policyPermission(policy) === permission &&
    isEffect(policy, effect)
  );
}

/** A rule attached to a membership type — Internal or External — rather than to a person. */
export function isMembershipPolicy(
  policy: DocumentAccessPolicyLike,
  subjectKey: string,
  permission: DocumentPermission,
  effect: "allow" | "deny",
): boolean {
  return (
    normalize(policy.subjectType) === "membershiptype" &&
    normalize(policy.subjectKey) === normalize(subjectKey) &&
    policyPermission(policy) === permission &&
    isEffect(policy, effect)
  );
}

/**
 * The rule that lets guests outside the workspace read this document.
 *
 * Still its own named function because the External switch is a product decision with its own
 * wording, not merely "a membership policy that happens to say external" — but it is one call to
 * the general matcher now, so the two can no longer disagree about what that row looks like.
 */
export function isExternalViewPolicy(policy: DocumentAccessPolicyLike): boolean {
  return isMembershipPolicy(policy, "external", "view", "allow");
}
