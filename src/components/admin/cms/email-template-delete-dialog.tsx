"use client";

/**
 * Deleting a template an admin created. It moves to Archived (restorable, the send log and the
 * counters keep pointing at it) — or, if it never sent a single email, it can be removed for good.
 * A reason is required either way; the audit log keeps it.
 *
 * Built-in templates never reach this dialog: they are bound to the service that sends them.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCustomEmailDeletionCheck, useDeleteCustomEmail } from "@/hooks/use-admin-email-templates";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

export function EmailTemplateDeleteDialog({
  open,
  onOpenChange,
  templateKey,
  templateName,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateKey: string;
  templateName: string;
  onDeleted?: (permanent: boolean) => void;
}) {
  const t = useTranslations("adminCms.library.delete");
  const tCommon = useTranslations("adminCms.common");
  const check = useCustomEmailDeletionCheck(templateKey, open);
  const remove = useDeleteCustomEmail();
  const [reason, setReason] = useState("");
  const [permanent, setPermanent] = useState(false);
  const canPurge = Boolean(check.data?.canDeletePermanently);

  const submit = async () => {
    try {
      await remove.mutateAsync({ key: templateKey, reason: reason.trim(), permanent: permanent && canPurge });
      toast.success(permanent && canPurge ? t("purged") : t("archived"));
      setReason("");
      setPermanent(false);
      onOpenChange(false);
      onDeleted?.(permanent && canPurge);
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name: templateName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label={t("how")} className="space-y-2">
          <Option selected={!permanent} onSelect={() => setPermanent(false)} title={t("archive")} hint={t("archiveHint")} />
          <Option
            selected={permanent}
            onSelect={() => canPurge && setPermanent(true)}
            disabled={!canPurge}
            title={t("purge")}
            hint={check.isPending ? t("checking") : canPurge ? t("purgeHint") : (check.data?.reason ?? t("purgeUnavailable"))}
          />
        </div>
        <div>
          <Label htmlFor="delete-reason" className="text-[12px] text-ink-muted">
            {t("reason")}
          </Label>
          <Textarea
            id="delete-reason"
            className="mt-1.5 min-h-[72px]"
            maxLength={500}
            placeholder={t("reasonPlaceholder")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("editor.cancel")}
          </Button>
          <Button variant="destructive" disabled={!reason.trim() || remove.isPending} onClick={() => void submit()}>
            <Trash size={14} />
            {permanent ? t("confirmPurge") : t("confirmArchive")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Option({
  selected,
  onSelect,
  title,
  hint,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left",
        selected ? "border-ink bg-surface-2" : "border-border hover:bg-surface-2",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
      )}
    >
      <span className={cn("mt-1 size-3 shrink-0 rounded-full border", selected ? "border-4 border-ink" : "border-border")} aria-hidden />
      <span>
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-[11.5px] text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}
