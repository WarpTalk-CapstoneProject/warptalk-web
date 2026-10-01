import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_DOCUMENT_DISPLAY,
  EMPTY_DOCUMENT_FILTERS,
  activeDocumentFilterCount,
  documentFileKind,
  isDefaultDocumentDisplay,
  matchesDocumentFilters,
  sortDocuments,
  toggleDocumentFileKind,
} from "../document-list-options.ts";

const ME = "user-me";

test("file kinds come from the stored extension, dot and case tolerated", () => {
  assert.equal(documentFileKind(".PDF"), "pdf");
  assert.equal(documentFileKind("docx"), "word");
  assert.equal(documentFileKind(".xlsx"), "spreadsheet");
  assert.equal(documentFileKind("md"), "text");
  assert.equal(documentFileKind(".jpeg"), "image");
  assert.equal(documentFileKind("zip"), "other");
  assert.equal(documentFileKind(undefined), "other");
});

test("no filter narrows nothing, and each filter counts once for the badge", () => {
  const doc = { fileExtension: ".pdf", uploadedBy: "someone-else" };
  assert.equal(matchesDocumentFilters(doc, EMPTY_DOCUMENT_FILTERS, ME), true);
  assert.equal(activeDocumentFilterCount(EMPTY_DOCUMENT_FILTERS), 0);

  const both = { fileKinds: ["pdf", "image"] as const, mineOnly: true };
  assert.equal(activeDocumentFilterCount({ ...both, fileKinds: [...both.fileKinds] }), 2);
});

test("file kind and mine filters combine", () => {
  const filters = { fileKinds: ["pdf" as const], mineOnly: true };
  assert.equal(matchesDocumentFilters({ fileExtension: ".pdf", uploadedBy: ME }, filters, ME), true);
  assert.equal(matchesDocumentFilters({ fileExtension: ".pdf", ownerId: ME }, filters, ME), true);
  assert.equal(matchesDocumentFilters({ fileExtension: ".docx", uploadedBy: ME }, filters, ME), false);
  assert.equal(matchesDocumentFilters({ fileExtension: ".pdf", uploadedBy: "x" }, filters, ME), false);
  // No viewer resolved yet: "mine" cannot be true of anything.
  assert.equal(matchesDocumentFilters({ fileExtension: ".pdf", uploadedBy: ME }, filters, null), false);
});

test("toggling a kind keeps menu order and removes it on the second press", () => {
  let filters = toggleDocumentFileKind(EMPTY_DOCUMENT_FILTERS, "image");
  filters = toggleDocumentFileKind(filters, "pdf");
  assert.deepEqual(filters.fileKinds, ["pdf", "image"]);
  filters = toggleDocumentFileKind(filters, "image");
  assert.deepEqual(filters.fileKinds, ["pdf"]);
});

test("sorting returns a copy ordered by the chosen field", () => {
  const docs = [
    { name: "b", sizeBytes: 30, updatedAt: "2026-09-02T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" },
    { name: "A", sizeBytes: 10, updatedAt: "", createdAt: "2026-09-03T00:00:00Z" },
    { name: "c", sizeBytes: 20, updatedAt: "2026-09-01T00:00:00Z", createdAt: "2026-08-01T00:00:00Z" },
  ];
  const byModified = sortDocuments(docs, DEFAULT_DOCUMENT_DISPLAY);
  assert.deepEqual(byModified.map((doc) => doc.name), ["A", "b", "c"]);
  assert.deepEqual(docs.map((doc) => doc.name), ["b", "A", "c"], "input untouched");

  assert.deepEqual(
    sortDocuments(docs, { sortField: "name", sortDirection: "asc" }).map((doc) => doc.name),
    ["A", "b", "c"],
  );
  assert.deepEqual(
    sortDocuments(docs, { sortField: "size", sortDirection: "desc" }).map((doc) => doc.sizeBytes),
    [30, 20, 10],
  );
  assert.equal(isDefaultDocumentDisplay(DEFAULT_DOCUMENT_DISPLAY), true);
  assert.equal(isDefaultDocumentDisplay({ sortField: "name", sortDirection: "asc" }), false);
});

test("the Documents page wires both buttons to popovers (WT-895)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(
    join(here, "../../../app/(app)/[workspaceSlug]/documents/page.tsx"),
    "utf8",
  );
  for (const label of ['t("filterOptions")', 't("displayOptions")']) {
    const at = page.indexOf(label);
    assert.ok(at > 0, `${label} is rendered`);
    const before = page.slice(Math.max(0, at - 1200), at);
    assert.match(before, /<PopoverTrigger/, `${label} sits on a PopoverTrigger, not a bare button`);
  }
  assert.match(page, /matchesDocumentFilters\(/);
  assert.match(page, /sortDocuments\(/);
});
