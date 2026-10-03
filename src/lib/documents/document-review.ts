import { WORKSPACE_DOCUMENT_STATUS } from "../../constants/workspace-document.ts";
import type {
  DocumentDuplicateDto,
  WorkspaceDocumentDto,
} from "../../types/workspace.ts";

/**
 * The review flow's rules, as functions over data rather than conditions inside JSX.
 *
 * Relative imports, not `@/…`: the contract tests run under bare `node --experimental-strip-types`
 * with no bundler, so a path alias here is a module-not-found at test time.
 */

/** What the caller wants done when the file is already in the workspace. WT-666. */
export const DUPLICATE_STRATEGY = {
  /** Keep the document that is already here; upload nothing. */
  SKIP: "skip",
  /** Replace that document's file in place, keeping its id and its history. */
  REPLACE: "replace",
  /** Store a second, independent document. */
  CREATE_NEW: "create_new",
} as const;

export type DuplicateStrategy =
  (typeof DUPLICATE_STRATEGY)[keyof typeof DUPLICATE_STRATEGY];

/**
 * The API's own code for "these bytes are already here".
 *
 * Matched on the CODE, never on the error sentence: the sentence names the colliding document and
 * changes with it, so a message match would break on the first document with an unusual name.
 */
export const DUPLICATE_ERROR_CODE = "DOCUMENT_DUPLICATE_CONTENT";

/** The tabs the document library is divided into. WT-633 asks for exactly these three plus All. */
export const DOCUMENT_TAB = {
  ALL: "all",
  PUBLISHED: "published",
  PENDING: "pending",
  REJECTED: "rejected",
  /** Published once, then taken back. Its own tab, or it would appear under nothing but All. */
  PRIVATE: "private",
  ARCHIVED: "archived",
} as const;

export type DocumentTab = (typeof DOCUMENT_TAB)[keyof typeof DOCUMENT_TAB];

function normalizedStatus(doc: Pick<WorkspaceDocumentDto, "status">): string {
  return doc.status?.toLowerCase() ?? "";
}

export function isRejected(doc: Pick<WorkspaceDocumentDto, "status">): boolean {
  return normalizedStatus(doc) === WORKSPACE_DOCUMENT_STATUS.REJECTED;
}

export function isPendingApproval(
  doc: Pick<WorkspaceDocumentDto, "status">,
): boolean {
  const status = normalizedStatus(doc);
  // `includes` as well as equality, because this page has carried both spellings since before the
  // status was an enum and a listed document may still be either.
  return (
    status === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL ||
    status.includes("pending")
  );
}

export function isArchived(doc: Pick<WorkspaceDocumentDto, "status">): boolean {
  return normalizedStatus(doc) === WORKSPACE_DOCUMENT_STATUS.ARCHIVED;
}

export function isPublished(doc: Pick<WorkspaceDocumentDto, "status">): boolean {
  return normalizedStatus(doc) === WORKSPACE_DOCUMENT_STATUS.PUBLIC;
}

export function isPrivate(doc: Pick<WorkspaceDocumentDto, "status">): boolean {
  return normalizedStatus(doc) === WORKSPACE_DOCUMENT_STATUS.PRIVATE;
}

/**
 * WT-854 — a corrected version of a PUBLISHED document is waiting for a reviewer.
 *
 * The document stays published while it waits: readers keep the approved file, and the new one
 * is only promoted by an approval. So this is a second way a document can need a decision, beside
 * `pending_approval`, and it does not change `status`.
 */
export function hasPendingRevision(
  doc: Pick<WorkspaceDocumentDto, "pendingRevision">,
): boolean {
  return Boolean(doc.pendingRevision);
}

/** Does this document need a reviewer's decision — a new upload, or a correction to a published one? */
export function isAwaitingReview(
  doc: Pick<WorkspaceDocumentDto, "status" | "pendingRevision">,
): boolean {
  return isPendingApproval(doc) || (isPublished(doc) && hasPendingRevision(doc));
}

/**
 * Which documents a tab shows.
 *
 * Archived is excluded from every tab but its own — an archived document is retired, and showing
 * it under Published would make the shelf look fuller than it is. The three status tabs are
 * mutually exclusive, so a document appears under exactly one of them.
 */
export function documentMatchesTab(
  doc: Pick<WorkspaceDocumentDto, "status" | "pendingRevision">,
  tab: DocumentTab,
): boolean {
  if (tab === DOCUMENT_TAB.ARCHIVED) return isArchived(doc);
  if (isArchived(doc)) return false;

  switch (tab) {
    case DOCUMENT_TAB.PENDING:
      // WT-854 — a published document with a correction waiting is in BOTH Published (readers
      // still have it) and Pending (a reviewer still owes a decision). The one exception to the
      // status tabs being exclusive, because it is the one case where both are true.
      return isAwaitingReview(doc);
    case DOCUMENT_TAB.REJECTED:
      return isRejected(doc);
    case DOCUMENT_TAB.PUBLISHED:
      return isPublished(doc);
    case DOCUMENT_TAB.PRIVATE:
      return isPrivate(doc);
    default:
      return true;
  }
}

/**
 * May this person replace the document's file?
 *
 * The uploader, or someone who can approve documents — the same rule the API enforces. Being
 * ALLOWED TO READ a document is not being allowed to replace its contents, and a workspace-visible
 * document is readable by every internal member, so a view check here would put the button in
 * front of the whole workspace.
 *
 * Only from `rejected` or `published`. A document already awaiting review must not change under
 * the reviewer, and an archived or deleted one must not be quietly revived with new contents.
 */
export function canUploadRevision(
  doc: Pick<WorkspaceDocumentDto, "status" | "uploadedBy" | "ownerId" | "pendingRevision">,
  currentUserId: string | null | undefined,
  canApproveDocuments: boolean,
): boolean {
  if (!isRejected(doc) && !isPublished(doc)) return false;
  // WT-854 — one correction under review at a time; the API answers 409 to a second.
  if (hasPendingRevision(doc)) return false;

  const isUploader = Boolean(
    currentUserId &&
      (doc.uploadedBy === currentUserId || doc.ownerId === currentUserId),
  );
  return isUploader || canApproveDocuments;
}

/**
 * Should the rejection banner be on screen?
 *
 * `rejectionReason` alone is not enough. It survives the re-upload that returns the document to
 * `pending_approval`, on purpose, so that the feedback stays readable while the fix is being
 * reviewed — but once a reviewer publishes the document, the banner is history, not news.
 */
export function shouldShowRejectionFeedback(
  doc: Pick<WorkspaceDocumentDto, "status" | "rejectionReason">,
): boolean {
  if (!doc.rejectionReason) return false;
  return isRejected(doc) || isPendingApproval(doc);
}

/** The error shape axios hands back for a failed request. */
interface ApiErrorLike {
  response?: {
    status?: number;
    data?: {
      error?: string;
      code?: string;
      duplicate?: DocumentDuplicateDto | null;
    };
  };
}

export interface DuplicateConflict {
  message: string;
  /** Null when the caller may not open the colliding document. */
  duplicate: DocumentDuplicateDto | null;
}

/**
 * Reads a duplicate collision out of a failed upload, or null when the failure was something else.
 *
 * Returns `duplicate: null` for a real collision the caller may not see the other side of — which
 * is why the return type is an object rather than the DTO. `null` from this function means "not a
 * duplicate problem"; `{ duplicate: null }` means "a duplicate, and we cannot say which".
 */
export function parseDuplicateConflict(error: unknown): DuplicateConflict | null {
  const response = (error as ApiErrorLike)?.response;
  if (!response) return null;
  if (response.data?.code !== DUPLICATE_ERROR_CODE) return null;

  return {
    message:
      response.data?.error ?? "This file is already in this workspace.",
    duplicate: response.data?.duplicate ?? null,
  };
}

/**
 * The label the history list shows for one audit action.
 *
 * The server sends the raw action deliberately — one vocabulary, owned here, rather than a display
 * string built server-side that would have to be kept in step with this one. An action with no
 * entry falls back to its own name rather than disappearing.
 */
const HISTORY_ACTION_LABELS: Record<string, string> = {
  UploadDocument: "Uploaded",
  Reuploaded: "Revision uploaded",
  ApproveDocument: "Approved",
  RejectDocument: "Rejected",
  PatchDocumentMetadata: "Details edited",
  UpdateExtractedText: "Extracted text edited",
  AddAccessPolicy: "Access rule added",
  RemoveAccessPolicy: "Access rule removed",
  ArchiveDocument: "Archived",
  RestoreDocument: "Restored",
  UnpublishDocument: "Made private",
  PublishDocument: "Shared with the workspace again",
  DeleteDocument: "Deleted",
  SecurityScanCompleted: "Security scan completed",
  EmbeddingIndexed: "Indexed for AI",
  EmbeddingFailed: "AI indexing failed",
  EmbeddingBlocked: "AI indexing blocked",
};

export function historyActionLabel(action: string): string {
  return HISTORY_ACTION_LABELS[action] ?? action;
}

/** Actions that changed the document's approval state, for emphasis in the history list. */
export function isDecisionAction(action: string): boolean {
  return (
    action === "ApproveDocument" ||
    action === "RejectDocument" ||
    action === "Reuploaded" ||
    action === "UnpublishDocument" ||
    action === "PublishDocument"
  );
}

/**
 * Which stored file a document currently points at, as far as the API lets the browser tell.
 * WT-854, WT-857.
 *
 * Since WT-633 a document's file can be replaced IN PLACE — same id, new bytes — by "Upload a
 * corrected version". The preview cached the downloaded bytes by document id forever, so after a
 * replacement (and after the approval that follows it) the page kept rendering the first file
 * until a full reload; on desktop, which has no reload, until the app restarted. When the
 * replacement was a different format, the old bytes were handed to the new format's reader: a
 * .docx parsed as a workbook is "This workbook has no sheets to show."
 *
 * `updatedAt` is in the key because a replacement with the same name and size is still a new
 * file. It also moves on an approval or a settings change, which costs one re-download — the
 * cheap direction to be wrong in.
 */
export function documentFileRevision(
  doc: Pick<WorkspaceDocumentDto, "fileName" | "fileExtension" | "sizeBytes" | "updatedAt">,
): string {
  return [doc.fileName, doc.fileExtension, String(doc.sizeBytes), doc.updatedAt].join("|");
}

/**
 * WT-854 — the cache identity of the PENDING file, or null when none is waiting.
 *
 * Prefixed so it can never equal an approved file's revision: the preview caches bytes by
 * revision, and the pending file and the approved file are fetched from different routes.
 */
export function pendingRevisionFileRevision(
  doc: Pick<WorkspaceDocumentDto, "pendingRevision">,
): string | null {
  const pending = doc.pendingRevision;
  if (!pending) return null;
  return [
    "pending",
    pending.fileName,
    pending.fileExtension,
    String(pending.sizeBytes),
    pending.uploadedAt,
  ].join("|");
}
