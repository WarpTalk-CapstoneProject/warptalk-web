import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCUMENT_TAB,
  DUPLICATE_ERROR_CODE,
  canUploadRevision,
  documentMatchesTab,
  historyActionLabel,
  isDecisionAction,
  parseDuplicateConflict,
  shouldShowRejectionFeedback,
} from "../document-review.ts";
import type { WorkspaceDocumentDto } from "../../../types/workspace.ts";

function doc(overrides: Partial<WorkspaceDocumentDto> = {}): WorkspaceDocumentDto {
  return {
    id: "doc-1",
    workspaceId: "ws-1",
    uploadedBy: "user-1",
    ownerId: "user-1",
    name: "Quarterly plan",
    fileName: "plan.pdf",
    fileExtension: ".pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    sourceType: "upload",
    ingestionStatus: "skipped",
    aiEligible: false,
    isAiAllowed: true,
    confidentialityLevel: "public_internal",
    retentionState: "active",
    status: "public",
    createdAt: "2026-09-01T08:00:00Z",
    updatedAt: "2026-09-01T08:00:00Z",
    ...overrides,
  };
}

test("the three status tabs are mutually exclusive", () => {
  const published = doc({ status: "public" });
  const pending = doc({ status: "pending_approval" });
  const rejected = doc({ status: "rejected" });

  assert.equal(documentMatchesTab(published, DOCUMENT_TAB.PUBLISHED), true);
  assert.equal(documentMatchesTab(published, DOCUMENT_TAB.PENDING), false);
  assert.equal(documentMatchesTab(published, DOCUMENT_TAB.REJECTED), false);

  assert.equal(documentMatchesTab(pending, DOCUMENT_TAB.PENDING), true);
  assert.equal(documentMatchesTab(pending, DOCUMENT_TAB.PUBLISHED), false);

  assert.equal(documentMatchesTab(rejected, DOCUMENT_TAB.REJECTED), true);
  assert.equal(documentMatchesTab(rejected, DOCUMENT_TAB.PUBLISHED), false);
  assert.equal(documentMatchesTab(rejected, DOCUMENT_TAB.PENDING), false);
});

test("archived documents appear only under Archived", () => {
  const archived = doc({ status: "archived" });
  assert.equal(documentMatchesTab(archived, DOCUMENT_TAB.ARCHIVED), true);
  assert.equal(documentMatchesTab(archived, DOCUMENT_TAB.ALL), false);
  assert.equal(documentMatchesTab(archived, DOCUMENT_TAB.PUBLISHED), false);
});

test("a status spelled with a different case is still recognised", () => {
  assert.equal(documentMatchesTab(doc({ status: "REJECTED" }), DOCUMENT_TAB.REJECTED), true);
  assert.equal(documentMatchesTab(doc({ status: "Pending_Approval" }), DOCUMENT_TAB.PENDING), true);
});

test("the uploader may replace a rejected document, and a stranger may not", () => {
  const rejected = doc({ status: "rejected", uploadedBy: "user-1", ownerId: "user-1" });

  assert.equal(canUploadRevision(rejected, "user-1", false), true);
  // Being allowed to READ a document is not being allowed to replace its contents, and a
  // workspace-visible document is readable by every internal member.
  assert.equal(canUploadRevision(rejected, "user-9", false), false);
  // An approver can, because the API lets them.
  assert.equal(canUploadRevision(rejected, "user-9", true), true);
});

test("a document already awaiting review cannot be replaced under the reviewer", () => {
  const pending = doc({ status: "pending_approval" });
  assert.equal(canUploadRevision(pending, "user-1", true), false);
});

test("an archived document is not quietly revived with new contents", () => {
  assert.equal(canUploadRevision(doc({ status: "archived" }), "user-1", true), false);
});

test("the rejection banner survives the revision, and stops at publication", () => {
  const reason = "Missing the signature page.";

  // Still rejected — the reason is the news.
  assert.equal(
    shouldShowRejectionFeedback(doc({ status: "rejected", rejectionReason: reason })),
    true,
  );
  // Re-uploaded and back in the queue. The reason OUTLIVES the rejection on purpose, so the
  // uploader can still read what they were answering while the fix is under review.
  assert.equal(
    shouldShowRejectionFeedback(doc({ status: "pending_approval", rejectionReason: reason })),
    true,
  );
  // Published. The reason is history now, not news.
  assert.equal(
    shouldShowRejectionFeedback(doc({ status: "public", rejectionReason: reason })),
    false,
  );
  // Never rejected at all.
  assert.equal(shouldShowRejectionFeedback(doc({ status: "rejected" })), false);
});

test("a duplicate conflict is recognised by its code, not its sentence", () => {
  const conflict = parseDuplicateConflict({
    response: {
      status: 409,
      data: {
        error: 'This file is already in this workspace as "The original".',
        code: DUPLICATE_ERROR_CODE,
        duplicate: {
          documentId: "doc-9",
          name: "The original",
          fileName: "plan.pdf",
          status: "public",
          sizeBytes: 2048,
          createdAt: "2026-08-12T09:00:00Z",
        },
      },
    },
  });

  assert.ok(conflict);
  assert.equal(conflict.duplicate?.documentId, "doc-9");
  assert.match(conflict.message, /The original/);
});

test("a collision the caller cannot see is still a collision", () => {
  const conflict = parseDuplicateConflict({
    response: {
      status: 409,
      data: {
        error: "This file is already in this workspace, in a document you do not have access to.",
        code: DUPLICATE_ERROR_CODE,
      },
    },
  });

  // `null` from the function means "not a duplicate problem"; `{ duplicate: null }` means "a
  // duplicate, and we cannot say which". The dialog has to tell those apart.
  assert.ok(conflict);
  assert.equal(conflict.duplicate, null);
});

test("any other failure is not mistaken for a duplicate", () => {
  assert.equal(parseDuplicateConflict(new Error("network down")), null);
  assert.equal(
    parseDuplicateConflict({ response: { status: 409, data: { code: "CONFLICT" } } }),
    null,
  );
  assert.equal(
    parseDuplicateConflict({ response: { status: 400, data: { code: "VALIDATION_ERROR" } } }),
    null,
  );
  assert.equal(parseDuplicateConflict(undefined), null);
});

test("history actions get a label, and an unknown one falls back to itself", () => {
  assert.equal(historyActionLabel("RejectDocument"), "Rejected");
  assert.equal(historyActionLabel("Reuploaded"), "Revision uploaded");
  // A new audit action added on the backend must still render, not vanish.
  assert.equal(historyActionLabel("SomeFutureAction"), "SomeFutureAction");
});

test("the three decisions are the ones the history emphasises", () => {
  assert.equal(isDecisionAction("ApproveDocument"), true);
  assert.equal(isDecisionAction("RejectDocument"), true);
  assert.equal(isDecisionAction("Reuploaded"), true);
  assert.equal(isDecisionAction("UploadDocument"), false);
  assert.equal(isDecisionAction("GetDocumentDetails"), false);
});
