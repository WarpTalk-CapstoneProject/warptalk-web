import { WORKSPACE_DOCUMENT_STATUS } from "../../constants/workspace-document.ts";
import type { WorkspaceDocumentDto } from "../../types/workspace.ts";
import type { DocumentPermission } from "../workspace/document-access-policy.ts";

/**
 * Who a document is shared with, and how to take that back.
 *
 * WHAT "PUBLIC" MEANT, AND WHY IT COULD NOT BE REVOKED
 *   `public` is not a share link — no document route in the API is anonymous or tokenised. It is
 *   the APPROVAL state: once a reviewer approves a document (or an owner/admin uploads one), every
 *   internal member of the workspace can open it by default and the assistant may index it. The
 *   side panel printed that status verbatim as a "PUBLIC" badge, and there was no transition out of
 *   it short of archive or delete — so the owner's report, "once public there is no way to revoke
 *   it", was literally true.
 *
 *   `private` is the way back: the server refuses the default audience, ignores the broad Role and
 *   External rules, and deletes the document's chunks from the assistant's index. Owners/admins,
 *   the uploader and anyone named under Allowed keep access.
 *
 * Relative imports, not `@/…`: the contract tests run under bare `node --experimental-strip-types`
 * with no bundler, so a path alias here is a module-not-found at test time.
 */

type StatusLike = Pick<WorkspaceDocumentDto, "status">;

function normalizedStatus(doc: StatusLike): string {
  return doc.status?.trim().toLowerCase() ?? "";
}

export function isPrivateDocument(doc: StatusLike): boolean {
  return normalizedStatus(doc) === WORKSPACE_DOCUMENT_STATUS.PRIVATE;
}

/** `active` is the column's DDL default and the API has always read it as published. */
export function isPublicDocument(doc: StatusLike): boolean {
  const status = normalizedStatus(doc);
  return status === WORKSPACE_DOCUMENT_STATUS.PUBLIC || status === "active";
}

/**
 * The label the side panel's badge shows. The raw status used to be printed as-is, which is how
 * `pending_approval` reached the screen with its underscore.
 */
export function documentVisibilityLabel(doc: StatusLike): string {
  const status = normalizedStatus(doc);
  if (isPublicDocument(doc)) return "Public";
  if (status === WORKSPACE_DOCUMENT_STATUS.PRIVATE) return "Private";
  if (status === WORKSPACE_DOCUMENT_STATUS.REJECTED) return "Rejected";
  if (status === WORKSPACE_DOCUMENT_STATUS.ARCHIVED) return "Archived";
  if (status.includes("pending")) return "Pending approval";
  return doc.status || "Unknown";
}

/** One sentence under the badge: who can open this document right now. */
export function documentAudienceSummary(doc: StatusLike): string {
  if (isPublicDocument(doc)) {
    return "Every internal member of this workspace can open it.";
  }
  if (isPrivateDocument(doc)) {
    return "Only owners, admins, the uploader and people named under Allowed can open it. The assistant does not answer from it.";
  }
  return "Not shared with the workspace yet.";
}

export type VisibilityAction = "make_private" | "make_public" | "submit_for_approval";

/**
 * What the Visibility control offers this person, or null for nothing.
 *
 * Mirrors the API's own rule (WorkspaceDocumentService.UnpublishDocumentAsync /
 * PublishDocumentAsync): an owner/admin or the uploader may withdraw a public document, because
 * withdrawing only ever narrows access. Sharing it again is different — an owner/admin publishes
 * directly, the uploader alone sends it back to review, exactly as their original upload went.
 */
export function visibilityActionFor(
  doc: Pick<WorkspaceDocumentDto, "status" | "uploadedBy" | "ownerId">,
  currentUserId: string | null | undefined,
  canApproveDocuments: boolean,
): VisibilityAction | null {
  const isUploader = Boolean(
    currentUserId &&
      (doc.uploadedBy === currentUserId || doc.ownerId === currentUserId),
  );
  if (!isUploader && !canApproveDocuments) return null;

  if (isPublicDocument(doc)) return "make_private";
  if (isPrivateDocument(doc)) {
    return canApproveDocuments ? "make_public" : "submit_for_approval";
  }
  return null;
}

export interface VisibilityConfirmCopy {
  title: string;
  body: string;
  confirm: string;
  /** Withdrawing access is the destructive direction and is drawn that way. */
  destructive: boolean;
  success: string;
}

export const VISIBILITY_CONFIRM_COPY: Record<VisibilityAction, VisibilityConfirmCopy> = {
  make_private: {
    title: "Make this document private?",
    body:
      "Members and external guests who are not named under Allowed lose access immediately, and the assistant stops answering from it — its indexed copy is deleted. Owners, admins, the uploader and named people keep access. You can make it public again later.",
    confirm: "Make private",
    destructive: true,
    success: "Document is now private.",
  },
  make_public: {
    title: "Make this document public?",
    body:
      "Every internal member of the workspace will be able to open it again, and any Member or External rules you set below apply again. If AI indexing is on, the document is re-indexed.",
    confirm: "Make public",
    destructive: false,
    success: "Document is public again.",
  },
  submit_for_approval: {
    title: "Share this document with the workspace again?",
    body:
      "It goes back to an owner or admin for approval, the same as a new upload. It stays private until they approve it.",
    confirm: "Submit for approval",
    destructive: false,
    success: "Submitted for approval.",
  },
};

/**
 * The hint under the External switch.
 *
 * It said "Let guests outside the workspace read this", which describes a public link. The rule
 * it writes is a MembershipType=External policy: it reaches people who are already members of
 * this workspace with the External membership type, and nobody outside the workspace can read any
 * document at all.
 */
export function externalAccessHint(doc: StatusLike, isExternalAllowed: boolean): string {
  if (isPrivateDocument(doc)) {
    return isExternalAllowed
      ? "Paused while private — applies again if the document is made public"
      : "Private documents are not shared with external members";
  }
  return "Let this workspace's external members (guests) read this";
}

/**
 * The verb each permission reads as in a sentence. The label map says "AI" for `ai_retrieval`,
 * which is right on a tab and wrong in "Every member may ai this".
 */
const PERMISSION_VERBS: Record<DocumentPermission, string> = {
  view: "view",
  download: "download",
  ai_retrieval: "get assistant answers from",
};

/**
 * The hint under the Workspace members control.
 *
 * Two things the old copy got wrong. "No member may view this, whatever else allows it" sat under
 * a PUBLIC badge, which read as a contradiction; and it overstated the rule — the policy names
 * the Member ROLE, so owners and admins are unaffected, while a person named under Allowed who
 * holds the Member role is still refused because a deny outranks an allow.
 */
export function memberAccessHint(
  doc: StatusLike,
  permission: DocumentPermission,
  value: "allow" | "deny" | null,
): string {
  const verb = PERMISSION_VERBS[permission];
  if (value === "deny") {
    return `Members with the Member role cannot ${verb} this, even if named under Allowed. Owners and admins still can.`;
  }
  if (isPrivateDocument(doc)) {
    return value === "allow"
      ? "Paused while private — only people named under Allowed have access"
      : "Private: only people named under Allowed have access";
  }
  if (value === "allow") {
    return `Every member may ${verb} this`;
  }
  return isPublicDocument(doc)
    ? `Public: every internal member may ${verb} this`
    : `Members follow the document's status for ${verb}`;
}

/**
 * Whether a broad rule's "Allowed" option does anything right now. On a private document the API
 * ignores Role and MembershipType ALLOWs, so offering to set one would be a control that lies.
 */
export function broadAllowIsInert(doc: StatusLike): boolean {
  return isPrivateDocument(doc);
}
