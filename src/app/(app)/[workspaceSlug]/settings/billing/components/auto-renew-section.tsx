"use client";

/**
 * backend#466 — AUTO-RENEW MEANS RECURRING PAYMENT.
 *
 * A plan bought by card with auto-renew on is a Stripe Subscription: the saved card is charged at
 * every period end and the plan renews when Stripe says the charge went through. This is where the
 * owner sees that and controls it:
 *
 *   * `AutoRenewRow` — the toggle, the next charge (date and amount, as Stripe will charge it) and
 *     the card on file (brand and last four digits; the full number never reaches us).
 *   * `PaymentFailedBanner` — a renewal charge failed. The plan stays in force until the grace
 *     window ends; the banner says until when and opens Stripe's billing portal to replace the card.
 *
 * Turning auto-renew off never ends the paid period — Stripe's cancel_at_period_end — so the
 * confirmation copy says the plan runs to its end date rather than "cancel".
 */

import { CreditCard, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { apiErrorCode } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import type { RecurringBillingStatusDto } from "@/types/billing";

import { BannerRow, BillingButton, GridRow, Pill } from "./billing-primitives";

const AUTO_RENEW_REQUIRES_CHECKOUT = "BILLING_AUTO_RENEW_REQUIRES_CHECKOUT";

function day(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? format(date, "MMM d, yyyy") : "—";
}

/** One query for both surfaces, so the banner and the row can never disagree. */
export function useRecurringBilling(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["billing", "recurring", workspaceId],
    queryFn: () => billingService.getRecurringBilling(workspaceId as string),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
}

function useOpenBillingPortal(workspaceId: string) {
  const t = useTranslations("settingsBilling.autoRenew");
  return useMutation({
    mutationFn: () =>
      billingService.createBillingPortal(
        workspaceId,
        typeof window === "undefined" ? "/" : window.location.pathname,
      ),
    onSuccess: (url) => {
      window.location.assign(url);
    },
    onError: () => {
      toast.error(t("portalFailed"));
    },
  });
}

export function PaymentFailedBanner({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("settingsBilling.autoRenew");
  const { data } = useRecurringBilling(workspaceId);
  const portal = useOpenBillingPortal(workspaceId);

  if (!data?.paymentFailed) return null;

  return (
    <div role="alert" className="border-b border-amber-500/40 bg-amber-500/10">
      <BannerRow
        title={t("failedTitle")}
        badge={
          <Pill tone="accent">
            <span className="inline-flex items-center gap-1">
              <Warning className="h-3 w-3" />
              {t("failedBadge")}
            </span>
          </Pill>
        }
        description={t("failedDescription", { date: day(data.paymentGraceEndsAt) })}
        action={
          data.canManagePaymentMethod ? (
            <BillingButton
              tone="primary"
              className="w-auto px-4"
              disabled={portal.isPending}
              onClick={() => portal.mutate()}
            >
              {t("updateCard")}
            </BillingButton>
          ) : undefined
        }
      />
    </div>
  );
}

export function AutoRenewRow({
  workspaceId,
  plansHref,
}: {
  workspaceId: string;
  plansHref: string;
}) {
  const t = useTranslations("settingsBilling.autoRenew");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useRecurringBilling(workspaceId);
  const portal = useOpenBillingPortal(workspaceId);

  const toggle = useMutation({
    mutationFn: (autoRenew: boolean) => billingService.setAutoRenew(workspaceId, autoRenew),
    onSuccess: (_, autoRenew) => {
      toast.success(autoRenew ? t("turnedOn") : t("turnedOff", { date: day(data?.currentPeriodEnd) }));
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (error) => {
      toast.error(apiErrorCode(error) === AUTO_RENEW_REQUIRES_CHECKOUT ? t("requiresCheckout") : t("toggleFailed"));
    },
  });

  if (isLoading || isError || !data) return null;

  return (
    <GridRow className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{t("title")}</h3>
          <Pill tone={data.autoRenew ? "accent" : "muted"}>{data.autoRenew ? t("on") : t("off")}</Pill>
        </div>
        <p className="text-[12px] leading-relaxed text-ink-muted">
          <RenewalLine data={data} />
        </p>
        {data.card ? (
          <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <CreditCard className="h-3.5 w-3.5 shrink-0" />
            <span>
              {t("card", {
                brand: (data.card.brand ?? t("cardGeneric")).toUpperCase(),
                last4: data.card.last4,
              })}
              {data.card.expMonth && data.card.expYear
                ? ` · ${t("cardExpires", {
                    month: String(data.card.expMonth).padStart(2, "0"),
                    year: String(data.card.expYear).slice(-2),
                  })}`
                : null}
            </span>
          </p>
        ) : data.stripeUnavailable ? (
          <p className="text-[12px] text-ink-subtle">{t("cardUnavailable")}</p>
        ) : null}
        {data.autoRenewRequiresCheckout && !data.autoRenew ? (
          <p className="text-[12px] text-ink-subtle">
            {t("oneOffHint")}{" "}
            <Link href={plansHref} className="font-medium text-ink underline underline-offset-2">
              {t("choosePlan")}
            </Link>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {data.canManagePaymentMethod ? (
          <BillingButton
            tone="outline"
            className="w-auto px-3"
            disabled={portal.isPending}
            onClick={() => portal.mutate()}
          >
            {t("manageCard")}
          </BillingButton>
        ) : null}
        <Switch
          aria-label={t("title")}
          checked={data.autoRenew}
          disabled={toggle.isPending || (!data.autoRenew && data.autoRenewRequiresCheckout)}
          onCheckedChange={(checked) => toggle.mutate(checked)}
        />
      </div>
    </GridRow>
  );
}

function RenewalLine({ data }: { data: RecurringBillingStatusDto }) {
  const t = useTranslations("settingsBilling.autoRenew");
  if (!data.autoRenew) {
    return <>{t("endsOn", { date: day(data.currentPeriodEnd) })}</>;
  }
  if (data.renewalMode === "invoice") {
    return <>{t("invoiceNext", { date: day(data.nextChargeAt ?? data.currentPeriodEnd) })}</>;
  }
  if (data.nextChargeAmount != null) {
    return (
      <>
        {t("nextCharge", {
          amount: formatMoney(data.nextChargeAmount, data.nextChargeCurrency),
          date: day(data.nextChargeAt ?? data.currentPeriodEnd),
        })}
      </>
    );
  }
  return <>{t("renewsOn", { date: day(data.nextChargeAt ?? data.currentPeriodEnd) })}</>;
}
