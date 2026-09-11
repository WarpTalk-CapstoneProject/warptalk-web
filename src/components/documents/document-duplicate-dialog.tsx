"use client";

import { CopySimple } from "@phosphor-icons/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DUPLICATE_STRATEGY,
  type DuplicateConflict,
  type DuplicateStrategy,
} from "@/lib/documents/document-review";

/**
 * What to do when the file is already here. WT-666.
 *
 * Before this, uploading the same file twice simply produced a second document, a second encrypted
 * blob and a second full set of AI chunks — so the assistant answered out of two copies and the
 * library listed two rows nobody could tell apart.
 *
 * Three choices, because all three are legitimate: the file was already uploaded by someone else
 * (keep theirs), this is a corrected version of the same document (replace it), or two teams
 * genuinely want their own copy (upload anyway).
 *
 * `conflict.duplicate` is null when the caller may not open the colliding document. That is not an
 * error — the bytes really are here — but nothing about the other document may be shown, and
 * Replace is withdrawn along with the name, because replacing a document you cannot read is not a
 * choice anyone can make responsibly.
 */
export function DocumentDuplicateDialog({
  conflict,
  isSubmitting,
  onClose,
  onChoose,
}: {
  conflict: DuplicateConflict | null;
  isSubmitting: boolean;
  onClose: () => void;
  onChoose: (strategy: DuplicateStrategy) => void | Promise<void>;
}) {
  const duplicate = conflict?.duplicate ?? null;

  return (
    <Dialog
      open={Boolean(conflict)}
      onOpenChange={(open: boolean) => !open && onClose()}
    >
      <DialogContent className="max-w-md rounded-2xl border-hairline bg-surface-1">
        <DialogHeader className="flex flex-col gap-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <CopySimple className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-base font-bold">
            This file is already here
          </DialogTitle>
          <DialogDescription className="text-center text-xs leading-normal text-ink-muted">
            {duplicate ? (
              <>
                The same file was uploaded as{" "}
                <span className="font-semibold text-ink">{duplicate.name}</span> on{" "}
                {new Date(duplicate.createdAt).toLocaleDateString()}. Nothing has been
                stored yet.
              </>
            ) : (
              <>
                An identical file is already in this workspace, in a document you do not
                have access to. Nothing has been stored yet.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          {duplicate && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onChoose(DUPLICATE_STRATEGY.SKIP)}
              className="flex flex-col items-start gap-0.5 rounded-xl border border-hairline bg-surface-2/40 px-3.5 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="text-xs font-bold text-ink">Keep the existing document</span>
              <span className="text-[11px] leading-tight text-ink-muted">
                Cancels this upload and opens {duplicate.name}.
              </span>
            </button>
          )}

          {duplicate && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onChoose(DUPLICATE_STRATEGY.REPLACE)}
              className="flex flex-col items-start gap-0.5 rounded-xl border border-hairline bg-surface-2/40 px-3.5 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="text-xs font-bold text-ink">
                Replace its file with this one
              </span>
              <span className="text-[11px] leading-tight text-ink-muted">
                Keeps {duplicate.name} and its history, and sends it back for approval.
              </span>
            </button>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onChoose(DUPLICATE_STRATEGY.CREATE_NEW)}
            className="flex flex-col items-start gap-0.5 rounded-xl border border-hairline bg-surface-2/40 px-3.5 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="text-xs font-bold text-ink">Upload it anyway</span>
            <span className="text-[11px] leading-tight text-ink-muted">
              Creates a second, separate document with the same contents.
            </span>
          </button>
        </div>

        <DialogFooter className="mt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 w-full rounded-xl border border-hairline bg-surface-1 text-xs font-semibold transition hover:bg-surface-2 disabled:opacity-50"
          >
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
