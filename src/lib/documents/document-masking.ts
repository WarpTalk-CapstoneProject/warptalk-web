import type {
  DocumentContentAccess,
  DocumentMaskedVersionStatus,
  WorkspaceDocumentDto,
} from "../../types/workspace.ts";
import { documentFileRevision } from "./document-review.ts";

/**
 * Which version of a restricted document the detail page shows, as functions over the DTO.
 *
 * The backend decides who gets what (`contentAccess`): Owner/Admin and the uploader read the
 * original, an ordinary member reads only the PII-masked copy. This file only turns that answer
 * into what the page offers, so the rules live in one testable place instead of inside JSX.
 *
 * Relative imports, not `@/…`: the contract tests run under bare `node --experimental-strip-types`.
 */

export type DocumentVersion = "original" | "masked";

export function contentAccessOf(doc: WorkspaceDocumentDto): DocumentContentAccess {
  return doc.contentAccess ?? "original";
}

/** True when the caller may switch between the original and the masked copy (Owner/Admin, uploader). */
export function canSwitchDocumentVersion(doc: WorkspaceDocumentDto): boolean {
  return contentAccessOf(doc) === "original" && Boolean(doc.maskedVersionAvailable);
}

/**
 * The version on screen. A member only ever has the masked copy; a caller with the original sees
 * it unless they chose the masked copy AND one exists. `none` has nothing to show.
 */
export function visibleDocumentVersion(
  doc: WorkspaceDocumentDto,
  chosen: DocumentVersion,
): DocumentVersion | null {
  const access = contentAccessOf(doc);
  if (access === "none") return null;
  if (access === "masked") return "masked";
  return chosen === "masked" && doc.maskedVersionAvailable ? "masked" : "original";
}

/**
 * The cache identity of the masked copy. Prefixed so it can never equal the original's revision
 * (the preview caches bytes by revision, and the two come from different routes), and it moves
 * whenever the original does: a re-scan writes the document row, so `updatedAt` changes with it.
 */
export function maskedFileRevision(
  doc: Pick<WorkspaceDocumentDto, "fileName" | "fileExtension" | "sizeBytes" | "updatedAt">,
): string {
  return ["masked", documentFileRevision(doc)].join("|");
}

/** `Report.docx` → `Report (masked).docx`, the name the API also puts on the download. */
export function maskedFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName} (masked)`;
  return `${fileName.slice(0, dot)} (masked)${fileName.slice(dot)}`;
}

/** The masked copy of a PDF is the masked text laid out again; the original layout is not kept. */
export function maskedCopyLosesLayout(fileExtension: string): boolean {
  return fileExtension.toLowerCase() === ".pdf";
}

/** Message keys under `documents.detail.masking.status`. */
export type MaskedVersionStatusKey =
  | "pending"
  | "notGenerated"
  | "noPiiFound"
  | "dlpBlocked"
  | "unsupportedFormat"
  | "unsupportedContent"
  | "converterUnavailable"
  | "failed";

/**
 * Why a restricted document has no masked copy, as a message key. `available` and null are not
 * explanations and return null. The four ways producing a copy can fail share one message: to the
 * reader they all mean "nothing was published, try again".
 */
export function maskedVersionStatusKey(
  status: DocumentMaskedVersionStatus | null | undefined,
): MaskedVersionStatusKey | null {
  switch (status) {
    case "pending":
      return "pending";
    case "not_generated":
      return "notGenerated";
    case "no_pii_found":
      return "noPiiFound";
    case "dlp_blocked":
      return "dlpBlocked";
    case "unsupported_format":
      return "unsupportedFormat";
    case "unsupported_content":
      return "unsupportedContent";
    case "converter_unavailable":
      return "converterUnavailable";
    case "masked_text_unavailable":
    case "alignment_failed":
    case "verification_failed":
    case "error":
      return "failed";
    default:
      return null;
  }
}

/** Re-scanning can change the answer only for these; a DLP hit or an image stays what it is. */
export function rescanCanHelp(status: DocumentMaskedVersionStatus | null | undefined): boolean {
  const key = maskedVersionStatusKey(status);
  return key === "notGenerated" || key === "converterUnavailable" || key === "failed";
}
