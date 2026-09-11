"use client";

import { useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  Spinner,
  WarningCircle,
} from "@phosphor-icons/react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  historyActionLabel,
  isDecisionAction,
} from "@/lib/documents/document-review";
import type { DocumentHistoryEntryDto } from "@/types/workspace";

/**
 * The rejection, the answer to it, and everything that led there. WT-633.
 *
 * WHAT WAS ACTUALLY MISSING
 *   The audit table has recorded a document's whole lifecycle since it existed, and the repository
 *   method that pages over it — GetPagedAuditsAsync — was written and never called by anything.
 *   The history below is that method, finally given a door. What genuinely did not exist was the
 *   reviewer's REASON: the reject path wrote an audit row with no metadata at all, so the decision
 *   was recorded and the reason for it was thrown away at the moment it was made.
 *
 *   And the uploader had no move. Re-uploading meant deleting the document and starting again,
 *   which took the approval trail with it. `Upload a corrected version` is the missing action.
 */

const ACCEPTED_UPLOAD_EXTENSIONS =
  ".pdf,.docx,.xlsx,.md,.png,.jpg,.jpeg,.webp,.bmp,.gif";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function DocumentReviewTrail({
  rejectionReason,
  showRejectionBanner,
  canUploadRevision,
  isUploadingRevision,
  onUploadRevision,
  history,
  isHistoryLoading,
  actorName,
}: {
  rejectionReason?: string | null;
  showRejectionBanner: boolean;
  canUploadRevision: boolean;
  isUploadingRevision: boolean;
  onUploadRevision: (file: File, note: string) => Promise<void>;
  history: DocumentHistoryEntryDto[];
  isHistoryLoading: boolean;
  /** Resolves a user id to a display name, or null when nobody in the directory matches. */
  actorName: (userId?: string | null) => string | null;
}) {
  const [isComposing, setIsComposing] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;

    if (picked.size > MAX_UPLOAD_BYTES) {
      setFileError("File size exceeds the 10MB limit.");
      setFile(null);
      e.target.value = "";
      return;
    }

    setFileError(null);
    setFile(picked);
  }

  function reset() {
    setIsComposing(false);
    setNote("");
    setFile(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!file) return;
    await onUploadRevision(file, note.trim());
    reset();
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface-2 p-1.5 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-2.5 py-2">
        <h2 className="text-[13px] font-semibold text-ink">Review</h2>
      </div>

      <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface-1">
        {showRejectionBanner && rejectionReason && (
          <section className="px-3.5 py-3">
            <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-destructive">
              <WarningCircle className="size-3.5 shrink-0" />
              Reason for rejection
            </h3>
            {/* whitespace-pre-line: reviewers write lists. Collapsing their line breaks turned a
                three-point correction into one run-on sentence. */}
            <p className="mt-2 whitespace-pre-line rounded-md border border-destructive/20 bg-destructive/5 p-2.5 text-xs leading-relaxed text-ink">
              {rejectionReason}
            </p>
          </section>
        )}

        {canUploadRevision && (
          <section className="px-3.5 py-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              Corrected version
            </h3>

            {!isComposing ? (
              <div className="mt-2.5 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsComposing(true)}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-3 text-xs font-semibold text-ink transition hover:bg-surface-3"
                >
                  <ArrowCounterClockwise className="size-3.5" />
                  Upload a corrected version
                </button>
                <p className="text-[10px] leading-tight text-ink-muted">
                  Keeps this document, its approval history and the reason above. Do not delete
                  and re-upload — that loses all three.
                </p>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-col gap-2">
                <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-hairline bg-surface-2/40 px-3 py-2.5 text-xs transition hover:border-primary/60 hover:bg-surface-2">
                  <span className="min-w-0 truncate font-medium text-ink">
                    {file ? file.name : "Choose the corrected file"}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {file ? "Change" : "Browse"}
                  </span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_UPLOAD_EXTENSIONS}
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isUploadingRevision}
                  />
                </label>

                {fileError && (
                  <p className="text-[11px] text-destructive">{fileError}</p>
                )}

                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isUploadingRevision}
                  rows={3}
                  placeholder="What did you change? (optional)"
                  className="resize-none rounded-lg border-hairline text-xs"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={isUploadingRevision}
                    className="h-8 flex-1 rounded-lg border border-hairline bg-surface-1 text-xs font-semibold transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!file || isUploadingRevision}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
                  >
                    {isUploadingRevision ? (
                      <Spinner className="size-3.5 animate-spin" />
                    ) : null}
                    Submit for approval
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="px-3.5 py-3">
          <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
            <ClockCounterClockwise className="size-3.5 shrink-0" />
            History
          </h3>

          <div className="mt-2.5">
            {isHistoryLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                <Spinner className="size-3.5 animate-spin" />
                Loading history…
              </div>
            ) : history.length === 0 ? (
              <p className="text-[11px] text-ink-muted">
                Nothing recorded yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {history.map((entry) => (
                  <li key={entry.id} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 size-1.5 shrink-0 rounded-full",
                        entry.action === "RejectDocument"
                          ? "bg-destructive"
                          : entry.action === "ApproveDocument"
                            ? "bg-emerald-500"
                            : isDecisionAction(entry.action)
                              ? "bg-amber-500"
                              : "bg-ink-subtle",
                      )}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={cn(
                          "text-xs text-ink",
                          isDecisionAction(entry.action) && "font-semibold",
                        )}
                      >
                        {historyActionLabel(entry.action)}
                      </span>
                      <span className="text-[10px] text-ink-muted">
                        {actorName(entry.actorId) ?? "—"} ·{" "}
                        {new Date(entry.actionAt).toLocaleString()}
                      </span>
                      {entry.reason && (
                        <p className="mt-1 whitespace-pre-line rounded-md border border-hairline bg-surface-2/50 p-2 text-[11px] leading-relaxed text-ink">
                          {entry.reason}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
