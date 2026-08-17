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
 * No shadows: see billing-primitives.
 */

import { Check } from "@phosphor-icons/react";

import { formatAmount, formatMoney } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import type { PlanDto } from "@/types/billing";

import { BillingButton, Pill } from "./billing-primitives";

/** The capabilities a tier can add. Order is fixed so columns line up down the grid. */
const CAPABILITIES: { key: keyof PlanDto; label: string }[] = [
  { key: "voiceCloneEnabled", label: "Voice cloning" },
  { key: "aiAssistantEnabled", label: "AI assistant" },
  { key: "glossaryEnabled", label: "Custom glossary" },
  { key: "dedicatedGpu", label: "Dedicated GPU" },
];

function capabilitiesOf(plan: PlanDto): string[] {
  return CAPABILITIES.filter(({ key }) => plan[key] === true).map(({ label }) => label);
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
  const currentIndex = plans.findIndex((plan) => plan.id === currentPlanId);

  // The most expensive plan carries the badge. Not a hardcoded slug: the ladder is administered
  // through the admin plans screen, and a badge pinned to a slug would follow a plan that had been
  // renamed or withdrawn.
  const highlightedId = plans.length > 0 ? plans[plans.length - 1].id : null;

  return (
    <div className="grid gap-0 overflow-clip rounded-[12px] border border-border bg-surface-1 shadow-none sm:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan, index) => {
        const isCurrent = plan.id === currentPlanId;
        // "Covered by current plan" — a tier at or below the one being paid for. Distinct from
        // the current plan itself, and from an upgrade, because all three want different words.
        const isCovered = currentIndex >= 0 && index < currentIndex;
        const previous = index > 0 ? plans[index - 1] : null;
        const added = capabilitiesOf(plan).filter(
          (capability) => !previous || !capabilitiesOf(previous).includes(capability),
        );

        return (
          <div
            key={plan.id}
            className={cn(
              "flex min-w-0 flex-col gap-3.5 border-hairline p-4",
              // Rules between columns, never around them: the grid is one object.
              index > 0 && "sm:border-l",
              index >= 2 && "xl:border-l",
              index >= 2 && "sm:border-t xl:border-t-0",
              index === 1 && "sm:border-t-0",
            )}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ink">{plan.name}</h3>
              {plan.id === highlightedId ? <Pill tone="accent">Most popular</Pill> : null}
            </div>

            <PriceLine plan={plan} />

            {isCurrent ? (
              <BillingButton tone="quiet">Current plan</BillingButton>
            ) : isCovered ? (
              <BillingButton tone="quiet">Covered by current plan</BillingButton>
            ) : (
              <BillingButton
                tone={plan.id === highlightedId ? "primary" : "outline"}
                onClick={() => onSelect(plan)}
              >
                {currentIndex >= 0 ? "Upgrade" : "Choose"}
              </BillingButton>
            )}

            <div className="space-y-1">
              <p className="text-[12px] text-ink-muted">
                {formatAmount(plan.creditsPerCycle)} credits/cycle
              </p>
              <p className="text-[12px] text-ink-muted">
                {plan.maxParticipants} participants · {plan.maxLanguages} languages
              </p>
            </div>

            <div className="space-y-1.5">
              {previous ? (
                <p className="text-[12px] text-ink">Everything in {previous.name}, plus</p>
              ) : null}
              {added.length > 0 ? (
                added.map((capability) => (
                  <p key={capability} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <Check weight="bold" className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {capability}
                  </p>
                ))
              ) : previous ? (
                <p className="text-[12px] text-ink-subtle">More credits and higher limits</p>
              ) : (
                capabilitiesOf(plan).map((capability) => (
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
