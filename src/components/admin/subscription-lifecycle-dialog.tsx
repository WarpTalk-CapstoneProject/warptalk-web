"use client";

/**
 * Cancelling a workspace's subscription, or undoing a cancellation.
 *
 * Both go through the ordinary `SubscriptionService` endpoints rather than an admin-only route.
 * That is what makes cancelling here the SAME act a workspace owner performs: Stripe is cancelled,
 * entitlements are republished, and the owner is notified. An admin-only shortcut would have
 * skipped at least one of those and nobody would have found out until a customer kept being
 * charged.
 *
 * The reason is required by this dialog even though the endpoint takes it as optional. It is
 * stored on the subscription and it is the only record of why somebody at WarpTalk reached into a
 * customer's billing.
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
import type { AdminSubscriptionSummaryDto } from "@/types/admin-subscription";

export type SubscriptionLifecycleAction = "cancel" | "resume";

const COPY: Record<
  SubscriptionLifecycleAction,
  { title: string; description: string; confirm: string; pending: string }
> = {
  cancel: {
    title: "Cancel this subscription?",
    description:
      "The Stripe subscription is cancelled, entitlements are republished and the workspace owner is notified. A trial ends immediately; a paid subscription runs to the end of its period.",
    confirm: "Cancel subscription",
    pending: "Cancelling…",
  },
  resume: {
    title: "Resume this subscription?",
    description:
      "Undoes a cancellation that has not taken effect yet. Billing continues on the existing period.",
    confirm: "Resume subscription",
    pending: "Resuming…",
  },
};

export function SubscriptionLifecycleDialog({
  subscription,
  action,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  /** Null while closed. */
  subscription: AdminSubscriptionSummaryDto | null;
  action: SubscriptionLifecycleAction;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<unknown>;
  isSaving: boolean;
}) {
  return (
    <Dialog open={subscription !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-md">
        {subscription ? (
          <LifecycleForm
            key={`${subscription.id}:${action}`}
            subscription={subscription}
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

function LifecycleForm({
  subscription,
  action,
  onCancel,
  onSubmit,
  onDone,
  isSaving,
}: {
  subscription: AdminSubscriptionSummaryDto;
  action: SubscriptionLifecycleAction;
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
      setError("Give a reason of at least ten characters. It is the only record of why.");
      return;
    }

    try {
      setError(null);
      await onSubmit(trimmed);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "The subscription could not be updated."));
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
          <p className="font-medium text-ink">{subscription.planName}</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">
            workspace {subscription.workspaceId}
          </p>
        </div>

        <div>
          <Label htmlFor="lifecycle-reason" className="text-[12px] text-ink-muted">
            Reason
          </Label>
          <Textarea
            id="lifecycle-reason"
            className="mt-1.5"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Recorded on the subscription."
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
