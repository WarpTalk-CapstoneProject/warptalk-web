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
import { useTranslations } from "next-intl";
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

/**
 * `projectCycle`'s `reason` strings, translated at the call site rather than in
 * `lib/billing/cycle-projection.ts` itself — that file's own test asserts these exact English
 * strings, so this keeps that contract untouched while still showing a translated reason here.
 */
const PROJECTION_REASON_KEYS: Record<string, string> = {
  "This cycle has no dates on it.": "noPlan.reasonNoDates",
  "Too early in the cycle to project a rate.": "noPlan.reasonTooEarly",
  "Nothing used yet this cycle.": "noPlan.reasonNothingUsed",
};

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
  const t = useTranslations("dashboard");
  if (!credits) {
    return (
      /* Plain. The gradient this used to carry now lives in DashboardHero above.
         Tying the page's one decorative surface to an ERROR state meant a workspace with a plan
         got a flat page with no top to it, and a workspace without one got its warning dressed up
         as a promotion. This is a fact about the workspace, and it should read like one. */
      <div className="rounded-[14px] border border-hairline bg-surface-1 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">
              {t("noPlan.title")}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {t("noPlan.description")}
            </p>
          </div>
          <Link
            href={plansHref}
            className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 text-[13px] font-medium text-ink transition hover:bg-surface-2"
          >
            {t("noPlan.choosePlan")}
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
    <div className="rounded-[14px] border border-border bg-surface-1">
      {/* Four cells on one hairline-divided row. Rounded tiles with their own borders would draw
          four more boxes inside a box, and the numbers are meant to be read across, not as
          separate cards. */}
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
        <Cell
          label={t("cells.creditsLeft")}
          value={remaining.toLocaleString()}
          detail={
            remainingPercent !== null
              ? t("cells.creditsLeftDetail", { percent: remainingPercent, available: available.toLocaleString() })
              : undefined
          }
          tone={isLow ? "warn" : "default"}
        />
        <Cell
          label={t("cells.usedThisCycle")}
          value={used.toLocaleString()}
          detail={t("cells.usedThisCycleDetail", { percent: usedPercent })}
        />
        <Cell
          label={t("cells.burnRate")}
          value={
            projection.kind === "unknown"
              ? "—"
              : t("cells.perDay", { value: Math.round(projection.perDay).toLocaleString() })
          }
          detail={
            projection.kind === "unknown"
              ? (() => {
                  const key = PROJECTION_REASON_KEYS[projection.reason];
                  return key ? t(key as never) : projection.reason;
                })()
              : t("cells.burnRateDetailAverage")
          }
        />
        <Cell
          label={willRunOut ? t("cells.runsOut") : t("cells.renews")}
          value={
            projection.kind === "runs-out"
              ? formatDay(projection.onDate)
              : formatDay(new Date(end))
          }
          detail={
            projection.kind === "runs-out"
              ? t("cells.runsOutDetail", { count: Math.max(1, Math.round(projection.daysToEmpty)) })
              : projection.kind === "lasts"
                ? t("cells.lastsDetail", { count: projection.creditsLeftAtRenewal.toLocaleString() })
                : t("cells.renewsDetail", { count: daysLeft })
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
            <span className="font-medium text-ink">{usedPercent}%</span>{" "}
            {t("usedPercentOfCredits")}
            {elapsedPercent !== null ? (
              <>
                {" · "}
                <span className="font-medium text-ink">
                  {elapsedPercent}%
                </span>{" "}
                {t("elapsedPercentOfCycle")}
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
                  ? ` · ${formatMoney(subscription.price, "VND")}/${t("cells.cyclePerUnit")}`
                  : ""}
                {subscription.cancelAtPeriodEnd
                  ? ` · ${t("cancelsAtPeriodEnd")}`
                  : ""}
              </span>
            ) : null}
            <Link
              href={billingHref}
              className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-ink"
            >
              {t("billing")}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {subscription?.cancelAtPeriodEnd ? (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-500">
            <Warning className="h-3.5 w-3.5" />
            {t("cancelWarning", { date: formatDay(new Date(end)) })}
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
