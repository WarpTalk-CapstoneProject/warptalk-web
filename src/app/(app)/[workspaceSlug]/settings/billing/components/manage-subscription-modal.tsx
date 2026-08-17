"use client";

/**
 * Everything about the subscription that is a SETTING rather than a number, in one place.
 *
 * Before this, the facts lived on the billing page as read-only text and the actions lived on
 * `/payment/plans` — so "what am I on" and "change it" were two different screens, and cancelling
 * had no home at all. This is the one surface that answers both.
 *
 * Deliberately NOT a plan picker. Choosing a different plan is a purchase and goes through
 * Stripe Checkout on the plans page; this modal offers the state changes that do not: overages
 * on/off, cancel, and the read-only terms of the current cycle.
 *
 * No shadow anywhere — see billing-primitives. `DialogContent` ships its own, so it is overridden
 * explicitly rather than merely left unset.
 */

import { ArrowSquareOut, CaretDown } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/api/errors";
import { formatAmount, formatMoney } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import type { PlanDto, SubscriptionDto } from "@/types/billing";

import { BillingButton, Pill, Row, RowGroup, Section } from "./billing-primitives";

function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return format(date, "MMM d, yyyy");
}

/** "monthly" | "year" | … → the noun a person reads. Both vocabularies exist on the wire. */
function billingCycleLabel(cycle: string | null | undefined): string {
  const value = (cycle ?? "").toLowerCase();
  if (value === "yearly" || value === "year" || value === "annual") return "Yearly";
  if (value === "semiannual") return "Semiannual";
  if (value === "monthly" || value === "month") return "Monthly";
  return "—";
}

export function ManageSubscriptionModal({
  open,
  onOpenChange,
  workspaceId,
  workspaceSlug,
  subscription,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceSlug: string;
  subscription: SubscriptionDto | null;
  plan: PlanDto | null;
}) {
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const { data: overage, isLoading: isOverageLoading } = useQuery({
    queryKey: ["billing", "overage", workspaceId],
    queryFn: () => billingService.getOverageSetting(workspaceId),
    enabled: !!workspaceId && open,
    retry: 1,
  });

  const overageMutation = useMutation({
    mutationFn: (enabled: boolean) => billingService.setOverage(workspaceId, enabled),
    onSuccess: (next) => {
      queryClient.setQueryData(["billing", "overage", workspaceId], next);
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      toast.success(
        next.enabled
          ? "Meetings will keep running past zero credits, up to the plan's cap."
          : "Meetings will stop when the credits run out.",
      );
    },
    // The server refuses `true` on a plan with no overage allowance rather than accepting it as a
    // no-op, so its own words are the useful message.
    onError: (error) =>
      toast.error(getErrorMessage(error, "Could not change the overage setting.")),
  });

  const cancelMutation = useMutation({
    mutationFn: () => billingService.cancelSubscription(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      setConfirmingCancel(false);
      onOpenChange(false);
      toast.success("Subscription cancelled. It stays active until the period ends.");
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Could not cancel the subscription.")),
  });

  const cancelling = subscription?.cancelAtPeriodEnd === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-[14px] border-border bg-surface-1 p-0 shadow-none">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-[16px] font-semibold text-ink">
            Manage subscription
          </DialogTitle>
          <DialogDescription className="sr-only">
            The current plan, its cycle, and the settings that change it.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5">
          <Section className="bg-surface-2/40">
            <RowGroup>
              <Row label="Current plan" value={subscription?.planName ?? "No active plan"} />
              <Row label="Plan type" value={billingCycleLabel(plan?.billingCycle)} />
              <Row
                label="Overage credits used"
                value={
                  isOverageLoading
                    ? "…"
                    : formatAmount(overage?.overageCreditsThisCycle ?? 0)
                }
                hint={
                  overage && overage.effectiveCapCredits > 0
                    ? `Capped at ${formatAmount(overage.effectiveCapCredits)} this cycle`
                    : undefined
                }
              />
              <Row
                label="Next credit refresh"
                value={formatDay(subscription?.currentPeriodEnd)}
              />
              <Row
                label="Next billing date"
                value={cancelling ? "—" : formatDay(subscription?.currentPeriodEnd)}
                hint={cancelling ? "Cancelled — this plan will not renew" : undefined}
              />
              <Row
                label="Next payment amount"
                value={
                  cancelling
                    ? formatMoney(0, plan?.currency)
                    : subscription
                      ? formatMoney(subscription.price, plan?.currency)
                      : "—"
                }
              />
            </RowGroup>
          </Section>

          <div className="mt-4 divide-y divide-hairline border-t border-hairline">
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-ink">Enable overages</span>
                <Pill tone="accent">Recommended</Pill>
              </div>
              <Switch
                checked={overage?.enabled ?? false}
                disabled={isOverageLoading || overageMutation.isPending || !subscription}
                onCheckedChange={(checked) => overageMutation.mutate(checked)}
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="text-[13px] text-ink">Modify plan</span>
              <div className="flex items-center gap-2">
                <Link href={`/${workspaceSlug}/payment/plans`} className="shrink-0">
                  <BillingButton tone="outline" className="w-auto">
                    Change plan
                    <CaretDown className="h-3 w-3" />
                  </BillingButton>
                </Link>
                {/* Cancel asks twice, in place. A confirm dialog stacked on a dialog is worse:
                    the thing being cancelled leaves the screen at the moment of decision. */}
                {confirmingCancel ? (
                  <BillingButton
                    tone="outline"
                    className="w-auto border-destructive/40 text-destructive hover:bg-destructive/5"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate()}
                  >
                    {cancelMutation.isPending ? "Cancelling…" : "Confirm cancel"}
                  </BillingButton>
                ) : (
                  <BillingButton
                    tone="outline"
                    className="w-auto"
                    disabled={!subscription || cancelling}
                    onClick={() => setConfirmingCancel(true)}
                  >
                    {cancelling ? "Cancelled" : "Cancel plan"}
                  </BillingButton>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="text-[13px] text-ink">Manage payments</span>
              <Link
                href={`/${workspaceSlug}/settings/billing/invoices`}
                className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
                onClick={() => onOpenChange(false)}
              >
                Invoices
                <ArrowSquareOut className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {cancelling && subscription ? (
            <p className="mt-4 text-[12px] text-amber-500">
              Translation stops for this workspace on{" "}
              {formatDay(subscription.currentPeriodEnd)}.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
