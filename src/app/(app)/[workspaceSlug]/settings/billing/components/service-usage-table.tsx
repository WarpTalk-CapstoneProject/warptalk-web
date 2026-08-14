"use client";

/**
 * What each AI service cost, and what it cost PER USE.
 *
 * The page used to list credits per service and stop there, which cannot separate the two
 * explanations an owner is choosing between: a service that is expensive, and a service that is
 * used constantly. Those lead to opposite decisions — change how you run meetings, or change the
 * plan. `usageCount` has been on the wire since the breakdown endpoint was written and no surface
 * had ever shown it, so the average was one division away the whole time.
 */

import { usageTypeDetailLabel } from "@/lib/billing/usage-labels";
import type { ServiceUsageRow } from "@/lib/billing/cycle-activity";

/** Credits per use is a small number for chat and a large one for a meeting; both need to read. */
function formatPerUse(value: number): string {
  if (value >= 100) return Math.round(value).toLocaleString();
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

export function ServiceUsageTable({ rows }: { rows: ServiceUsageRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-ink-muted">
        No AI usage recorded in this window.
      </p>
    );
  }

  // Bars are drawn against the LARGEST row, not the total. Against the total, a workspace whose
  // spend is one dominant service renders every other bar at one pixel.
  const largest = Math.max(...rows.map((r) => r.credits), 1);

  return (
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline text-[11px] font-medium text-ink-muted">
            <th className="px-4 py-2.5 text-left font-medium">Service</th>
            <th className="px-4 py-2.5 text-right font-medium">Uses</th>
            <th className="px-4 py-2.5 text-right font-medium">Credits / use</th>
            <th className="px-4 py-2.5 text-right font-medium">Credits</th>
            <th className="w-[26%] px-4 py-2.5 text-left font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.usageType} className="border-b border-hairline/60 last:border-b-0">
              <td className="max-w-[240px] px-4 py-3 text-ink">
                <span className="block truncate" title={usageTypeDetailLabel(row.usageType)}>
                  {usageTypeDetailLabel(row.usageType)}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                {row.uses > 0 ? row.uses.toLocaleString() : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                {/* An em dash, never "0.00". A service billed with no use count recorded is
                    unknown, and printing zero there claims it was free. */}
                {row.creditsPerUse !== null ? formatPerUse(row.creditsPerUse) : "—"}
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                {row.credits.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${Math.max(2, (row.credits / largest) * 100)}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink-subtle">
                    {Math.round(row.share)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
