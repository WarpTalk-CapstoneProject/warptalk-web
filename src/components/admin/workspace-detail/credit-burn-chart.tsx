"use client";

import { useTranslations } from "next-intl";

import { burnGeometry } from "@/lib/admin/workspace-actions";
import type { AdminWorkspaceBurnPointDto } from "@/types/admin-workspace-actions";

const WIDTH = 600;
const HEIGHT = 120;
const numberFormatter = new Intl.NumberFormat("en-US");
const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Credits burned per day (bars) against the balance the ledger reports after each day (line).
 * Both come from the ledger itself; the balance is never re-derived by summing here.
 */
export function CreditBurnChart({ points }: { points: AdminWorkspaceBurnPointDto[] }) {
  const t = useTranslations("adminWorkspaces.burn");
  const geometry = burnGeometry(points, WIDTH, HEIGHT);
  const consumed = points.reduce((sum, p) => sum + p.consumed, 0);
  const granted = points.reduce((sum, p) => sum + p.granted, 0);
  const path = geometry.line.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  if (points.length === 0 || (consumed === 0 && granted === 0 && geometry.line.length === 0)) {
    return <p className="py-6 text-center text-xs text-ink-muted">{t("empty")}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary/70" />
          {t("consumedLegend", { credits: numberFormatter.format(consumed) })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-emerald-500" />
          {t("balanceLegend")}
        </span>
        {granted > 0 ? <span>{t("grantedLegend", { credits: numberFormatter.format(granted) })}</span> : null}
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="mt-3 h-32 w-full overflow-visible"
        role="img"
        aria-label={t("aria", { days: points.length })}
      >
        {geometry.bars.map((bar) => (
          <rect
            key={bar.date}
            x={bar.x}
            y={HEIGHT - bar.height}
            width={bar.width}
            height={Math.max(bar.consumed > 0 ? 1.5 : 0, bar.height)}
            rx={1}
            className="fill-primary/60"
          >
            <title>{t("barTitle", { date: dayFormatter.format(new Date(bar.date)), credits: numberFormatter.format(bar.consumed) })}</title>
          </rect>
        ))}
        {path ? (
          <path d={path} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-emerald-500" />
        ) : null}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-subtle">
        <span>{dayFormatter.format(new Date(points[0]!.date))}</span>
        <span>
          {geometry.line.length > 0 ? t("peakBalance", { credits: numberFormatter.format(geometry.maxBalance) }) : ""}
        </span>
        <span>{dayFormatter.format(new Date(points[points.length - 1]!.date))}</span>
      </div>
    </div>
  );
}
