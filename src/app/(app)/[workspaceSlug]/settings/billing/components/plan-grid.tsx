"use client";

/**
 * The plan ladder, laid out as columns rather than as a scrolling list of cards.
 *
 * WHY COLUMNS. A plan is only meaningful next to the plans on either side of it — "8M credits" is
 * a number, "8M where Startup gives 1.25M" is an argument. Stacked cards make that comparison a
 * scroll, and the previous layout also forced the reader past a top-up form to reach the ladder
 * at all.
 *
 * WHAT EACH COLUMN SAYS, IN ORDER: the name, the price, the one action available on it, and the
 * two quantities that vary most between tiers. What the tier includes sits behind a "See more"
 * disclosure (closed by default), so a column is short enough to read across and the capability
 * list is one click away rather than one scroll away. Inside it, the "Everything in X, plus" line
 * is doing real work — without it every column has to repeat the previous column's list, and the
 * differences stop being visible.
 *
 * ONE PLAN IS A NORMAL CASE. Production publishes a single plan today, so there is no
 * "collapsed/expanded" comparison mode to toggle: the ladder is simply as many columns as there
 * are plans, and one column spans the pane. The disclosure is per plan for the same reason.
 *
 * NOT A BOX. The ladder is a pane of the Billing page's ruled grid, so it draws no border or
 * radius of its own: its columns are split by the same 1px hairlines that split the page's rows.
 * The pane sits beside the Extras panel from 1000px, so the wide breakpoint is `2xl`, not `xl`:
 * four columns are only comfortable when the pane itself is roughly a thousand pixels wide.
 *
 * MONTHLY / YEARLY. The header carries the same two-way choice the payment page offers, and prices
 * go through the same two functions that page uses (`monthlyDisplayPrice` for the headline,
 * `checkoutTotal` for "Billed yearly: X"), so this grid can never quote a figure the checkout
 * will not charge. The saving in the label is derived from `YEARLY_PRICE_MULTIPLIER`, not typed.
 *
 * MOTION: hover and current-plan tints ease over ~180ms under `motion-safe:` only.
 *
 * No shadows: see billing-primitives.
 */

import { CaretRight, Check } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { formatAmount, formatMoney } from "@/lib/format/currency";
import {
  YEARLY_PRICE_MULTIPLIER,
  checkoutTotal,
  monthlyDisplayPrice,
  type BillingInterval,
} from "@/lib/billing/plan-pricing";
import { cn } from "@/lib/utils";
import type { PlanDto } from "@/types/billing";

import { BillingButton, Pill } from "./billing-primitives";

type BillingT = ReturnType<typeof useTranslations>;

/** The capabilities a tier can add. Order is fixed so columns line up down the grid. */
const CAPABILITY_KEYS: { key: keyof PlanDto; labelKey: string }[] = [
  { key: "voiceCloneEnabled", labelKey: "capabilities.voiceCloning" },
  { key: "aiAssistantEnabled", labelKey: "capabilities.aiAssistant" },
  { key: "glossaryEnabled", labelKey: "capabilities.customGlossary" },
  { key: "dedicatedGpu", labelKey: "capabilities.dedicatedGpu" },
];

function capabilitiesOf(plan: PlanDto, t: BillingT): string[] {
  return CAPABILITY_KEYS.filter(({ key }) => plan[key] === true).map(({ labelKey }) => t(labelKey));
}

/** Per-cycle price rendered the way a price is read: amount large, unit small. */
function PriceLine({ plan, interval }: { plan: PlanDto; interval: BillingInterval }) {
  const t = useTranslations("settingsBilling");
  const cycle = (plan.billingCycle ?? "").toLowerCase();
  const pricedYearly = cycle === "yearly" || cycle === "year" || cycle === "annual";
  const unit = pricedYearly ? "/yr" : cycle === "semiannual" ? "/6mo" : "/mo";
  const price = monthlyDisplayPrice(plan, interval);
  // A plan already priced per year has no monthly figure to discount (monthlyDisplayPrice leaves
  // it alone), so "billed yearly: price x 12 x 0.79" would be a number nobody is charged.
  const showsYearlyTotal = interval === "yearly" && price > 0 && !pricedYearly;

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-1">
        <span className="text-[22px] font-semibold leading-none tabular-nums text-ink">
          {formatMoney(price, plan.currency)}
        </span>
        {price > 0 ? <span className="text-[12px] text-ink-muted">{unit}</span> : null}
      </p>
      {showsYearlyTotal ? (
        <p className="mt-1 text-[11px] tabular-nums text-ink-muted">
          {t("planGrid.billedYearly", {
            total: formatMoney(checkoutTotal(plan, "yearly"), plan.currency),
          })}
        </p>
      ) : null}
    </div>
  );
}

function CapabilityLine({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
      <Check weight="bold" className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
      {label}
    </p>
  );
}

export function PlanGrid({
  plans,
  currentPlanId,
  onSelect,
  interval = "monthly",
  onIntervalChange,
}: {
  /** Active plans, cheapest first. Sorting is the caller's job — it owns `sortOrder`. */
  plans: PlanDto[];
  currentPlanId: string | null;
  onSelect: (plan: PlanDto) => void;
  /** The billing period being quoted. Controlled by the page, which also hands it to checkout. */
  interval?: BillingInterval;
  /** When given, the header offers the Monthly / Yearly choice. */
  onIntervalChange?: (interval: BillingInterval) => void;
}) {
  const t = useTranslations("settingsBilling");
  const yearlySavingPercent = Math.round((1 - YEARLY_PRICE_MULTIPLIER) * 100);
  const currentIndex = plans.findIndex((plan) => plan.id === currentPlanId);

  // The most expensive plan carries the badge. Not a hardcoded slug: the ladder is administered
  // through the admin plans screen, and a badge pinned to a slug would follow a plan that had been
  // renamed or withdrawn.
  const highlightedId = plans.length > 0 ? plans[plans.length - 1].id : null;

  // Columns per breakpoint, never more than there are plans. Each cell rules its own left edge
  // when it is not first in its line, and its top edge when it is not in the first line — so a
  // wrapped ladder stays ruled without doubling any hairline.
  const smCols = Math.min(plans.length, 2);
  const wideCols = Math.min(plans.length, 4);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3.5 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold leading-tight text-ink">{t("planGrid.title")}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
            {t("planGrid.description")}
          </p>
        </div>
        {onIntervalChange ? (
          <div
            role="group"
            aria-label={t("planGrid.interval.ariaLabel")}
            className="inline-flex shrink-0 overflow-hidden rounded-[8px] border border-hairline bg-surface-1"
          >
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => onIntervalChange(value)}
                className={cn(
                  "h-7 cursor-pointer border-r border-hairline px-3 text-[12px] font-medium whitespace-nowrap outline-none last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-safe:transition-colors motion-safe:duration-150",
                  interval === value
                    ? "bg-surface-3 text-ink"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {value === "yearly"
                  ? t("planGrid.interval.yearly", { percent: yearlySavingPercent })
                  : t("planGrid.interval.monthly")}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          "grid min-w-0 grid-cols-1",
          plans.length >= 2 && "sm:grid-cols-2",
          plans.length === 3 && "2xl:grid-cols-3",
          plans.length >= 4 && "2xl:grid-cols-4",
        )}
      >
        {plans.map((plan, index) => {
          const isCurrent = plan.id === currentPlanId;
          // "Covered by current plan" — a tier at or below the one being paid for. Distinct from
          // the current plan itself, and from an upgrade, because all three want different words.
          const isCovered = currentIndex >= 0 && index < currentIndex;
          const previous = index > 0 ? plans[index - 1] : null;
          const own = capabilitiesOf(plan, t);
          const added = own.filter(
            (capability) => !previous || !capabilitiesOf(previous, t).includes(capability),
          );

          return (
            <div
              key={plan.id}
              className={cn(
                "flex min-w-0 flex-col gap-3 border-hairline px-4 py-[18px] sm:px-6",
                "motion-safe:transition-colors motion-safe:duration-[180ms]",
                isCurrent ? "bg-primary/[0.09]" : "hover:bg-primary/[0.06]",
                // Rules between columns, never around them: the page grid is the one object.
                index > 0 && "border-t",
                index % smCols !== 0 ? "sm:border-l" : "sm:border-l-0",
                index >= smCols ? "sm:border-t" : "sm:border-t-0",
                index % wideCols !== 0 ? "2xl:border-l" : "2xl:border-l-0",
                index >= wideCols ? "2xl:border-t" : "2xl:border-t-0",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-semibold text-ink">{plan.name}</h3>
                {isCurrent ? <Pill tone="accent">{t("planGrid.yourPlan")}</Pill> : null}
                {plan.id === highlightedId ? (
                  <Pill tone="accent">{t("planGrid.mostPopular")}</Pill>
                ) : null}
              </div>

              <PriceLine plan={plan} interval={interval} />

              {isCurrent ? (
                <BillingButton tone="quiet">{t("planGrid.currentPlan")}</BillingButton>
              ) : isCovered ? (
                <BillingButton tone="quiet">{t("planGrid.coveredByCurrentPlan")}</BillingButton>
              ) : (
                <BillingButton
                  tone={plan.id === highlightedId ? "primary" : "outline"}
                  onClick={() => onSelect(plan)}
                >
                  {currentIndex >= 0 ? t("planGrid.upgrade") : t("planGrid.choose")}
                </BillingButton>
              )}

              <div className="space-y-1">
                <p className="text-[12px] tabular-nums text-ink-muted">
                  {t("planGrid.creditsPerCycle", { credits: formatAmount(plan.creditsPerCycle) })}
                </p>
                <p className="text-[12px] tabular-nums text-ink-muted">
                  {t("planGrid.limits", {
                    participants: plan.maxParticipants,
                    languages: plan.maxLanguages,
                  })}
                </p>
              </div>

              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-[12px] font-medium text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:transition-colors motion-safe:duration-150 [&::-webkit-details-marker]:hidden">
                  <CaretRight
                    weight="bold"
                    className="h-3 w-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90"
                  />
                  {t("planGrid.seeMore")}
                </summary>
                <div className="mt-2 space-y-1.5">
                  {previous ? (
                    <p className="text-[12px] text-ink">
                      {t("planGrid.everythingInPlus", { name: previous.name })}
                    </p>
                  ) : null}
                  {added.length > 0 ? (
                    added.map((capability) => <CapabilityLine key={capability} label={capability} />)
                  ) : previous ? (
                    <p className="text-[12px] text-ink-subtle">{t("planGrid.moreCreditsAndLimits")}</p>
                  ) : own.length > 0 ? (
                    own.map((capability) => <CapabilityLine key={capability} label={capability} />)
                  ) : (
                    <p className="text-[12px] text-ink-muted">{t("planGrid.coreTranslation")}</p>
                  )}
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
