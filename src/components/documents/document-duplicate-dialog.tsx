"use client";

import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("documents.duplicateDialog");
  const locale = useLocale();
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
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-center text-xs leading-normal text-ink-muted">
            {duplicate ? (
              t.rich("descriptionKnown", {
                name: () => <span className="font-semibold text-ink">{duplicate.name}</span>,
                date: new Date(duplicate.createdAt).toLocaleDateString(locale),
              })
            ) : (
              t("descriptionUnknown")
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
              <span className="text-xs font-bold text-ink">{t("keepExisting")}</span>
              <span className="text-[11px] leading-tight text-ink-muted">
                {t("keepExistingDetail", { name: duplicate.name })}
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
                {t("replace")}
              </span>
              <span className="text-[11px] leading-tight text-ink-muted">
                {t("replaceDetail", { name: duplicate.name })}
              </span>
            </button>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onChoose(DUPLICATE_STRATEGY.CREATE_NEW)}
            className="flex flex-col items-start gap-0.5 rounded-xl border border-hairline bg-surface-2/40 px-3.5 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="text-xs font-bold text-ink">{t("uploadAnyway")}</span>
            <span className="text-[11px] leading-tight text-ink-muted">
              {t("uploadAnywayDetail")}
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
            {t("cancel")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
