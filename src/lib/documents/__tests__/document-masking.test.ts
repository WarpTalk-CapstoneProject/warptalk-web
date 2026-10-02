import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceDocumentDto } from "../../../types/workspace.ts";
import {
  canSwitchDocumentVersion,
  contentAccessOf,
  maskedCopyLosesLayout,
  maskedFileName,
  maskedFileRevision,
  maskedVersionStatusKey,
  rescanCanHelp,
  visibleDocumentVersion,
} from "../document-masking.ts";
import { documentFileRevision } from "../document-review.ts";

function doc(overrides: Partial<WorkspaceDocumentDto> = {}): WorkspaceDocumentDto {
  return {
    id: "doc-1",
    workspaceId: "ws-1",
    name: "Security report",
    fileName: "Security report.docx",
    fileExtension: ".docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 1024,
    sourceType: "upload",
    ingestionStatus: "completed",
    aiEligible: false,
    isAiAllowed: true,
    confidentialityLevel: "restricted",
    retentionState: "active",
    status: "public",
    createdAt: "2026-10-02T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

test("an API without the field means the original", () => {
  assert.equal(contentAccessOf(doc()), "original");
});

test("a member only ever sees the masked copy, whatever was chosen", () => {
  const member = doc({ contentAccess: "masked", maskedVersionAvailable: true });
  assert.equal(visibleDocumentVersion(member, "original"), "masked");
  assert.equal(visibleDocumentVersion(member, "masked"), "masked");
  assert.equal(canSwitchDocumentVersion(member), false);
});

test("owner/admin see the original by default and may switch when a copy exists", () => {
  const owner = doc({ contentAccess: "original", maskedVersionAvailable: true });
  assert.equal(visibleDocumentVersion(owner, "original"), "original");
  assert.equal(visibleDocumentVersion(owner, "masked"), "masked");
  assert.equal(canSwitchDocumentVersion(owner), true);
});

test("choosing masked without a copy falls back to the original", () => {
  const owner = doc({ contentAccess: "original", maskedVersionAvailable: false });
  assert.equal(visibleDocumentVersion(owner, "masked"), "original");
  assert.equal(canSwitchDocumentVersion(owner), false);
});

test("none has nothing to show", () => {
  assert.equal(visibleDocumentVersion(doc({ contentAccess: "none" }), "original"), null);
});

test("masked file name keeps the extension", () => {
  assert.equal(maskedFileName("Security report.docx"), "Security report (masked).docx");
  assert.equal(maskedFileName("a.b.pdf"), "a.b (masked).pdf");
  assert.equal(maskedFileName("README"), "README (masked)");
});

test("the masked copy never shares a cache entry with the original", () => {
  const owner = doc();
  assert.notEqual(maskedFileRevision(owner), documentFileRevision(owner));
  assert.notEqual(
    maskedFileRevision(owner),
    maskedFileRevision(doc({ updatedAt: "2026-10-03T00:00:00Z" })),
  );
});

test("only a PDF loses its layout", () => {
  assert.equal(maskedCopyLosesLayout(".PDF"), true);
  assert.equal(maskedCopyLosesLayout(".docx"), false);
});

test("re-scan is offered only where it can change the answer", () => {
  assert.equal(rescanCanHelp("not_generated"), true);
  assert.equal(rescanCanHelp("verification_failed"), true);
  assert.equal(rescanCanHelp("converter_unavailable"), true);
  assert.equal(rescanCanHelp("dlp_blocked"), false);
  assert.equal(rescanCanHelp("unsupported_format"), false);
  assert.equal(rescanCanHelp("available"), false);
  assert.equal(rescanCanHelp("pending"), false);
});

test("every status except available has an explanation", () => {
  assert.equal(maskedVersionStatusKey("available"), null);
  assert.equal(maskedVersionStatusKey(null), null);
  for (const status of [
    "not_generated",
    "pending",
    "no_pii_found",
    "dlp_blocked",
    "masked_text_unavailable",
    "unsupported_format",
    "unsupported_content",
    "alignment_failed",
    "verification_failed",
    "converter_unavailable",
    "error",
  ] as const) {
    assert.ok(maskedVersionStatusKey(status), status);
  }
});
