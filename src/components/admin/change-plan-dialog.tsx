"use client";

/**
 * The admin plan swap (2026-08-17). Customers change plans through checkout; this is the
 * administrative move that must not require one. Two facts the dialog states out loud because
 * the endpoint enforces them: credits do not move (compensation is an explicit credit
 * adjustment with its own audit row), and a deactivated plan cannot be the target.
 */

import { useState } from "react";
import { Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";

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
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import { getErrorMessage } from "@/lib/api/errors";
import type { AdminSubscriptionSummaryDto } from "@/types/admin-subscription";

export function ChangePlanDialog({
  subscription,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  subscription: AdminSubscriptionSummaryDto | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (planId: string) => Promise<unknown>;
  isSaving: boolean;
}) {
  const open = subscription !== null;
  const plansQuery = useAdminPlans();
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the draft whenever the dialog targets a different subscription, during render.
  const session = subscription?.id ?? "";
  const [lastSession, setLastSession] = useState(session);
  if (session !== lastSession) {
    setLastSession(session);
    setPlanId("");
    setError(null);
  }

  // Only live catalogue entries: the server refuses a deactivated target, so offering one
  // would manufacture a 400 that reads as a fault.
  const plans = (plansQuery.data ?? []).filter((plan) => plan.isActive);
  const currentSlug = subscription?.planSlug ?? "";

  const handleConfirm = async () => {
    if (!planId) return;
    try {
      setError(null);
      await onSubmit(planId);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, "The plan could not be changed."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (isSaving ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Moves this workspace&rsquo;s subscription from{" "}
            <span className="font-medium text-ink">{subscription?.planName}</span> onto the plan
            you choose. The credit balance does not move with it — compensate separately with a
            credit adjustment if the change warrants one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="change-plan-target">New plan</Label>
          <select
            id="change-plan-target"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            disabled={isSaving || plansQuery.isPending}
            className="h-10 w-full rounded-md border border-hairline bg-surface-2 px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
          >
            <option value="">
              {plansQuery.isPending ? "Loading plans…" : "Choose a plan…"}
            </option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id} disabled={plan.slug === currentSlug}>
                {plan.name} — {formatAdminMoney({ amount: plan.price, currency: plan.currency })}/
                {plan.billingCycle}
                {plan.slug === currentSlug ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <WarningCircle size={16} weight="duotone" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button disabled={!planId || isSaving} onClick={() => void handleConfirm()}>
            {isSaving ? (
              <>
                <Spinner size={14} className="animate-spin" />
                Changing…
              </>
            ) : (
              "Change plan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
