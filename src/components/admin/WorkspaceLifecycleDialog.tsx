"use client";

import { Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
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

const COPY: Record<
  WorkspaceLifecycleAction,
  { title: string; confirm: string; busy: string; placeholder: string }
> = {
  suspend: {
    title: "Suspend workspace",
    confirm: "Suspend workspace",
    busy: "Suspending…",
    placeholder: "e.g. Abuse report confirmed by customer success on 2026-08-03",
  },
  reactivate: {
    title: "Reactivate workspace",
    confirm: "Reactivate workspace",
    busy: "Reactivating…",
    placeholder: "e.g. Customer remediated the reported content",
  },
  delete: {
    title: "Delete workspace",
    confirm: "Delete workspace permanently",
    busy: "Deleting…",
    placeholder: "e.g. Tenant offboarded — contract ended 2026-07-31",
  },
};

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
  const copy = COPY[action];
  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && trimmedReason.length <= MAX_REASON_LENGTH && !pending;

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {isDelete ? (
              <>
                <span className="font-medium text-ink">{workspaceName}</span> will be deleted and
                every membership removed with it. This cannot be undone from the portal — a
                deleted workspace has left the lifecycle. Billing history and the audit trail
                survive.
              </>
            ) : isSuspend ? (
              <>
                <span className="font-medium text-ink">{workspaceName}</span> will be suspended
                for every member. No workspace data, meeting history, or billing record is
                deleted — the workspace can be reactivated later.
              </>
            ) : (
              <>
                <span className="font-medium text-ink">{workspaceName}</span> will become active
                again for every member. The original suspension stays in the audit trail.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="lifecycle-reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="lifecycle-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={MAX_REASON_LENGTH}
            autoFocus
            placeholder={copy.placeholder}
          />
          <p className="text-xs text-ink-muted">
            Recorded against your admin account and attached to this workspace permanently.{" "}
            {trimmedReason.length}/{MAX_REASON_LENGTH}
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
            Cancel
          </Button>
          <Button
            variant={isSuspend || isDelete ? "destructive" : "default"}
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmedReason)}
          >
            {pending ? (
              <>
                <Spinner size={14} className="animate-spin" />
                {copy.busy}
              </>
            ) : (
              copy.confirm
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
