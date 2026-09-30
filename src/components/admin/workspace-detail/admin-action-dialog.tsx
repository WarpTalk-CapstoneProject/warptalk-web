"use client";

import { ArrowLeft, Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

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
import { ADMIN_REASON_MAX, validateReason, type ActionError } from "@/lib/admin/workspace-actions";
import { getErrorMessage } from "@/lib/api/errors";

export interface ConfirmRow {
  label: string;
  value: ReactNode;
}

/**
 * The one shape every admin workspace action goes through: fields, a mandatory reason, then a
 * confirm step that restates exactly what will happen to which workspace before anything is sent.
 *
 * Two steps rather than one button because these are money and access changes on somebody else's
 * tenant: the review step is where "+5000 credits" turns out to have been meant as "-500". The
 * reason is required here as well as by the server, which records it in the platform audit log —
 * it is the only answer anyone will ever have to "why was this done".
 */
export function AdminActionDialog({
  open,
  onOpenChange,
  title,
  description,
  workspaceName,
  destructive = false,
  confirmLabel,
  children,
  validate,
  summary,
  onConfirm,
  reasonPlaceholder,
  hideReason = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  workspaceName: string;
  destructive?: boolean;
  confirmLabel: string;
  children?: ReactNode;
  /** Field-level check; an i18n key under `adminWorkspaces.actions.errors`, or null. */
  validate?: () => ActionError | null;
  /** What the confirm step restates. */
  summary: () => ConfirmRow[];
  onConfirm: (reason: string) => Promise<void>;
  reasonPlaceholder?: string;
  /** For the one action whose text is its own reason (a note). */
  hideReason?: boolean;
}) {
  const t = useTranslations("adminWorkspaces.actions");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A fresh dialog every time it opens: a previous reason is never silently reused.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setStep("edit");
      setReason("");
      setError(null);
    }
  }

  const review = () => {
    const fieldError = validate?.() ?? null;
    const reasonError = hideReason ? null : validateReason(reason);
    const problem = fieldError ?? reasonError;
    if (problem) {
      setError(t(`errors.${problem}`));
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, t("errors.failed")));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === "edit" ? description : t("confirmIntro", { workspaceName })}
          </DialogDescription>
        </DialogHeader>

        {step === "edit" ? (
          <div className="space-y-4">
            {children}
            {hideReason ? null : (
              <div className="space-y-1.5">
                <Label htmlFor="admin-action-reason">
                  {t("reasonLabel")} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="admin-action-reason"
                  rows={3}
                  maxLength={ADMIN_REASON_MAX}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={reasonPlaceholder ?? t("reasonPlaceholder")}
                />
                <p className="text-[11px] text-ink-subtle">
                  {t("reasonHelp", { current: reason.trim().length, max: ADMIN_REASON_MAX })}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div
            className={
              destructive
                ? "rounded-lg border border-destructive/25 bg-destructive/5 p-3"
                : "rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
            }
          >
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("workspaceLabel")}</dt>
                <dd className="text-right font-medium text-ink">{workspaceName}</dd>
              </div>
              {summary().map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{row.label}</dt>
                  <dd className="text-right font-medium tabular-nums text-ink">{row.value}</dd>
                </div>
              ))}
              {hideReason ? null : (
                <div className="border-t border-hairline/60 pt-1.5">
                  <dt className="text-ink-muted">{t("reasonLabel")}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-ink">{reason.trim()}</dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-[11px] leading-4 text-ink-muted">
              {destructive ? t("confirmDestructiveNote") : t("confirmNote")}
            </p>
          </div>
        )}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <WarningCircle size={16} weight="duotone" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <DialogFooter>
          {step === "edit" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={review}>{t("review")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("edit")} disabled={pending}>
                <ArrowLeft size={13} />
                {t("back")}
              </Button>
              <Button
                variant={destructive ? "destructive" : "default"}
                onClick={() => void confirm()}
                disabled={pending}
              >
                {pending ? <Spinner size={14} className="animate-spin" /> : null}
                {pending ? t("working") : confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
