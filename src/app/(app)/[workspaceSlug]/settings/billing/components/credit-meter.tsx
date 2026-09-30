"use client";

/**
 * The credit gauge in the "Credits Remaining" cell. WT-878.
 *
 * WHAT IT ANSWERS
 *   "Am I going to run out?" A bare balance cannot say; a bar can, if it carries three things at
 *   once: how much of the cycle's allowance is spent (the fill), where the warning starts (the
 *   tick), and how far through the cycle the clock is (the pace marker). A fill sitting ahead of
 *   the pace marker is a workspace burning faster than its cycle.
 *
 * ONE LEVEL DRIVES EVERYTHING
 *   Colour, the text label, the headline number's tint and the sentence under the bar all read the
 *   level from `creditUsageLevel`, which reads the same constants as the layout's low-credit
 *   banner. The label exists so the state never depends on colour alone.
 *
 * WHAT IT REFUSES TO DRAW
 *   With no allowance there is no fraction, so no bar (level "unknown"): an empty track would read
 *   as "0% used", which is a claim about a workspace that has no ceiling at all.
 *
 * THE PACE SENTENCE IS NOT NEW MATHS
 *   It reuses `projectCycle` (the dashboard's projection) and says nothing when that declines to
 *   project — under a day into the cycle, or nothing consumed yet.
 *
 * MOTION: the fill eases in over ~500ms, only under `motion-safe:`. With reduced motion it simply
 * appears at its width.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { creditUsageLevel, type CreditUsageLevel } from "@/lib/billing/credit-usage-level";
import {
  cycleElapsedPercent,
  daysLeftInCycle,
  projectCycle,
} from "@/lib/billing/cycle-projection";
import { WARN_BELOW_FRACTION } from "@/lib/billing/usage-warning";
import { formatAmount } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import type { CreditBalanceDto, WorkspaceOverageSettingDto } from "@/types/billing";

import { Pill } from "./billing-primitives";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type LevelLook = {
  pill: "ok" | "warn" | "bad" | "muted";
  valueTone: "default" | "warn" | "bad";
  fill: string;
  text: string;
};

const LOOK: Record<CreditUsageLevel, LevelLook> = {
  ok: {
    pill: "ok",
    valueTone: "default",
    fill: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  warn: {
    pill: "warn",
    valueTone: "warn",
    fill: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  critical: { pill: "bad", valueTone: "bad", fill: "bg-destructive", text: "text-destructive" },
  full: { pill: "bad", valueTone: "bad", fill: "bg-destructive", text: "text-destructive" },
  unknown: { pill: "muted", valueTone: "default", fill: "bg-surface-3", text: "text-ink-muted" },
};

/** The level for a balance, in the shape the page needs. Level is "unknown" until one exists. */
export function creditLook(balance: CreditBalanceDto | null | undefined) {
  const result = creditUsageLevel({
    currentCredits: balance?.currentCredits,
    totalCredits: balance?.totalCredits,
  });
  return { ...result, look: LOOK[result.level] };
}

/** The text status shown beside the "Credits Remaining" label. */
export function CreditLevelPill({ level }: { level: CreditUsageLevel }) {
  const t = useTranslations("settingsBilling.meter");
  return <Pill tone={LOOK[level].pill}>{t(`level.${level}`)}</Pill>;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function CreditMeter({
  balance,
  overage,
  overagesOn,
}: {
  balance: CreditBalanceDto;
  overage: WorkspaceOverageSettingDto | null | undefined;
  overagesOn: boolean;
}) {
  const t = useTranslations("settingsBilling.meter");
  const now = useNow();
  const { level, look } = creditLook(balance);

  // NOT the cycle's grant. `totalCredits` is remaining + used this cycle (backend CreditMapper),
  // so a top-up or a carried-over balance raises it too. The copy says "available this cycle"
  // and "of this cycle's credits" for that reason — nothing here may call it "granted". WT-878.
  const total = Number(balance.totalCredits);
  // The server's own figure, not `total - current`: only one of them stays right after a
  // mid-cycle top-up raises the total.
  const used = Math.max(0, Number(balance.creditsUsedThisCycle) || 0);
  const left = Math.max(0, Number(balance.currentCredits) || 0);
  const drawable = level !== "unknown";

  // Clamped: an overage cycle has spent more than this cycle held, and the bar ends at its end.
  const usedPercent = drawable ? Math.min(100, (used / total) * 100) : 0;
  const usedLabel = Math.min(100, Math.floor((used / total) * 100 * 10) / 10);
  const elapsed = drawable ? cycleElapsedPercent(balance, now) : null;
  const tickAt = Math.round(100 - WARN_BELOW_FRACTION * 100);

  // Mount at 0 and move to the real width one frame later, so the fill visibly runs in. Under
  // `motion-reduce` the transition is absent and this is just a one-frame delay.
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDrawn(usedPercent));
    return () => window.cancelAnimationFrame(frame);
  }, [usedPercent]);

  return (
    <div className="mt-4">
      {drawable ? (
        <>
          <div
            role="meter"
            aria-label={t("ariaLabel")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(used, total)}
            aria-valuetext={t("ariaValueText", { percent: usedLabel, level: t(`level.${level}`) })}
            className="relative h-2 rounded-full bg-surface-3"
          >
            <div
              className={cn(
                "h-full rounded-full motion-safe:transition-[width,background-color] motion-safe:duration-500 motion-safe:ease-out",
                look.fill,
              )}
              style={{ width: `${drawn}%` }}
            />
            <span
              aria-hidden
              className="absolute -top-[3px] -bottom-[3px] w-px bg-ink-subtle"
              style={{ left: `${tickAt}%` }}
            >
              <span className="absolute top-[13px] left-1/2 -translate-x-1/2 text-[10px] leading-none text-ink-subtle">
                {tickAt}%
              </span>
            </span>
            {elapsed !== null ? (
              <span
                title={t("paceTitle")}
                aria-hidden
                className="absolute -top-[5px] h-[18px] w-[3px] -translate-x-1/2 rounded-sm bg-primary motion-safe:transition-[left] motion-safe:duration-500 motion-safe:ease-out"
                style={{ left: `${elapsed}%` }}
              />
            ) : null}
          </div>
          <div className="mt-5 flex justify-between gap-3 text-[12px] tabular-nums text-ink-muted">
            <span>
              <b className={cn("font-semibold", look.text)}>
                {t("usedPercent", { percent: usedLabel })}
              </b>
              {" · "}
              {t("leftAmount", { left: formatAmount(left) })}
            </span>
            <span>{t("granted", { total: formatAmount(total) })}</span>
          </div>
          <PaceNote
            balance={balance}
            now={now}
            level={level}
            overage={overage}
            overagesOn={overagesOn}
            used={used}
            total={total}
          />
        </>
      ) : (
        <p className="text-[12px] font-semibold text-ink-muted">{t("noneGranted")}</p>
      )}
    </div>
  );
}

/** One sentence about where the cycle is heading. Empty when there is nothing honest to say. */
function PaceNote({
  balance,
  now,
  level,
  overage,
  overagesOn,
  used,
  total,
}: {
  balance: CreditBalanceDto;
  now: number;
  level: CreditUsageLevel;
  overage: WorkspaceOverageSettingDto | null | undefined;
  overagesOn: boolean;
  used: number;
  total: number;
}) {
  const t = useTranslations("settingsBilling.meter");

  if (level === "full") {
    const beyond =
      overage && overage.overageCreditsThisCycle > 0
        ? overage.overageCreditsThisCycle
        : used > total
          ? used - total
          : 0;
    return (
      <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
        {overagesOn
          ? beyond > 0
            ? t("overageRunning", { credits: formatAmount(beyond) })
            : t("overageRunningNoAmount")
          : t("allowanceUsedStopped")}
      </p>
    );
  }

  const projection = projectCycle(balance, now);
  if (projection.kind === "unknown") return null;

  const start = Date.parse(balance.currentPeriodStart);
  const end = Date.parse(balance.currentPeriodEnd);
  const percent = cycleElapsedPercent(balance, now);
  const cycleDays = Math.round((end - start) / MS_PER_DAY);
  const day = Math.min(cycleDays, Math.floor((now - start) / MS_PER_DAY) + 1);

  const dayLine =
    percent !== null && cycleDays > 0 ? t("paceDay", { day, total: cycleDays, percent }) : null;

  let projectionLine: string;
  if (projection.kind === "lasts") {
    projectionLine = t("paceLasts");
  } else {
    const days = Math.floor(projection.daysToEmpty);
    const early = Math.max(0, daysLeftInCycle(balance, now) - days);
    projectionLine =
      early > 0 ? t("paceRunsOut", { days, early }) : t("paceRunsOutAtEnd", { days });
  }

  return (
    <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
      {dayLine ? `${dayLine} ` : null}
      {projectionLine}
    </p>
  );
}
