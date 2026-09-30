"use client";

/**
 * The plan ladder, laid out as columns rather than as a scrolling list of cards.
 *
 * WHY COLUMNS. A plan is only meaningful next to the plans on either side of it — "8M credits" is
 * a number, "8M where Startup gives 1.25M" is an argument. Stacked cards make that comparison a
 * scroll, and the previous layout also forced the reader past a top-up form to reach the ladder
 * at all.
 *
 * WHAT EACH COLUMN SAYS, IN ORDER: the name, the price, the one action available on it, the two
 * quantities that vary most between tiers, then what this tier adds over the one before it. The
 * "Everything in X, plus" line is doing real work — without it every column has to repeat the
 * previous column's list, and the differences stop being visible.
 *
 * NOT A BOX. The ladder is the last row of the Billing page's ruled grid, so it draws no border or
 * radius of its own: its columns are split by the same 1px hairlines that split the page's rows.
 * Column count follows the plan count and caps at 1 / 2 / 4 (phone / sm / xl), so a ladder of one
 * — production today, Enterprise only — spans the width instead of leaving three empty columns.
 *
 * No shadows: see billing-primitives.
 */

import { Check } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { formatAmount, formatMoney } from "@/lib/format/currency";
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
function PriceLine({ plan }: { plan: PlanDto }) {
  const cycle = (plan.billingCycle ?? "").toLowerCase();
  const unit =
    cycle === "yearly" || cycle === "year" || cycle === "annual"
      ? "/yr"
      : cycle === "semiannual"
        ? "/6mo"
        : "/mo";

  return (
    <p className="flex items-baseline gap-1">
      <span className="text-[26px] font-semibold leading-none tabular-nums text-ink">
        {formatMoney(plan.price, plan.currency)}
      </span>
      {plan.price > 0 ? (
        <span className="text-[13px] text-ink-muted">{unit}</span>
      ) : null}
    </p>
  );
}

export function PlanGrid({
  plans,
  currentPlanId,
  onSelect,
}: {
  /** Active plans, cheapest first. Sorting is the caller's job — it owns `sortOrder`. */
  plans: PlanDto[];
  currentPlanId: string | null;
  onSelect: (plan: PlanDto) => void;
}) {
  const t = useTranslations("settingsBilling");
  const currentIndex = plans.findIndex((plan) => plan.id === currentPlanId);

  // The most expensive plan carries the badge. Not a hardcoded slug: the ladder is administered
  // through the admin plans screen, and a badge pinned to a slug would follow a plan that had been
  // renamed or withdrawn.
  const highlightedId = plans.length > 0 ? plans[plans.length - 1].id : null;

  // Columns per breakpoint, never more than there are plans. Each cell rules its own left edge
  // when it is not first in its line, and its top edge when it is not in the first line — so a
  // wrapped ladder stays ruled without doubling any hairline.
  const smCols = Math.min(plans.length, 2);
  const xlCols = Math.min(plans.length, 4);

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1",
        plans.length >= 2 && "sm:grid-cols-2",
        plans.length === 3 && "xl:grid-cols-3",
        plans.length >= 4 && "xl:grid-cols-4",
      )}
    >
      {plans.map((plan, index) => {
        const isCurrent = plan.id === currentPlanId;
        // "Covered by current plan" — a tier at or below the one being paid for. Distinct from
        // the current plan itself, and from an upgrade, because all three want different words.
        const isCovered = currentIndex >= 0 && index < currentIndex;
        const previous = index > 0 ? plans[index - 1] : null;
        const added = capabilitiesOf(plan, t).filter(
          (capability) => !previous || !capabilitiesOf(previous, t).includes(capability),
        );

        return (
          <div
            key={plan.id}
            className={cn(
              "flex min-w-0 flex-col gap-3.5 border-hairline px-4 py-5 sm:px-6",
              // Rules between columns, never around them: the page grid is the one object.
              index > 0 && "border-t",
              index % smCols !== 0 ? "sm:border-l" : "sm:border-l-0",
              index >= smCols ? "sm:border-t" : "sm:border-t-0",
              index % xlCols !== 0 ? "xl:border-l" : "xl:border-l-0",
              index >= xlCols ? "xl:border-t" : "xl:border-t-0",
            )}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ink">{plan.name}</h3>
              {plan.id === highlightedId ? <Pill tone="accent">{t("planGrid.mostPopular")}</Pill> : null}
            </div>

            <PriceLine plan={plan} />

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
              <p className="text-[12px] text-ink-muted">
                {t("planGrid.creditsPerCycle", { credits: formatAmount(plan.creditsPerCycle) })}
              </p>
              <p className="text-[12px] text-ink-muted">
                {t("planGrid.limits", {
                  participants: plan.maxParticipants,
                  languages: plan.maxLanguages,
                })}
              </p>
            </div>

            <div className="space-y-1.5">
              {previous ? (
                <p className="text-[12px] text-ink">
                  {t("planGrid.everythingInPlus", { name: previous.name })}
                </p>
              ) : null}
              {added.length > 0 ? (
                added.map((capability) => (
                  <p key={capability} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <Check weight="bold" className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {capability}
                  </p>
                ))
              ) : previous ? (
                <p className="text-[12px] text-ink-subtle">{t("planGrid.moreCreditsAndLimits")}</p>
              ) : (
                capabilitiesOf(plan, t).map((capability) => (
                  <p key={capability} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <Check weight="bold" className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {capability}
                  </p>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
