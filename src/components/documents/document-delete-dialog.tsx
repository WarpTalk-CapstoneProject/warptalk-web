"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Warning } from "@phosphor-icons/react";

interface DocumentDeleteDialogProps {
  docToDelete: { id: string; name: string } | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DocumentDeleteDialog({
  docToDelete,
  onClose,
  onConfirm,
}: DocumentDeleteDialogProps) {
  return (
    <Dialog open={!!docToDelete} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="border-hairline bg-surface-1 max-w-sm rounded-2xl">
        <DialogHeader className="flex flex-col gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
            <Warning className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center font-bold text-base">
            Delete Document?
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-ink">{docToDelete?.name}</span>? This
            will remove file content, AI context, and access policies from workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-xl border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-9 rounded-xl bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition"
          >
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
