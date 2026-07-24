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
