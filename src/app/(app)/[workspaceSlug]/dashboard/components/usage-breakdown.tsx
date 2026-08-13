"use client";

/**
 * What the credits went on, ranked.
 *
 * NOT A DONUT
 *   The admin surface draws this as a pie. A pie of five slices where two are under 3% is a
 *   legend with a decoration attached — you read the legend, not the shape. Ranked rows with a
 *   proportional bar answer the same question ("what dominates") and additionally answer "by how
 *   much" and "how many times", which is what an owner deciding whether to top up needs.
 *
 * IT SURVIVES A WORKSPACE WITH NO PLAN
 *   This reads usage records, not the subscription, so it is the one panel here that still has
 *   something true to say before anybody has bought anything.
 */

import { usageTypeLabel } from "@/lib/billing/usage-labels";
import type { FeatureAdoptionDto } from "@/types/billing";

export function UsageBreakdown({ rows }: { rows: FeatureAdoptionDto[] }) {
  const ranked = [...rows]
    .filter((row) => row.totalCreditsConsumed > 0 || row.usageCount > 0)
    .sort((a, b) => b.totalCreditsConsumed - a.totalCreditsConsumed);

  if (ranked.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] text-ink-muted">
        Nothing has been used in this window.
      </p>
    );
  }

  const total = ranked.reduce((sum, row) => sum + row.totalCreditsConsumed, 0);
  // Bars are drawn against the largest row, not the total: against the total, a workspace with
  // one dominant feature renders four bars of one pixel.
  const largest = Math.max(...ranked.map((row) => row.totalCreditsConsumed), 1);

  return (
    <div className="flex flex-col gap-3">
      {ranked.map((row) => {
        const share = total > 0 ? Math.round((row.totalCreditsConsumed / total) * 100) : 0;
        return (
          <div key={row.usageType}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink">{usageTypeLabel(row.usageType)}</span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                <span className="font-medium text-ink">
                  {row.totalCreditsConsumed.toLocaleString()}
                </span>{" "}
                · {share}%
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-[var(--primary)]"
                style={{ width: `${Math.max(2, (row.totalCreditsConsumed / largest) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              {row.usageCount.toLocaleString()} time{row.usageCount === 1 ? "" : "s"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
