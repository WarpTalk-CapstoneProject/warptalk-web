/**
 * Resolving a credit spender to a person, and ranking them. WT-413.
 *
 * The endpoint returns user ids: billing-service holds no user directory — it has an
 * IWorkspaceClient and an INotificationClient and nothing that resolves a person — and the
 * dashboard has already loaded the member list for its other panels. So the join belongs here,
 * and billing keeps out of a gRPC dependency on auth for the sake of a label.
 *
 * Extracted from the component so the two cases that are more than a Map lookup can be tested
 * without rendering: a spender who has since LEFT the workspace, and the ordering the panel
 * promises.
 */

import type { MemberCreditUsageDto } from "@/types/billing";

/** Just the fields the join needs, so both the paged DTO and a live presence row satisfy it. */
export interface UsageMemberLike {
  userId: string;
  fullName?: string | null;
  email?: string | null;
}

export interface RankedMemberUsage extends MemberCreditUsageDto {
  /** What to show: their name, else their email, else that they are gone. */
  label: string;
  /** True when this spender is no longer in the workspace. */
  isFormerMember: boolean;
  /** Whole-percent share of `total`, 0 when there is nothing to divide by. */
  share: number;
}

export function rankMemberUsage(
  rows: readonly MemberCreditUsageDto[],
  members: readonly UsageMemberLike[],
  total?: number,
): RankedMemberUsage[] {
  const byUserId = new Map(members.map((member) => [member.userId, member]));

  // A row with no credits AND no charges is an empty row; one with charges but no credits is a
  // real state — a metered call that rounded to zero — and hiding it would make the charge
  // count here disagree with billing history.
  const spent = rows.filter((row) => row.creditsConsumed > 0 || row.recordCount > 0);

  const denominator =
    typeof total === "number" ? total : spent.reduce((sum, row) => sum + row.creditsConsumed, 0);

  return spent
    .map((row) => {
      const member = byUserId.get(row.userId);
      return {
        ...row,
        // Usage is historical and membership is current, so somebody who has left can appear in
        // the window. Their credits were really spent; dropping the row would make the table
        // stop summing to the total shown above it.
        isFormerMember: !member,
        label: member?.fullName || member?.email || "Former member",
        share: denominator > 0 ? Math.round((row.creditsConsumed / denominator) * 100) : 0,
      };
    })
    .sort((a, b) => b.creditsConsumed - a.creditsConsumed);
}
