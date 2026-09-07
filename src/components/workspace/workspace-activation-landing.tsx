"use client";

/**
 * What a workspace with no plan looks like. The picture only — see
 * `app/(app)/[workspaceSlug]/activate/page.tsx` for the workspace, the money and the redirects.
 *
 * SPLIT FOR THE SAME REASON AS `usage-warning-card`: the real thing only appears to a workspace
 * that has been created and not paid for, which is a state nobody can get into on purpose to look
 * at — you would have to start a checkout and abandon it, twice, once as an owner and once as a
 * member. That is not a way to check whether a page reads well, so this renders from props and
 * /dev/workspace-activation-preview shows every state at once.
 *
 * It takes no queries, no stores and no router. Everything it needs is passed in.
 */

import { ArrowSquareOut, Check, SignOut, Storefront } from "@phosphor-icons/react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type BillingInterval,
  checkoutTotal,
  monthlyDisplayPrice,
} from "@/lib/billing/plan-pricing";
import { buildFeatureList, getPlanDescription } from "@/lib/utils";
import { formatMoney } from "@/lib/format/currency";
import type { PlanDto } from "@/types/billing";

/** One date format for the page, matching the plans screen. */
const formatDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export type ActivationLandingProps = {
  /** The workspace's own name. The old screen never said which workspace it was talking about. */
  workspaceName: string;
  /** Whether this viewer can actually buy. A member sees the prices and no buttons. */
  canBuy: boolean;
  plans: PlanDto[];
  plansLoading: boolean;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  /** The plan whose checkout is opening, if one is. Locks the other buttons while Stripe loads. */
  pendingPlanSlug: string | null;
  /**
   * The plan this buyer already chose, if they arrived mid-purchase. WT-491.
   *
   * A mark on a card, never a pre-made purchase: the choice was made before the workspace
   * existed and often before the billing cycle was, and charging a year nobody selected is worse
   * than one extra click.
   */
  preselectedPlanSlug?: string | null;
  onChoosePlan: (plan: PlanDto) => void;
  /**
   * Set when the workspace HAD a plan and it ran out, so a returning customer is not told they
   * never had one. Absent for a workspace that has never been paid for.
   */
  lapsed?: { planName: string; endedOn: Date } | null;
  onSwitchWorkspace: () => void;
  onSignOut: () => void;
};

export function WorkspaceActivationLanding({
  workspaceName,
  canBuy,
  plans,
  plansLoading,
  interval,
  onIntervalChange,
  pendingPlanSlug,
  preselectedPlanSlug,
  lapsed,
  onChoosePlan,
  onSwitchWorkspace,
  onSignOut,
}: ActivationLandingProps) {
  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-5">
        <span className="text-[13px] font-semibold tracking-tight text-ink">WarpTalk</span>
        <div className="flex items-center gap-1">
          {/* The two ways out. A landing with no exit is a lock-out: somebody who belongs to a
              second workspace, or who signed in on the wrong account, must be able to leave
              without clearing cookies. */}
          <button
            type="button"
            onClick={onSwitchWorkspace}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ArrowSquareOut size={14} />
            Switch workspace
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <SignOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-5 pb-16">
        <section className="mx-auto max-w-2xl text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full border border-border bg-surface-1 text-ink-muted">
            <Storefront size={20} />
          </span>

          {/* The workspace's own name, at the size of a title. */}
          <h1 className="mt-5 text-balance text-[28px] font-semibold leading-tight tracking-tight text-ink">
            {workspaceName} is ready — it just needs a plan
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-pretty text-[14px] leading-6 text-ink-muted">
            {lapsed
              ? `The ${lapsed.planName} plan ended on ${formatDate(lapsed.endedOn)}. Everything in this workspace is exactly where you left it, and opens again the moment a plan is active.`
              : canBuy
                ? "Your workspace, its members and its settings are all saved. Choose a plan to open it — meetings, live translation and everything else start working straight away."
                : "This workspace has not been activated yet. Nothing has been lost — it opens for everyone as soon as its owner picks a plan."}
          </p>

          {!canBuy && (
            <p className="mx-auto mt-4 max-w-md rounded-lg border border-border bg-surface-1 px-4 py-3 text-[13px] leading-6 text-ink-muted">
              Only an owner or admin of {workspaceName} can activate a plan. Here is what it would
              cost — send it to them, and the workspace opens for the whole team at once.
            </p>
          )}
        </section>

        {plans.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Tabs
              value={interval}
              onValueChange={(value) => onIntervalChange(value === "yearly" ? "yearly" : "monthly")}
            >
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly · save 21%</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {plansLoading ? (
          <div className="mt-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : plans.length === 0 ? (
          /* An empty catalogue is a platform misconfiguration, not something the viewer did, and
             it must not read as "your workspace has no plans available". */
          <div className="mx-auto mt-10 max-w-md rounded-lg border border-border bg-surface-1 p-8 text-center">
            <p className="text-[14px] font-medium text-ink">No plans are published yet.</p>
            <p className="mt-1.5 text-[12.5px] leading-6 text-ink-muted">
              Nothing can be purchased until the platform publishes a plan. This is on our side,
              not yours — please try again shortly.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, index) => {
              const perMonth = monthlyDisplayPrice(plan, interval);
              const total = checkoutTotal(plan, interval);
              const features = buildFeatureList(plan);
              const isFeatured = index === 0;
              const isPending = pendingPlanSlug === plan.slug;
              const isPicked = Boolean(preselectedPlanSlug) && preselectedPlanSlug === plan.slug;

              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-[14px] border bg-surface-1 p-5 shadow-linear transition-colors ${
                    isPicked
                      ? "border-primary ring-1 ring-primary"
                      : isFeatured
                        ? "border-primary/40"
                        : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[15px] font-semibold tracking-tight text-ink">
                      {plan.name}
                    </div>
                    {(isPicked || isFeatured) && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {isPicked ? "Your pick" : "Most popular"}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 min-h-[36px] text-pretty text-[12px] leading-relaxed text-ink-muted">
                    {plan.description || getPlanDescription(plan.name)}
                  </p>

                  <div className="mt-4">
                    <span className="text-[24px] font-semibold tracking-tight text-ink">
                      {/* WT-459: the plan's OWN currency. An admin priced a plan at 200 USD and a
                          hardcoded "VND" rendered it three orders of magnitude out. */}
                      {perMonth > 0 ? formatMoney(perMonth, plan.currency) : "Free"}
                    </span>
                    {perMonth > 0 && <span className="ml-1 text-[12px] text-ink-muted">/month</span>}
                    {interval === "yearly" && total > 0 && (
                      <div className="mt-1 text-[11px] text-ink-muted">
                        Billed yearly: {formatMoney(total, plan.currency)}
                      </div>
                    )}
                  </div>

                  {canBuy && (
                    <button
                      type="button"
                      disabled={Boolean(pendingPlanSlug)}
                      onClick={() => onChoosePlan(plan)}
                      className={`mt-5 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md px-3 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        isFeatured
                          ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                          : "bg-foreground text-background hover:opacity-90"
                      }`}
                    >
                      {isPending ? "Opening checkout…" : `Activate with ${plan.name}`}
                    </button>
                  )}

                  <ul className="mt-5 flex-1 space-y-2">
                    {features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-[12.5px] leading-5 text-ink-muted"
                      >
                        <Check weight="bold" size={13} className="mt-[3px] shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {canBuy && plans.length > 0 && (
          <p className="mx-auto mt-8 max-w-xl text-center text-[12px] leading-6 text-ink-muted">
            Payment is handled by Stripe. You come back here the moment it goes through, and the
            workspace opens on its own.
          </p>
        )}
      </div>
    </main>
  );
}
