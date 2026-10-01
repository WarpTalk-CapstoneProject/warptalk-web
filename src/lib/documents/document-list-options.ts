/**
 * WT-895 — what the Documents page's Filter and Display buttons do.
 *
 * Both buttons were drawn with an icon and a title and nothing else: no handler, no menu. The
 * status chips beside them already answer "which slice", so the two popovers answer the questions
 * the chips cannot:
 *
 *   Filter   — narrow the list by file type, and to the documents the viewer uploaded. Orthogonal
 *              to the chips, so a person can ask for "pending PDFs" without a chip per pair.
 *   Display  — how the rows are laid out and ordered. Never which rows, so a reset of one never
 *              touches the other (the same split the admin lists make, AdminDisplayOptions).
 *
 * Kept free of React and of `@/` imports so the node test runner can load it directly.
 */

export type DocumentFileKind = "pdf" | "word" | "spreadsheet" | "text" | "image" | "other";

/** Menu order. `other` last: it is the bucket for whatever the rest do not name. */
export const DOCUMENT_FILE_KINDS: readonly DocumentFileKind[] = [
  "pdf",
  "word",
  "spreadsheet",
  "text",
  "image",
  "other",
];

const KIND_BY_EXTENSION: Record<string, DocumentFileKind> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  csv: "spreadsheet",
  md: "text",
  txt: "text",
  json: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  bmp: "image",
  gif: "image",
};

/** The kind a file extension belongs to. Tolerates a leading dot and any case, as stored. */
export function documentFileKind(extension?: string | null): DocumentFileKind {
  const clean = (extension ?? "").trim().toLowerCase().replace(/^\./, "");
  return KIND_BY_EXTENSION[clean] ?? "other";
}

export interface DocumentListFilters {
  /** Empty means every kind — a filter with nothing ticked narrows nothing. */
  fileKinds: readonly DocumentFileKind[];
  /** Only documents the viewer uploaded or owns. */
  mineOnly: boolean;
}

export const EMPTY_DOCUMENT_FILTERS: DocumentListFilters = { fileKinds: [], mineOnly: false };

/** How many filters are on, for the badge on the Filter button. */
export function activeDocumentFilterCount(filters: DocumentListFilters): number {
  return (filters.fileKinds.length > 0 ? 1 : 0) + (filters.mineOnly ? 1 : 0);
}

/** Add the kind when it is off, remove it when it is on. */
export function toggleDocumentFileKind(
  filters: DocumentListFilters,
  kind: DocumentFileKind,
): DocumentListFilters {
  const fileKinds = filters.fileKinds.includes(kind)
    ? filters.fileKinds.filter((candidate) => candidate !== kind)
    : DOCUMENT_FILE_KINDS.filter(
        (candidate) => candidate === kind || filters.fileKinds.includes(candidate),
      );
  return { ...filters, fileKinds };
}

type FilterableDocument = {
  fileExtension?: string | null;
  uploadedBy?: string | null;
  ownerId?: string | null;
};

/**
 * Whether a document passes the Filter popover. "Mine" is the same test the row actions use to
 * decide who may delete a document (uploader or owner), so the two never disagree about whose it is.
 */
export function matchesDocumentFilters(
  doc: FilterableDocument,
  filters: DocumentListFilters,
  viewerId?: string | null,
): boolean {
  if (filters.fileKinds.length > 0 && !filters.fileKinds.includes(documentFileKind(doc.fileExtension))) {
    return false;
  }
  if (filters.mineOnly) {
    if (!viewerId) return false;
    if (doc.uploadedBy !== viewerId && doc.ownerId !== viewerId) return false;
  }
  return true;
}

export type DocumentSortField = "modified" | "name" | "size";
export type DocumentSortDirection = "asc" | "desc";

export const DOCUMENT_SORT_FIELDS: readonly DocumentSortField[] = ["modified", "name", "size"];

export interface DocumentDisplayOptions {
  sortField: DocumentSortField;
  sortDirection: DocumentSortDirection;
}

/** Newest first: what the Modified column and the page always showed before it could be changed. */
export const DEFAULT_DOCUMENT_DISPLAY: DocumentDisplayOptions = {
  sortField: "modified",
  sortDirection: "desc",
};

type SortableDocument = {
  name?: string | null;
  sizeBytes?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

function modifiedTime(doc: SortableDocument): number {
  const time = new Date(doc.updatedAt || doc.createdAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * A sorted copy; the input is not touched. Ties keep their incoming order (Array.prototype.sort is
 * stable), so equal sizes or names stay where the server put them rather than shuffling per render.
 */
export function sortDocuments<T extends SortableDocument>(
  docs: readonly T[],
  options: DocumentDisplayOptions,
  locale?: string,
): T[] {
  const sign = options.sortDirection === "asc" ? 1 : -1;
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const compare = (left: T, right: T): number => {
    switch (options.sortField) {
      case "name":
        return collator.compare(left.name ?? "", right.name ?? "");
      case "size":
        return (left.sizeBytes ?? 0) - (right.sizeBytes ?? 0);
      case "modified":
      default:
        return modifiedTime(left) - modifiedTime(right);
    }
  };
  return [...docs].sort((left, right) => sign * compare(left, right));
}

/** Whether the display differs from the default, for the dot on the Display button. */
export function isDefaultDocumentDisplay(options: DocumentDisplayOptions): boolean {
  return (
    options.sortField === DEFAULT_DOCUMENT_DISPLAY.sortField &&
    options.sortDirection === DEFAULT_DOCUMENT_DISPLAY.sortDirection
  );
}
