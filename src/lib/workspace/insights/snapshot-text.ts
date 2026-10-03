/**
 * The few text rules every WarpBot page snapshot shares (Insights Overview / Usage / Tools,
 * Billing, Plugins).
 *
 * The worker prints a snapshot as "Visible snapshot: key=value, key=value", joining pairs with
 * ", " — so a comma inside a value would read as the start of another pair, and a line break would
 * split the prompt. Everything a user typed (a plugin's label, a plan name) goes through `plain`.
 *
 * The widget's context pill also reads three keys off a snapshot for itself (`title`, `name`,
 * `query`, and `status` for the badge). No snapshot here uses those keys, or the pill would show a
 * figure as the page's title.
 *
 * Free of `@/` imports so `node --test` loads it.
 */

import type { CreditBalanceDto } from "../../../types/billing.ts";
import { daysLeftInCycle, projectCycle } from "../../billing/cycle-projection.ts";

/** One decimal, no trailing ".0": 8.26 → "8.3", 12 → "12". */
export const round1 = (value: number): string => String(Math.round(value * 10) / 10);

/** A whole-number figure as plain digits (no thousands separator: it would be a comma). */
export const whole = (value: number): string => String(Math.round(value));

/** A user-typed string made safe for the "k=v, k=v" line: no comma, no line break, trimmed. */
export function plain(text: string | null | undefined): string {
  return (text ?? "").replace(/[,\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Local YYYY-MM-DD, the calendar the page's period bar is drawn on. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "2026-09-01 to 2026-09-30": the last day an exclusive end still covers. */
export function rangeText(range: { from: Date; to: Date }): string {
  const last = new Date(Math.max(range.from.getTime(), range.to.getTime() - 1));
  return `${dayKey(range.from)} to ${dayKey(last)}`;
}

/** A date from the server as local YYYY-MM-DD, or null when it does not parse. */
export function dayOf(iso: string | null | undefined): string | null {
  const date = iso ? new Date(iso) : null;
  return date && Number.isFinite(date.getTime()) ? dayKey(date) : null;
}

/** The billing cycle's burn rate in words, the same projection the Overview's meter draws. */
export function projectionText(balance: CreditBalanceDto, nowMs: number): string {
  const projection = projectCycle(balance, nowMs);
  if (projection.kind === "runs-out") {
    const days = Math.max(1, Math.round(projection.daysToEmpty));
    return `runs out in about ${days} days at ${Math.round(projection.perDay)} credits per day; ${daysLeftInCycle(balance, nowMs)} days left in the cycle`;
  }
  if (projection.kind === "lasts") {
    return `lasts the cycle; about ${Math.round(projection.creditsLeftAtRenewal)} credits left at renewal`;
  }
  return `no projection: ${projection.reason}`;
}
