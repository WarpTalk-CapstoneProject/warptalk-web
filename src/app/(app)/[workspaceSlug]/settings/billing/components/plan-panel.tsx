"use client";

/**
 * The plan, and what the plan actually entitles this workspace to.
 *
 * WHY THE ENTITLEMENTS ARE HERE AND NOT ONLY ON THE PRICING PAGE
 *   Billing showed a plan NAME and a price. Everything that name means — how many people can be
 *   in a room, how many languages, whether voice cloning and the assistant are switched on — lived
 *   only on `/payment/plans`, a page you go to in order to BUY. So the one surface where an owner
 *   asks "what am I paying for" was the one surface that could not answer, and diagnosing "why
 *   can't we add a ninth participant" meant reading a sales page.
 *
 * CANCELLATION IS STATED, NOT IMPLIED
 *   `cancelAtPeriodEnd` was on the wire and rendered nowhere on this page. A workspace whose
 *   translation stops in eleven days looked identical to one that renews, which is the single
 *   most expensive thing a billing page can get wrong.
 */

import Link from "next/link";
import { ArrowUpRight, Check, Minus, Warning } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { formatAmount, formatMoney } from "@/lib/format/currency";
import type { PlanDto, SubscriptionDto } from "@/types/billing";

function formatDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** A capability the plan either grants or withholds — rendered so both states are legible. */
function Entitlement({ label, granted }: { label: string; granted: boolean }) {
  return (
    <li className="flex items-center gap-2 text-[13px]">
      {granted ? (
        <Check weight="bold" className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Minus weight="bold" className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
      )}
      <span className={granted ? "text-ink" : "text-ink-subtle line-through"}>{label}</span>
    </li>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
}

export function PlanPanel({
  subscription,
  plan,
  plansHref,
}: {
  subscription: SubscriptionDto | null;
  /** The catalogue entry behind the subscription. Null while it loads, or if it was withdrawn. */
  plan: PlanDto | null;
  plansHref: string;
}) {
  const t = useTranslations("settingsBilling");
  const cancelling = subscription?.cancelAtPeriodEnd === true;
  const isYearly =
    plan?.billingCycle?.toLowerCase() === "yearly" || plan?.billingCycle?.toLowerCase() === "year";

  return (
    // WT-430 (Linear): overflow-clip, not overflow-hidden — same corner clipping for the child
    // hairlines, but no scroll container, so the "Change" control (and any menu later anchored
    // to this header) cannot be sheared off at the card edge.
    <section className="overflow-clip rounded-[14px] border border-border bg-surface-1">
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] text-ink-muted">{t("planPanel.currentPlan")}</p>
          <p className="mt-1 truncate text-[18px] font-semibold leading-tight text-ink">
            {subscription?.planName ?? t("planPanel.noPlan")}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {subscription
              ? // WT-459: from the PLAN, because SubscriptionDto carries a price with no
                // currency beside it. `plan` is already in scope for the billing cycle below,
                // and formatMoney falls back to VND when it is absent — so a workspace whose
                // plan has not loaded yet reads exactly as it did before.
                t(isYearly ? "planPanel.pricePerYear" : "planPanel.pricePerMonth", {
                  price: formatMoney(subscription.price, plan?.currency),
                })
              : t("planPanel.noBalance")}
          </p>
        </div>
        <Link
          href={plansHref}
          className="inline-flex h-[28px] shrink-0 items-center gap-1 rounded-full border border-border px-3 text-[12px] font-medium text-ink transition hover:bg-surface-2"
        >
          {subscription ? t("planPanel.change") : t("planPanel.choose")}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {subscription ? (
        <div className="space-y-2.5 border-b border-hairline px-4 py-3.5">
          <Limit label={t("planPanel.creditsPerCycle")} value={(formatAmount(plan?.creditsPerCycle ?? 0))} />
          <Limit
            label={t("planPanel.participantsPerMeeting")}
            value={plan ? String(plan.maxParticipants) : "—"}
          />
          <Limit label={t("planPanel.languagesPerMeeting")} value={plan ? String(plan.maxLanguages) : "—"} />
          <Limit
            label={t("planPanel.cycle")}
            value={`${formatDay(subscription.currentPeriodStart)} → ${formatDay(subscription.currentPeriodEnd)}`}
          />
        </div>
      ) : null}

      {plan ? (
        <ul className="space-y-2 border-b border-hairline px-4 py-3.5">
          <Entitlement label={t("capabilities.voiceCloning")} granted={plan.voiceCloneEnabled} />
          <Entitlement label={t("capabilities.aiAssistant")} granted={plan.aiAssistantEnabled} />
          <Entitlement label={t("capabilities.customGlossary")} granted={plan.glossaryEnabled} />
          <Entitlement label={t("capabilities.dedicatedGpu")} granted={plan.dedicatedGpu} />
        </ul>
      ) : null}

      {subscription ? (
        <div className="px-4 py-3">
          {cancelling ? (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-500">
              <Warning className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                {t("planPanel.cancelled", { date: formatDay(subscription.currentPeriodEnd) })}
              </span>
            </p>
          ) : (
            <p className="text-[12px] text-ink-muted">
              {subscription.autoRenew
                ? t("planPanel.renewsAutomatically", { date: formatDay(subscription.currentPeriodEnd) })
                : t("planPanel.doesNotAutoRenew", { date: formatDay(subscription.currentPeriodEnd) })}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
