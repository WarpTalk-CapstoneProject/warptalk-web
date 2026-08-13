"use client";

/**
 * The one block an owner opens this page for: how much of this billing cycle's credit is left,
 * how fast it is going, and whether it reaches the renewal date.
 *
 * WHY A PROJECTION AND NOT JUST A BALANCE
 *   "Credits: 1,240" is a fact nobody can act on — it is only meaningful against a rate and a
 *   deadline, and an owner cannot do that arithmetic from a number on a tile. The question behind
 *   opening a billing dashboard is "am I going to run out, and when", so that is what this
 *   answers. Everything else here exists to show the working: the burn rate it was computed
 *   from, and the two percentages it compares.
 *
 * THE PACE COMPARISON IS THE POINT
 *   Credits used and cycle elapsed are drawn on the same track. 40% used at 40% through is a
 *   workspace that is fine; 40% used at 10% through is one that will be out with three weeks
 *   still to pay for. The marker is what turns a progress bar into a warning.
 *
 * WHAT IT REFUSES TO SAY
 *   A projection from four hours of a thirty-day cycle is noise wearing a decimal point. Under a
 *   day of elapsed cycle, or with nothing consumed yet, it says it does not know instead.
 */

import Link from "next/link";
import { ArrowUpRight, Warning } from "@phosphor-icons/react/dist/ssr";

import { formatMoney } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import {
  cycleElapsedPercent,
  daysLeftInCycle,
  projectCycle,
} from "@/lib/billing/cycle-projection";
import type { CreditBalanceDto, SubscriptionDto } from "@/types/billing";

/** Below this share remaining, the balance is a thing to act on rather than a thing to know. */
const LOW_CREDIT_PERCENT = 15;

export function CycleSummary({
  credits,
  subscription,
  now,
  billingHref,
  plansHref,
}: {
  credits: CreditBalanceDto | null;
  subscription: SubscriptionDto | null;
  now: number;
  billingHref: string;
  plansHref: string;
}) {
  if (!credits) {
    return (
      /* The one promotional surface on this page, and the only place colour belongs: a soft
         blurred gradient behind the copy, the way OpenAI's platform banner does it. Two blurred
         radial blobs rather than a linear-gradient image — they stay soft at any width, cost no
         asset, and sit under `overflow-hidden` so nothing bleeds past the corner radius. */
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-surface-1 px-4 py-4">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-24 size-72 rounded-full bg-[var(--primary)]/25 blur-3xl" />
          <div className="absolute -bottom-28 right-32 size-64 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -top-20 right-64 size-56 rounded-full bg-fuchsia-400/15 blur-3xl" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">
              No plan on this workspace
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              Meetings translate against a credit balance, and this workspace
              has none to draw from.
            </p>
          </div>
          <Link
            href={plansHref}
            className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-[13px] font-medium text-background transition hover:opacity-90"
          >
            Choose a plan
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, credits.currentCredits);
  const used = Math.max(0, credits.creditsUsedThisCycle);
  // `totalCredits` is remaining + used, i.e. everything this cycle has had available including
  // top-ups so far — not the plan's headline allowance. "Available this cycle" is what it is.
  const available = Math.max(credits.totalCredits, remaining + used);
  const usedPercent = available > 0 ? Math.round((used / available) * 100) : 0;
  const remainingPercent = available > 0 ? 100 - usedPercent : null;

  const end = new Date(credits.currentPeriodEnd).getTime();
  const elapsedPercent = cycleElapsedPercent(credits, now);
  const daysLeft = daysLeftInCycle(credits, now);

  const projection = projectCycle(credits, now);
  const isLow =
    remainingPercent !== null && remainingPercent <= LOW_CREDIT_PERCENT;
  const willRunOut = projection.kind === "runs-out";

  return (
    <div className="rounded-[14px] border border-border bg-canvas">
      {/* Four cells on one hairline-divided row. Rounded tiles with their own borders would draw
          four more boxes inside a box, and the numbers are meant to be read across, not as
          separate cards. */}
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
        <Cell
          label="Credits left"
          value={remaining.toLocaleString()}
          detail={
            remainingPercent !== null
              ? `${remainingPercent}% of ${available.toLocaleString()} available`
              : undefined
          }
          tone={isLow ? "warn" : "default"}
        />
        <Cell
          label="Used this cycle"
          value={used.toLocaleString()}
          detail={`${usedPercent}% of this cycle's credits`}
        />
        <Cell
          label="Burn rate"
          value={
            projection.kind === "unknown"
              ? "—"
              : `${Math.round(projection.perDay).toLocaleString()}/day`
          }
          detail={
            projection.kind === "unknown"
              ? projection.reason
              : "Average since the cycle began"
          }
        />
        <Cell
          label={willRunOut ? "Runs out" : "Renews"}
          value={
            projection.kind === "runs-out"
              ? formatDay(projection.onDate)
              : formatDay(new Date(end))
          }
          detail={
            projection.kind === "runs-out"
              ? `In ${Math.max(1, Math.round(projection.daysToEmpty))} day${Math.round(projection.daysToEmpty) === 1 ? "" : "s"} — before the cycle ends`
              : projection.kind === "lasts"
                ? `${projection.creditsLeftAtRenewal.toLocaleString()} left at this rate`
                : `In ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
          }
          tone={willRunOut ? "warn" : "default"}
        />
      </div>

      <div className="border-t border-hairline px-4 py-3.5">
        {/* Used and elapsed on one track. Either alone is a progress bar; together they are the
            answer to "am I ahead of my own budget". */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              willRunOut || isLow ? "bg-amber-500" : "bg-[var(--primary)]",
            )}
            style={{ width: `${Math.min(100, usedPercent)}%` }}
          />
          {elapsedPercent !== null ? (
            <div
              className="absolute top-0 h-full w-[2px] bg-ink/60"
              style={{ left: `calc(${elapsedPercent}% - 1px)` }}
              aria-hidden
            />
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[12px]">
          <p className="text-ink-muted">
            <span className="font-medium text-ink">{usedPercent}%</span> of
            credits used
            {elapsedPercent !== null ? (
              <>
                {" · "}
                <span className="font-medium text-ink">
                  {elapsedPercent}%
                </span>{" "}
                of the cycle elapsed
              </>
            ) : null}
          </p>

          <div className="flex items-center gap-3">
            {subscription ? (
              <span className="text-ink-muted">
                <span className="font-medium text-ink">
                  {subscription.planName}
                </span>
                {/* With its currency, like the billing page. A bare "1,290,000" beside a credit
                    count reads as more credits. */}
                {subscription.price > 0
                  ? ` · ${formatMoney(subscription.price, "VND")}/cycle`
                  : ""}
                {subscription.cancelAtPeriodEnd
                  ? " · cancels at period end"
                  : ""}
              </span>
            ) : null}
            <Link
              href={billingHref}
              className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-ink"
            >
              Billing
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {subscription?.cancelAtPeriodEnd ? (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-500">
            <Warning className="h-3.5 w-3.5" />
            Translation stops for everyone in this workspace on{" "}
            {formatDay(new Date(end))}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-[22px] font-semibold leading-none tabular-nums",
          tone === "warn" ? "text-amber-500" : "text-ink",
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1.5 text-[12px] text-ink-subtle">{detail}</p>
      ) : null}
    </div>
  );
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(date);
}
