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

/**
 * Which documents a tab shows.
 *
 * Archived is excluded from every tab but its own — an archived document is retired, and showing
 * it under Published would make the shelf look fuller than it is. The three status tabs are
 * mutually exclusive, so a document appears under exactly one of them.
 */
export function documentMatchesTab(
  doc: Pick<WorkspaceDocumentDto, "status">,
  tab: DocumentTab,
): boolean {
  if (tab === DOCUMENT_TAB.ARCHIVED) return isArchived(doc);
  if (isArchived(doc)) return false;

  switch (tab) {
    case DOCUMENT_TAB.PENDING:
      return isPendingApproval(doc);
    case DOCUMENT_TAB.REJECTED:
      return isRejected(doc);
    case DOCUMENT_TAB.PUBLISHED:
      return isPublished(doc);
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
  doc: Pick<WorkspaceDocumentDto, "status" | "uploadedBy" | "ownerId">,
  currentUserId: string | null | undefined,
  canApproveDocuments: boolean,
): boolean {
  if (!isRejected(doc) && !isPublished(doc)) return false;

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
    action === "Reuploaded"
  );
}
