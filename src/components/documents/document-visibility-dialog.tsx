"use client";

import { Globe, LockSimple, Spinner } from "@phosphor-icons/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VISIBILITY_CONFIRM_COPY,
  type VisibilityAction,
} from "@/lib/documents/document-visibility";
import { cn } from "@/lib/utils";

interface DocumentVisibilityDialogProps {
  /** The action awaiting confirmation, or null when the dialog is closed. */
  action: VisibilityAction | null;
  documentName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (action: VisibilityAction) => void;
}

/**
 * The confirm step in front of a visibility change.
 *
 * Making a document private cuts people off the moment it lands and deletes the assistant's copy,
 * so it is asked for, named, and drawn in the destructive colour. The reverse is asked for too:
 * publishing puts the document in front of every internal member, which is not a thing to do by
 * a stray click either.
 */
export function DocumentVisibilityDialog({
  action,
  documentName,
  isSubmitting,
  onClose,
  onConfirm,
}: DocumentVisibilityDialogProps) {
  const copy = action ? VISIBILITY_CONFIRM_COPY[action] : null;
  const Icon = action === "make_private" ? LockSimple : Globe;

  return (
    <Dialog open={!!action} onOpenChange={(open: boolean) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl border-hairline bg-surface-1">
        <DialogHeader className="flex flex-col gap-2">
          <div
            className={cn(
              "mx-auto flex h-10 w-10 items-center justify-center rounded-full",
              copy?.destructive ? "bg-destructive/10 text-destructive" : "bg-surface-3 text-ink",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center text-base font-bold">{copy?.title}</DialogTitle>
          <DialogDescription className="text-center text-xs leading-normal text-ink-muted">
            <span className="block font-semibold text-ink">{documentName}</span>
            <span className="mt-1.5 block">{copy?.body}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 flex-1 rounded-xl border border-hairline bg-surface-1 text-xs font-semibold transition hover:bg-surface-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => action && onConfirm(action)}
            disabled={isSubmitting}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition disabled:opacity-50",
              copy?.destructive
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-foreground text-background hover:opacity-90",
            )}
          >
            {isSubmitting ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
            {copy?.confirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
