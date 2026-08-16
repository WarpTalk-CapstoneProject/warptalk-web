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

const COPY: Record<
  AdminUserAction,
  { title: string; description: string; confirm: string; pending: string }
> = {
  "revoke-sessions": {
    title: "End every session?",
    description:
      "Signs the account out everywhere. It is not locked and the password is unchanged — the person can sign in again immediately.",
    confirm: "End sessions",
    pending: "Ending…",
  },
  deactivate: {
    title: "Deactivate this account?",
    description:
      "The person cannot sign in, and the sessions already open are ended. Nothing is deleted and this can be undone.",
    confirm: "Deactivate",
    pending: "Deactivating…",
  },
  reactivate: {
    title: "Reactivate this account?",
    description:
      "Sign-in is allowed again. Sessions ended earlier stay ended — the person signs in fresh.",
    confirm: "Reactivate",
    pending: "Reactivating…",
  },
  unlock: {
    title: "Clear the lockout?",
    description:
      "Removes a failed-login lockout and resets the attempt counter, so the person can try again now instead of waiting out the window.",
    confirm: "Unlock",
    pending: "Unlocking…",
  },
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
  const copy = COPY[action];

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError("Give a reason of at least ten characters. It goes into the platform audit log.");
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
          "Nothing was changed — the action could not be completed.",
        ),
      );
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3">
        <div className="rounded-lg border border-hairline/60 px-3 py-2 text-[12px]">
          <p className="font-medium text-ink">{user.fullName}</p>
          <p className="mt-0.5 text-[11px] text-ink-subtle">{user.email}</p>
          {action === "revoke-sessions" ? (
            <p className="mt-1.5 text-[11px] text-ink-muted">
              {user.activeSessionCount === 0
                ? "No sessions are open right now."
                : `${user.activeSessionCount} session${user.activeSessionCount === 1 ? "" : "s"} will end.`}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="user-action-reason" className="text-[12px] text-ink-muted">
            Reason
          </Label>
          <Textarea
            id="user-action-reason"
            className="mt-1.5"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Recorded in the platform audit log against your account."
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
          Back
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={isSaving}>
          {isSaving ? copy.pending : copy.confirm}
        </Button>
      </DialogFooter>
    </>
  );
}
