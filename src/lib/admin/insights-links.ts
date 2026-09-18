/**
 * Where each Insights figure drills down to.
 *
 * THE ONE RULE (from the OpenBoox ERP `metricLinks`)
 *   A card that links must open the rows that make up its number. The card says 17; the page it
 *   opens shows 17. A card that opens 1,448 rows is worse than a card that cannot be clicked,
 *   because the reader stops trusting both the number and the page.
 *
 *   So a figure is linked only when an existing admin page can already filter to exactly its set,
 *   using a query param that page really reads. None of the admin list pages take a date range
 *   today, so no PERIOD card links — "Cancelled" opening every cancellation ever would break the
 *   rule. Section headers still link to their area; that is navigation, not a claim about a count.
 *
 * Every target and param below is checked against the page source by
 * `src/lib/admin/__tests__/insights-links.test.ts`, so a renamed route or a dropped filter fails
 * the contracts rather than turning into a link that quietly shows everything.
 */

export interface InsightsLinkTarget {
  /** The route, as the admin nav writes it. */
  path: string;
  /** Query params the target page reads, with the value this link sets. */
  params?: Record<string, string>;
}

export const INSIGHTS_LINK_TARGETS = {
  // Figures: exact sets.
  activeSubscriptions: { path: "/admin/subscriptions", params: { status: "active" } },
  liveMeetings: { path: "/admin/meetings", params: { status: "live" } },
  newSalesLeads: { path: "/admin/sales-leads", params: { status: "new" } },
  deadLetters: { path: "/admin/outbox" },
  suspendedWorkspaces: { path: "/admin/workspaces", params: { status: "suspended" } },
  health: { path: "/admin/health" },

  // Section headers: navigation.
  subscriptions: { path: "/admin/subscriptions" },
  subscriptionsEndingSoon: { path: "/admin/subscriptions", params: { sort: "period_end_asc" } },
  meetings: { path: "/admin/meetings" },
  workspaces: { path: "/admin/workspaces" },
  billingLedger: { path: "/admin/billing" },
  plans: { path: "/admin/plans" },
} as const satisfies Record<string, InsightsLinkTarget>;

export type InsightsLinkKey = keyof typeof INSIGHTS_LINK_TARGETS;

export function insightsHref(key: InsightsLinkKey): string {
  const target: InsightsLinkTarget = INSIGHTS_LINK_TARGETS[key];
  const query = new URLSearchParams(target.params ?? {}).toString();
  return query ? `${target.path}?${query}` : target.path;
}

/** One workspace's admin page. The route accepts the id and swaps it for the slug itself (WT-560). */
export function workspaceHref(workspaceId: string | null | undefined): string | null {
  const id = workspaceId?.trim();
  return id ? `/admin/workspaces/${encodeURIComponent(id)}` : null;
}

/**
 * The drill-down for a card id, or null when no page can show exactly that set. Period metrics are
 * deliberately absent — see the rule at the top of this file.
 */
const METRIC_LINKS: Partial<Record<string, InsightsLinkKey>> = {
  activeSubscriptions: "activeSubscriptions",
  liveMeetings: "liveMeetings",
  openSalesLeads: "newSalesLeads",
  deadLetters: "deadLetters",
  suspendedWorkspaces: "suspendedWorkspaces",
};

export function metricHref(metricId: string): string | null {
  const key = METRIC_LINKS[metricId];
  return key ? insightsHref(key) : null;
}
