// WT-854, WT-857 — a document's file can be replaced in place (WT-633 "Upload a corrected
// version": same id, new bytes). The preview cached the bytes by document id with
// staleTime: Infinity, so the page kept showing the FIRST file after every replacement and
// approval until a full reload — forever on desktop, which has no reload — and handed old .docx
// bytes to the workbook reader after a switch to .xlsx ("This workbook has no sheets to show.").
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const preview = read("src/app/(app)/[workspaceSlug]/documents/[documentId]/components/DocumentPreview.tsx");
assert.match(
  preview,
  /queryKey: \["workspace-document-preview", workspaceId, documentId, revision\]/,
  "the preview's cached bytes must be keyed by the file revision, not only the document id",
);

const page = read("src/app/(app)/[workspaceSlug]/documents/[documentId]/page.tsx");
assert.match(page, /const fileRevision = documentFileRevision\(doc\);/, "the page must derive the file revision from the document");
// WT-854 part 2 — while a corrected version awaits review, the preview can show either file. Each
// has its own revision (the pending one from pendingRevisionFileRevision), and the preview is
// keyed by whichever is on screen, so neither file's bytes or parsed state can stand in for the
// other's.
assert.match(
  page,
  /const previewRevision =\s+showingPending && pendingFileRevision \? pendingFileRevision : fileRevision;/,
  "the preview revision must be the approved file's unless the pending revision is being shown",
);
assert.match(
  page,
  /<DocumentPreview\s+key=\{previewRevision\}[\s\S]{0,500}revision=\{previewRevision\}/,
  "the preview must remount on a new file (parsed Word/sheet state must not outlive it) and receive the revision",
);

console.log("document preview revision contract: ok");
