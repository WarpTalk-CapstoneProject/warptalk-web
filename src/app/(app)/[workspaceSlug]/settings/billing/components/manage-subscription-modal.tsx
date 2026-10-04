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
 * on/off, stopping or resuming renewal, and the read-only terms of the current cycle.
 *
 * WT-878 — "CANCEL" IS AUTO-RENEW OFF.
 *   Cancel used to call `DELETE /subscriptions/workspace/{id}` and resume `POST …/reactivate`.
 *   The first sets the row to cancelled at once, so entitlements dropped mid-period for a period
 *   already paid for, and it could take add-on Stripe subscriptions down with it; the second never
 *   told Stripe, so a "resumed" card plan still would not charge. Both now go through
 *   `PUT /auto-renew` — the same call as the Auto-renew row on the page, with the same toasts and
 *   the same query keys — so the plan always runs to its period end and Stripe's
 *   cancel_at_period_end moves with it.
 *
 * No shadow anywhere — see billing-primitives. `DialogContent` ships its own, so it is overridden
 * explicitly rather than merely left unset.
 */

import { ArrowSquareOut, CaretDown } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { formatAmount, formatMoney } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import type { PlanDto, SubscriptionDto } from "@/types/billing";

import { useRecurringBilling } from "./auto-renew-section";
import { BillingButton, Pill, Row, RowGroup, Section } from "./billing-primitives";

/** The server's answer when auto-renew cannot go on without a card — see auto-renew-section. */
const AUTO_RENEW_REQUIRES_CHECKOUT = "BILLING_AUTO_RENEW_REQUIRES_CHECKOUT";

function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return format(date, "MMM d, yyyy");
}

type BillingT = ReturnType<typeof useTranslations>;

/** "monthly" | "year" | … → the noun a person reads. Both vocabularies exist on the wire. */
function billingCycleLabel(cycle: string | null | undefined, t: BillingT): string {
  const value = (cycle ?? "").toLowerCase();
  if (value === "yearly" || value === "year" || value === "annual") return t("manageModal.billingCycle.yearly");
  if (value === "semiannual") return t("manageModal.billingCycle.semiannual");
  if (value === "monthly" || value === "month") return t("manageModal.billingCycle.monthly");
  return t("manageModal.billingCycle.unknown");
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
  const t = useTranslations("settingsBilling");
  const tAutoRenew = useTranslations("settingsBilling.autoRenew");
  const queryClient = useQueryClient();
  const router = useRouter();
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
          ? t("manageModal.toasts.overageOn")
          : t("manageModal.toasts.overageOff"),
      );
    },
    // The server refuses `true` on a plan with no overage allowance rather than accepting it as a
    // no-op, so its own words are the useful message.
    onError: (error) =>
      toast.error(getErrorMessage(error, t("manageModal.toasts.overageFailed"))),
  });

  const { data: recurring } = useRecurringBilling(workspaceId || undefined);
  const plansHref = `/${workspaceSlug}/payment/plans`;

  /**
   * Stop or resume renewal — never end the paid period. Same call, toasts and invalidation as
   * `AutoRenewRow`, so the two controls cannot disagree about what "off" means.
   *
   * WT-471 still holds: a plan that will not renew has a way back from here. When the server says
   * that way needs a card (a plan paid once), the reader is sent to the plans page to choose it
   * again with auto-renew on.
   */
  const renewalMutation = useMutation({
    mutationFn: (autoRenew: boolean) => billingService.setAutoRenew(workspaceId, autoRenew),
    onSuccess: (_, autoRenew) => {
      setConfirmingCancel(false);
      toast.success(
        autoRenew
          ? tAutoRenew("turnedOn")
          : tAutoRenew("turnedOff", {
              date: formatDay(recurring?.currentPeriodEnd ?? subscription?.currentPeriodEnd),
            }),
      );
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
      if (!autoRenew) onOpenChange(false);
    },
    onError: (error) => {
      if (apiErrorCode(error) === AUTO_RENEW_REQUIRES_CHECKOUT) {
        toast.error(tAutoRenew("requiresCheckout"));
        onOpenChange(false);
        router.push(plansHref);
        return;
      }
      toast.error(tAutoRenew("toggleFailed"));
    },
  });

  // Renewal state from the same query the Auto-renew row reads; the subscription's own flags only
  // until that answers.
  const cancelling = recurring
    ? !recurring.autoRenew
    : subscription?.cancelAtPeriodEnd === true || subscription?.autoRenew === false;
  const resumeNeedsCheckout = cancelling && recurring?.autoRenewRequiresCheckout === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-[14px] border-border bg-surface-1 p-0 shadow-none">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-[16px] font-semibold text-ink">
            {t("manageModal.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("manageModal.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5">
          <Section className="bg-surface-2/40">
            <RowGroup>
              <Row label={t("manageModal.currentPlan")} value={subscription?.planName ?? t("manageModal.noPlan")} />
              <Row label={t("manageModal.planType")} value={billingCycleLabel(plan?.billingCycle, t)} />
              <Row
                label={t("manageModal.overageCreditsUsed")}
                value={
                  isOverageLoading
                    ? "…"
                    : formatAmount(overage?.overageCreditsThisCycle ?? 0)
                }
                hint={
                  overage && overage.effectiveCapCredits > 0
                    ? t("manageModal.cappedThisCycle", { cap: formatAmount(overage.effectiveCapCredits) })
                    : undefined
                }
              />
              <Row
                label={t("manageModal.nextCreditRefresh")}
                value={formatDay(subscription?.currentPeriodEnd)}
              />
              <Row
                label={t("manageModal.nextBillingDate")}
                value={cancelling ? "—" : formatDay(subscription?.currentPeriodEnd)}
                hint={cancelling ? t("manageModal.cancelledNoRenew") : undefined}
              />
              <Row
                label={t("manageModal.nextPaymentAmount")}
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
                <span className="text-[13px] text-ink">{t("manageModal.enableOverages")}</span>
                <Pill tone="accent">{t("manageModal.recommended")}</Pill>
              </div>
              <Switch
                checked={overage?.enabled ?? false}
                disabled={isOverageLoading || overageMutation.isPending || !subscription}
                onCheckedChange={(checked) => overageMutation.mutate(checked)}
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="text-[13px] text-ink">{t("manageModal.modifyPlan")}</span>
              <div className="flex items-center gap-2">
                <Link href={plansHref} className="shrink-0">
                  <BillingButton tone="outline" className="w-auto">
                    {t("manageModal.changePlan")}
                    <CaretDown className="h-3 w-3" />
                  </BillingButton>
                </Link>
                {/* Cancel asks twice, in place. A confirm dialog stacked on a dialog is worse:
                    the thing being cancelled leaves the screen at the moment of decision. */}
                {/* A plan that will not renew offers the reverse, not a dead "Cancelled" label.
                    That label was the whole problem: it stated the state and gave no way out. */}
                {/* A plan paid once has no card to renew with: resuming it is a new checkout. */}
                {resumeNeedsCheckout ? (
                  <Link href={plansHref} className="shrink-0" onClick={() => onOpenChange(false)}>
                    <BillingButton tone="primary" className="w-auto">
                      {tAutoRenew("choosePlan")}
                    </BillingButton>
                  </Link>
                ) : cancelling ? (
                  <BillingButton
                    tone="primary"
                    className="w-auto"
                    disabled={renewalMutation.isPending || !subscription}
                    onClick={() => renewalMutation.mutate(true)}
                  >
                    {renewalMutation.isPending ? t("manageModal.reactivating") : t("manageModal.resubscribe")}
                  </BillingButton>
                ) : confirmingCancel ? (
                  <BillingButton
                    tone="outline"
                    className="w-auto border-destructive/40 text-destructive hover:bg-destructive/5"
                    disabled={renewalMutation.isPending}
                    onClick={() => renewalMutation.mutate(false)}
                  >
                    {renewalMutation.isPending ? t("manageModal.cancelling") : t("manageModal.confirmCancel")}
                  </BillingButton>
                ) : (
                  <BillingButton
                    tone="outline"
                    className="w-auto"
                    disabled={!subscription}
                    onClick={() => setConfirmingCancel(true)}
                  >
                    {t("manageModal.cancelPlan")}
                  </BillingButton>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className="text-[13px] text-ink">{t("manageModal.managePayments")}</span>
              <Link
                href={`/${workspaceSlug}/settings/billing/invoices`}
                className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
                onClick={() => onOpenChange(false)}
              >
                {t("manageModal.invoices")}
                <ArrowSquareOut className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {cancelling && subscription ? (
            <p className="mt-4 text-[12px] text-amber-500">
              {t("manageModal.cancelledNotice", {
                date: formatDay(recurring?.currentPeriodEnd ?? subscription.currentPeriodEnd),
              })}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
