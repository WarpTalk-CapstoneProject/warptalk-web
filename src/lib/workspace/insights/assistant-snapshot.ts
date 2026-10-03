/**
 * What WarpBot is told about the Insights Overview the owner has open.
 *
 * WHY A SNAPSHOT AND NOT A TOOL
 *   The platform WarpBot answers "Revenue this month vs last" with read-only admin tools. The
 *   workspace WarpBot has no tool that reads a workspace's credits, plan or tool-call counts, so an
 *   owner asking the same kind of question got "only an admin can see that". The Overview has
 *   already read every one of those figures with the owner's own token, so the page hands them over
 *   as its ambient page context and the worker prints them as "Visible snapshot: key=value, ...".
 *
 * THE RULES IT KEEPS
 *   - Only what the cards print. A source that is loading or did not answer has no key here, so
 *     WarpBot says it does not know instead of reading a missing figure as 0.
 *   - A capped read is "at least N" and carries no previous period, as on the card.
 *   - No comma inside a value: the worker joins the pairs with ", ".
 *   - Figures only. Nothing here names a member or quotes what anyone said.
 */

import type { CreditBalanceDto, SubscriptionDto } from "../../../types/billing.ts";
import { creditsRemainingView, type PeriodFigure } from "./overview-metrics.ts";
import { dayOf, plain, projectionText, rangeText, round1 } from "./snapshot-text.ts";

/** A figure the card shows, or null while its source has not answered. */
type Figure = PeriodFigure | null;

export interface InsightsSnapshotInput {
  /** The window on screen and the one beside every figure. `to` is exclusive. */
  current: { from: Date; to: Date };
  previous: { from: Date; to: Date };
  credits: Figure;
  meetings: Figure;
  hours: Figure;
  toolCalls: Figure;
  /** 0..1; a null value with a ready figure means no calls, so no rate. */
  toolSuccessRate: Figure;
  tools: { error: number; blocked: number; needsSetupPlugins: readonly string[] } | null;
  activeMembers: { active: number; total: number | null } | null;
  /** `null` = no plan; `undefined` = not read. */
  balance: CreditBalanceDto | null | undefined;
  subscription: SubscriptionDto | null | undefined;
  /** Pending plugin requests, or undefined when the plugin list was not read. */
  pendingRequests: number | undefined;
  nowMs: number;
}

function put(
  out: Record<string, string>,
  key: string,
  figure: Figure,
  format: (value: number) => string = round1,
) {
  if (!figure || figure.value === null) return;
  out[key] = `${figure.atLeast ? "at least " : ""}${format(figure.value)}`;
  if (figure.previous !== null) out[`${key}_previous_period`] = format(figure.previous);
}

export function insightsAssistantSnapshot(input: InsightsSnapshotInput): Record<string, string> {
  const out: Record<string, string> = {
    period: rangeText(input.current),
    previous_period: rangeText(input.previous),
  };

  put(out, "credits_used", input.credits);
  put(out, "meetings_held", input.meetings);
  put(out, "hours_translated", input.hours);
  put(out, "warpbot_tool_calls", input.toolCalls);
  put(out, "tool_success_rate", input.toolSuccessRate, (rate) => `${Math.round(rate * 100)}%`);

  if (input.tools) {
    out.tool_calls_failed = String(input.tools.error);
    out.tool_calls_blocked_by_policy = String(input.tools.blocked);
    out.plugins_needing_setup = input.tools.needsSetupPlugins.length > 0 ? input.tools.needsSetupPlugins.map(plain).join("; ") : "none";
  }

  if (input.activeMembers) {
    const { active, total } = input.activeMembers;
    out.active_members = total === null ? String(active) : `${active} of ${total}`;
  }

  if (input.balance === null) {
    out.credits_remaining = "no plan";
  } else if (input.balance) {
    const view = creditsRemainingView(input.balance);
    out.credits_remaining =
      view.percentLeft === null ? String(view.remaining) : `${view.remaining} of ${view.available} (${view.percentLeft}% left)`;
    out.credits_projection = projectionText(input.balance, input.nowMs);
  }

  if (input.subscription === null) {
    out.plan = "no plan";
  } else if (input.subscription) {
    const ends = dayOf(input.subscription.currentPeriodEnd);
    out.plan = `${plain(input.subscription.planName)}; ${input.subscription.cancelAtPeriodEnd ? "ends" : "renews"}${ends ? ` ${ends}` : ""}`;
  }

  if (input.pendingRequests !== undefined) out.pending_plugin_requests = String(input.pendingRequests);

  return out;
}
