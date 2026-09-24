"use client";

/**
 * The three privileged actions on a platform account.
 *
 * Each one is confirmed with a reason, because the server requires one — and it requires one
 * because it is written to the platform audit log, and the action is refused outright if that
 * record cannot be written. So a failure here can mean nothing happened at all, which is what the
 * error copy says rather than inviting a retry that would be the second attempt at nothing.
 *
 * There is no delete. A user's rows reach four services; removing one is a data-lifecycle
 * decision, not a button on a table.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

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
import { getErrorMessage } from "@/lib/api/errors";
import type { AdminUserSummaryDto } from "@/types/admin-user";

export type AdminUserAction = "revoke-sessions" | "deactivate" | "reactivate" | "unlock";

// Maps each action to the sub-object under adminUsers.actionDialog carrying its copy.
const ACTION_COPY_KEY: Record<AdminUserAction, "revokeSessions" | "deactivate" | "reactivate" | "unlock"> = {
  "revoke-sessions": "revokeSessions",
  deactivate: "deactivate",
  reactivate: "reactivate",
  unlock: "unlock",
};

export function AdminUserActionDialog({
  user,
  action,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  /** Null while closed. */
  user: AdminUserSummaryDto | null;
  action: AdminUserAction;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<unknown>;
  isSaving: boolean;
}) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-md">
        {user ? (
          <ActionForm
            key={`${user.id}:${action}`}
            user={user}
            action={action}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            onDone={() => onOpenChange(false)}
            isSaving={isSaving}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ActionForm({
  user,
  action,
  onCancel,
  onSubmit,
  onDone,
  isSaving,
}: {
  user: AdminUserSummaryDto;
  action: AdminUserAction;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  onDone: () => void;
  isSaving: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("adminUsers.actionDialog");
  const copyKey = ACTION_COPY_KEY[action];

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError(t("reasonTooShort"));
      return;
    }

    try {
      setError(null);
      await onSubmit(trimmed);
      onDone();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          // Deliberate wording. The server abandons the change when it cannot audit it, so the
          // honest default is "nothing happened", not "this may have half-worked".
          t("genericError"),
        ),
      );
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(`${copyKey}.title`)}</DialogTitle>
        <DialogDescription>{t(`${copyKey}.description`)}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3">
        <div className="rounded-lg border border-hairline/60 px-3 py-2 text-[12px]">
          <p className="font-medium text-ink">{user.fullName}</p>
          <p className="mt-0.5 text-[11px] text-ink-subtle">{user.email}</p>
          {action === "revoke-sessions" ? (
            <p className="mt-1.5 text-[11px] text-ink-muted">
              {user.activeSessionCount === 0
                ? t("noSessionsOpen")
                : t("sessionsWillEnd", { count: user.activeSessionCount })}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="user-action-reason" className="text-[12px] text-ink-muted">
            {t("reasonLabel")}
          </Label>
          <Textarea
            id="user-action-reason"
            className="mt-1.5"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
          >
            <WarningCircle size={14} weight="duotone" className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("back")}
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={isSaving}>
          {isSaving ? t(`${copyKey}.pending`) : t(`${copyKey}.confirm`)}
        </Button>
      </DialogFooter>
    </>
  );
}
