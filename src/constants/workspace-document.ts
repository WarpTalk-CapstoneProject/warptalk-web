export const WORKSPACE_DOCUMENT_STATUS = {
  PENDING_APPROVAL: "pending_approval",
  PUBLIC: "public",
  REJECTED: "rejected",
  ARCHIVED: "archived",
} as const;

export type WorkspaceDocumentStatusType =
  typeof WORKSPACE_DOCUMENT_STATUS[keyof typeof WORKSPACE_DOCUMENT_STATUS];

export const WORKSPACE_DOCUMENT_INGESTION_STATUS = {
  AWAITING_APPROVAL: "awaiting_approval",
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  SKIPPED: "skipped",
  FAILED: "failed",
} as const;

export type WorkspaceDocumentIngestionStatusType =
  typeof WORKSPACE_DOCUMENT_INGESTION_STATUS[keyof typeof WORKSPACE_DOCUMENT_INGESTION_STATUS];

export const WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL = {
  GENERAL: "public_internal",
  INTERNAL: "public_internal",
  RESTRICTED: "restricted",
} as const;

export type WorkspaceDocumentConfidentialityLevelType =
  typeof WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL[keyof typeof WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL];

export const WORKSPACE_DOCUMENT_SOURCE_TYPE = {
  UPLOAD: "upload",
  MEETING: "meeting",
} as const;

/**
 * File types the ingestion pipeline cannot read as text.
 *
 * Here rather than in a page because three surfaces now ask the same question — the upload dialog
 * (which turns AI indexing off for them), the preview (which renders them as pictures) and the
 * properties panel (which explains why the AI switch is unavailable). Two private copies had
 * already drifted into existence; a third would have been the one to go stale.
 */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];

/** Whether a document's own extension rules it out of AI indexing, whatever the flag says. */
export function isImageExtension(fileExtension: string | null | undefined): boolean {
  const normalized = fileExtension?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  return IMAGE_EXTENSIONS.includes(normalized.startsWith(".") ? normalized : `.${normalized}`);
}
