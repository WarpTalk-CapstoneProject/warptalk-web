/**
 * What WarpBot is told about the Insights → Usage tab the owner has open.
 *
 * Same idea as the Overview's snapshot (assistant-snapshot.ts): the tab has already read the
 * billing cycle's whole ledger with the owner's own token, so the figures it prints are handed to
 * WarpBot as page context rather than behind a tool. Every number is computed with the helpers the
 * tab itself draws from (`summariseCycleActivity`, `summariseSpendByService`, `buildServiceCards`,
 * `rankMembers`), so WarpBot and the screen cannot disagree.
 *
 * THE RULES IT KEEPS
 *   - The whole workspace, the way the tab opens (no member filter): a filter picked on screen is
 *     the tab's own state and is not sent.
 *   - Only what is read. A ledger that stopped at the paging cap is "at least"; rooms that have not
 *     loaded leave no meeting count (matching charges to meetings needs them).
 *   - No member is named: how many people spent credits and how much the biggest spender's share
 *     is, never who. The tab shows names; WarpBot gets the shape.
 *   - No comma inside a value (see snapshot-text.ts).
 */

import type { CreditBalanceDto, CreditTransactionDto } from "../../../types/billing.ts";
import { summariseCycleActivity } from "../../billing/cycle-activity.ts";
import {
  UNKNOWN_MEMBER_KEY,
  attributeMeetings,
  buildServiceCards,
  memberDirectory,
  rankMembers,
  summariseSpendByService,
  type BreakdownRowLike,
  type MeetingWindowLike,
  type UsageMemberLike,
} from "../../billing/usage-overview.ts";
import { creditsRemainingView } from "./overview-metrics.ts";
import { dayKey, dayOf, plain, projectionText, whole } from "./snapshot-text.ts";

export interface UsageSnapshotInput {
  balance: CreditBalanceDto;
  /** The cycle's ledger, every page that was read. */
  ledger: readonly CreditTransactionDto[];
  /** False when paging stopped before the server's own total. */
  ledgerComplete: boolean;
  /** `/usages/workspace/{id}/breakdown` since the cycle began; undefined while it has not answered. */
  serviceUsage: readonly BreakdownRowLike[] | undefined;
  members: readonly UsageMemberLike[];
  rooms: readonly MeetingWindowLike[];
  nowMs: number;
}

const MAX_SERVICES = 5;

export function usageAssistantSnapshot(input: UsageSnapshotInput): Record<string, string> {
  const { balance, nowMs } = input;
  const ledger = [...input.ledger];
  const floor = input.ledgerComplete ? "" : "at least ";
  const out: Record<string, string> = {
    billing_cycle: `${dayOf(balance.currentPeriodStart) ?? "?"} to ${dayOf(balance.currentPeriodEnd) ?? "?"}`,
    usage_scope: "whole workspace",
  };

  const view = creditsRemainingView(balance);
  out.credits_remaining =
    view.percentLeft === null ? String(view.remaining) : `${view.remaining} of ${view.available} (${view.percentLeft}% left)`;
  out.credits_projection = projectionText(balance, nowMs);
  out.credits_granted_by_plan = whole(balance.totalCredits);

  const period = {
    transactions: ledger,
    currentPeriodStart: balance.currentPeriodStart,
    currentPeriodEnd: balance.currentPeriodEnd,
  };
  const activity = summariseCycleActivity({ ...period, totalCredits: balance.totalCredits }, nowMs);
  if (activity) {
    out.credits_spent_this_cycle = `${floor}${whole(activity.totalConsumed)}`;
    out.credits_topped_up_this_cycle = `${floor}${whole(activity.totalToppedUp)}`;
    if (activity.busiest) {
      out[activity.bucketSize === "week" ? "busiest_week" : "busiest_day"] =
        `${dayKey(activity.busiest.start)} with ${whole(activity.busiest.consumed)} credits`;
    }
  }

  const attribution = attributeMeetings(ledger, input.rooms, nowMs);
  const spend = summariseSpendByService(period, nowMs, activity?.bucketSize ?? "day", attribution);
  if (spend) {
    if (input.rooms.length > 0) out.meetings_billed_this_cycle = String(spend.meetings);
    const cards = buildServiceCards(spend, input.serviceUsage ?? null);
    const spendTotal = cards.reduce((sum, card) => sum + card.credits, 0);
    if (cards.length > 0) {
      out.credits_by_ai_service = cards
        .slice(0, MAX_SERVICES)
        .map((card) => {
          const share = spendTotal > 0 ? ` (${Math.round((card.credits / spendTotal) * 100)}%)` : "";
          const uses = card.uses > 0 ? ` over ${card.uses} uses` : "";
          return `${plain(card.label)} ${whole(card.credits)} credits${share}${uses}`;
        })
        .join("; ");
    }
  }

  const memberRows = rankMembers(ledger, memberDirectory([...input.members]));
  const named = memberRows.filter((row) => row.key !== UNKNOWN_MEMBER_KEY);
  const spentTotal = memberRows.reduce((sum, row) => sum + row.credits, 0);
  if (named.length > 0) {
    out.members_who_spent_credits = String(named.length);
    if (spentTotal > 0) out.top_spender_share_of_credits = `${Math.round((named[0].credits / spentTotal) * 100)}%`;
  }

  return out;
}
