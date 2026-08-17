"use client";

/**
 * Who in this workspace is spending the credits. WT-413.
 *
 * WHY IT IS A LIST AND NOT A CHART
 *   The question an owner asks here is "who should I talk to", and the answer is a name. A bar
 *   chart of three people is a legend with decoration attached — the same reason UsageBreakdown
 *   beside it is ranked rows rather than the pie the admin surface draws.
 *
 * WHY THE JOIN HAPPENS HERE
 *   The endpoint returns user ids. billing-service holds no user directory, and this page has
 *   already loaded the workspace member list for other panels, so resolving a name costs
 *   nothing here and would have cost billing a gRPC dependency on auth.
 *
 * A SPENDER WHO IS NO LONGER A MEMBER STILL COUNTS
 *   Usage is historical and membership is current, so somebody who has left can appear in the
 *   window. Their credits were really spent, and dropping the row would make the table stop
 *   summing to the total above it. They are labelled rather than hidden.
 */

import { rankMemberUsage } from "@/lib/billing/member-usage-join";
import type { MemberCreditUsageDto } from "@/types/billing";
import type { WorkspaceMemberDto } from "@/types/workspace";

export function MemberUsage({
  rows,
  members,
  total,
}: {
  rows: MemberCreditUsageDto[];
  members: WorkspaceMemberDto[];
  total: number;
}) {
  // Ranking, the name join and the former-member case all live in rankMemberUsage so they can
  // be tested without rendering — see lib/billing/member-usage-join.ts.
  const ranked = rankMemberUsage(rows, members, total);

  if (ranked.length === 0) {
    // Matches the height of the panels it sits beside — a one-line empty state next to a
    // 220px chart makes the shared frame look mis-drawn rather than empty.
    return (
      <p className="flex h-[220px] items-center justify-center text-center text-[12px] text-ink-muted">
        No member has used credits in this window.
      </p>
    );
  }

  // Bars are drawn against the largest row, not the total: against the total, one dominant
  // spender renders everybody else as a single pixel.
  const largest = Math.max(...ranked.map((row) => row.creditsConsumed), 1);

  return (
    <div className="flex flex-col gap-3">
      {ranked.map((row) => {
        return (
          <div key={row.userId}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink">
                {row.label}
                {row.isFormerMember ? (
                  <span className="ml-1.5 text-[11px] text-ink-muted">· no longer a member</span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                <span className="font-medium text-ink">
                  {row.creditsConsumed.toLocaleString()}
                </span>{" "}
                · {row.share}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, (row.creditsConsumed / largest) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {row.recordCount.toLocaleString()}{" "}
              {row.recordCount === 1 ? "charge" : "charges"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
