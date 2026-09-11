"use client";

/**
 * The rejection flow, without a backend or a rejected document to hand.
 *
 * WHY IT IS WORTH A PAGE. Reaching the real thing means signing in, uploading a document as a
 * member, rejecting it as an owner, and signing back in as the member — four steps across two
 * accounts before anyone can look at the banner. These three surfaces are exactly the ones a
 * reviewer will read under pressure, so they need to be checkable in one click.
 *
 * Not linked from anywhere.
 */

import { useState } from "react";

import { DocumentDuplicateDialog } from "@/components/documents/document-duplicate-dialog";
import { DocumentRejectDialog } from "@/components/documents/document-reject-dialog";
import { DocumentReviewTrail } from "@/components/documents/document-review-trail";
import type { DuplicateConflict } from "@/lib/documents/document-review";
import type { DocumentHistoryEntryDto } from "@/types/workspace";

// i18n-allow: these are PEOPLE'S NAMES — the team's own — not UI copy to translate.
const ACTORS: Record<string, string> = {
  u1: "Trần Mạnh Tuấn",
  u2: "Huỳnh Thái Tú",
};

const REJECTION_REASON =
  "The signature page is missing from the scan, and section 4 still shows last quarter's figures.\n\nPlease re-scan pages 7–8 and refresh the table before resubmitting.";

const HISTORY: DocumentHistoryEntryDto[] = [
  {
    id: "h4",
    action: "Reuploaded",
    actorId: "u1",
    actionAt: "2026-09-04T02:15:00.000Z",
    reason: "Re-scanned pages 7–8 and updated the Q3 table.",
  },
  {
    id: "h3",
    action: "RejectDocument",
    actorId: "u2",
    actionAt: "2026-09-02T08:00:00.000Z",
    reason: REJECTION_REASON,
  },
  {
    id: "h2",
    action: "PatchDocumentMetadata",
    actorId: "u2",
    actionAt: "2026-09-01T10:30:00.000Z",
  },
  {
    id: "h1",
    action: "UploadDocument",
    actorId: "u1",
    actionAt: "2026-09-01T08:00:00.000Z",
  },
];

const CONFLICT_NAMED: DuplicateConflict = {
  message: 'This file is already in this workspace as "Quarterly plan".',
  duplicate: {
    documentId: "3515e768-46f5-4f0c-8caf-f525d1e08bbb",
    name: "Quarterly plan",
    fileName: "quarterly-plan.pdf",
    status: "public",
    sizeBytes: 482_133,
    createdAt: "2026-08-12T09:00:00.000Z",
  },
};

const CONFLICT_HIDDEN: DuplicateConflict = {
  message:
    "This file is already in this workspace, in a document you do not have access to.",
  duplicate: null,
};

export default function DocumentReviewPreviewPage() {
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [conflict, setConflict] = useState<DuplicateConflict | null>(null);

  return (
    <div className="min-h-screen bg-surface-1 p-8 text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Document review — WT-633 / WT-666</h1>
          <p className="text-xs text-ink-muted">
            The rejection banner, the corrected-version flow and the two duplicate dialogs.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsRejectOpen(true)}
            className="h-8 rounded-lg border border-hairline bg-surface-2 px-3 text-xs font-semibold transition hover:bg-surface-3"
          >
            Open reject dialog
          </button>
          <button
            type="button"
            onClick={() => setConflict(CONFLICT_NAMED)}
            className="h-8 rounded-lg border border-hairline bg-surface-2 px-3 text-xs font-semibold transition hover:bg-surface-3"
          >
            Duplicate — caller can see it
          </button>
          <button
            type="button"
            onClick={() => setConflict(CONFLICT_HIDDEN)}
            className="h-8 rounded-lg border border-hairline bg-surface-2 px-3 text-xs font-semibold transition hover:bg-surface-3"
          >
            Duplicate — caller cannot
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Rejected, seen by the uploader
            </h2>
            {/* The scroll container the real page puts this in, so a long reason is checked
                inside the box it actually has to fit. */}
            <div className="max-h-[560px] overflow-y-auto">
              <DocumentReviewTrail
                rejectionReason={REJECTION_REASON}
                showRejectionBanner
                canUploadRevision
                isUploadingRevision={false}
                onUploadRevision={async () => {}}
                history={HISTORY}
                isHistoryLoading={false}
                actorName={(id) => (id ? (ACTORS[id] ?? null) : null)}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Published, seen by a member who did not upload it
            </h2>
            <div className="max-h-[560px] overflow-y-auto">
              <DocumentReviewTrail
                rejectionReason={REJECTION_REASON}
                showRejectionBanner={false}
                canUploadRevision={false}
                isUploadingRevision={false}
                onUploadRevision={async () => {}}
                history={HISTORY}
                isHistoryLoading={false}
                actorName={(id) => (id ? (ACTORS[id] ?? null) : null)}
              />
            </div>
          </section>
        </div>
      </div>

      <DocumentRejectDialog
        open={isRejectOpen}
        documentName="Quarterly plan"
        isSubmitting={false}
        onClose={() => setIsRejectOpen(false)}
        onConfirm={() => setIsRejectOpen(false)}
      />

      <DocumentDuplicateDialog
        conflict={conflict}
        isSubmitting={false}
        onClose={() => setConflict(null)}
        onChoose={() => setConflict(null)}
      />
    </div>
  );
}
