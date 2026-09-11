"use client";

import { useState } from "react";
import { XCircle } from "@phosphor-icons/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Asks the reviewer why. WT-633.
 *
 * Rejecting used to be a single button press. The uploader was shown a document marked Rejected
 * and nothing else — there was no field to type a reason into and no column to store one in — so
 * their only way forward was to delete the document and upload a new one, which destroyed the
 * approval trail along with it.
 *
 * The reason is mandatory here because it is mandatory in the API, and for the same reason: the
 * person who has to act on this decision is going to read this sentence and nothing more.
 */
const MAX_REASON_LENGTH = 2000;

export function DocumentRejectDialog({
  open,
  documentName,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  documentName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");

  const trimmed = reason.trim();
  const tooLong = trimmed.length > MAX_REASON_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !isSubmitting;

  function handleOpenChange(next: boolean) {
    if (next) return;
    setReason("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-hairline bg-surface-1">
        <DialogHeader className="flex flex-col gap-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-base font-bold">
            Reject this document?
          </DialogTitle>
          <DialogDescription className="text-center text-xs leading-normal text-ink-muted">
            <span className="font-semibold text-ink">{documentName}</span> goes back to
            whoever uploaded it. They will see your reason and can upload a corrected version
            without losing this document or its history.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-1.5">
          <label
            htmlFor="document-reject-reason"
            className="text-xs font-bold text-ink"
          >
            Reason for rejection
          </label>
          <Textarea
            id="document-reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder="e.g. The signature page is missing from the scan."
            className="resize-none rounded-xl border-hairline text-xs"
          />
          <p
            className={
              tooLong
                ? "text-[11px] text-destructive"
                : "text-[11px] text-ink-muted"
            }
          >
            {tooLong
              ? `${trimmed.length} characters — the limit is ${MAX_REASON_LENGTH}.`
              : "Required. Say what needs to change, so the fix can be made in one pass."}
          </p>
        </div>

        <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
            className="h-9 flex-1 rounded-xl border border-hairline bg-surface-1 text-xs font-semibold transition hover:bg-surface-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!canSubmit) return;
              await onConfirm(trimmed);
              setReason("");
            }}
            disabled={!canSubmit}
            className="h-9 flex-1 rounded-xl bg-destructive text-xs font-semibold text-white transition hover:bg-destructive/90 disabled:opacity-50"
          >
            {isSubmitting ? "Rejecting…" : "Reject with reason"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
