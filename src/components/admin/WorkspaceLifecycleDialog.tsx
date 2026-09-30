"use client";

import { Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useState } from "react";

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

const MAX_REASON_LENGTH = 500;

export type WorkspaceLifecycleAction = "suspend" | "reactivate" | "delete";

/**
 * Confirmation for a workspace lifecycle change. Every one of these is disruptive for the whole
 * tenant, so the reason is mandatory here as well as server-side and is stored on the immutable
 * admin action trail. Delete is the only irreversible one, and its copy says so.
 */
export function WorkspaceLifecycleDialog({
  open,
  action,
  workspaceName,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  action: WorkspaceLifecycleAction;
  workspaceName: string;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const t = useTranslations("adminWorkspaces.lifecycleDialog");
  const [reason, setReason] = useState("");

  // Clear the draft whenever the dialog is opened or switched to the other action, so a
  // previous reason is never silently reused. Adjusted during render, not in an effect.
  const session = `${open}:${action}`;
  const [lastSession, setLastSession] = useState(session);
  if (session !== lastSession) {
    setLastSession(session);
    setReason("");
  }

  const isSuspend = action === "suspend";
  const isDelete = action === "delete";
  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && trimmedReason.length <= MAX_REASON_LENGTH && !pending;

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`${action}.title`)}</DialogTitle>
          <DialogDescription>
            {t.rich(`${action}.description`, {
              workspaceName,
              b: (chunks) => <span className="font-medium text-ink">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="lifecycle-reason">
            {t("reasonLabel")} <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="lifecycle-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={MAX_REASON_LENGTH}
            autoFocus
            placeholder={t(`${action}.placeholder`)}
          />
          <p className="text-xs text-ink-muted">
            {t("reasonHelp", { current: trimmedReason.length, max: MAX_REASON_LENGTH })}
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <WarningCircle size={16} weight="duotone" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button
            variant={isSuspend || isDelete ? "destructive" : "default"}
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmedReason)}
          >
            {pending ? (
              <>
                <Spinner size={14} className="animate-spin" />
                {t(`${action}.busy`)}
              </>
            ) : (
              t(`${action}.confirm`)
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
