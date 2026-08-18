"use client";

/**
 * Choose a plan BEFORE the workspace exists.
 *
 * Every other plan surface in this app lives under `/[workspaceSlug]/payment/plans` and needs a
 * workspace to exist first — a subscription belongs to a workspace, and `createCheckoutSession`
 * refuses without a workspace id. That is exactly why creating a workspace has always come
 * first, and why "pay before you create" could not be expressed anywhere in the product.
 *
 * This page is the missing first step. It quotes prices with no workspace in sight and carries
 * the choice — plan slug and billing cycle — forward to the create form, which creates the
 * workspace and opens Stripe in one continuous action. The buyer therefore experiences
 * plan → pay → workspace, which is the order they were promised.
 *
 * It deliberately does NOT create a checkout session itself. It cannot: there is still no
 * workspace to bill. What it owns is the choice and the price the buyer agreed to; the charge
 * happens one screen later, for exactly the figure quoted here (see lib/billing/plan-pricing).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { buildFeatureList, getPlanDescription } from "@/lib/utils";
import { readCheckoutIntent } from "@/lib/billing/checkout-intent";
import { formatMoney } from "@/lib/format/currency";
import {
  type BillingInterval,
  checkoutTotal,
  monthlyDisplayPrice,
  selectablePlans,
} from "@/lib/billing/plan-pricing";

export default function ChoosePlanBeforeWorkspacePage() {
  const router = useRouter();
  /**
   * The plan clicked on the landing page, if they came that way. WT-491.
   *
   * It arrives as a mark on a card, not as a pre-made purchase: the landing page names a plan
   * but no billing cycle, and charging a year nobody selected is worse than one extra click.
   */
  const searchParams = useSearchParams();
  const preselectedPlanSlug = readCheckoutIntent(searchParams);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  useEffect(() => {
    if (!isAuthenticated || !user) router.replace("/login?callbackUrl=/workspace/plans");
  }, [isAuthenticated, user, router]);

  const { data: plansData = [], isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingService.getPlans(),
  });

  const plans = useMemo(() => selectablePlans(plansData), [plansData]);

  /**
   * The choice travels in the URL, not in a store.
   *
   * It has to survive the create form being reloaded, opened in another tab, or reached after a
   * detour — the same reasoning that put the guest's plan choice in the URL for WT-491. A store
   * would drop it on any of those and the buyer would land on a form that had forgotten what
   * they were buying.
   */
  const choosePlan = (planSlug: string) => {
    router.push(
      `/workspace/create?planSlug=${encodeURIComponent(planSlug)}&billingCycle=${interval}`,
    );
  };

  return (
    <main className="min-h-screen bg-surface-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <button
          type="button"
          onClick={() => router.push("/workspace")}
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-foreground cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="mt-6 text-center">
          <h1 className="text-[22px] font-semibold text-foreground">Choose a plan</h1>
          <p className="mx-auto mt-1 max-w-xl text-[13px] leading-relaxed text-ink-muted text-pretty">
            A workspace runs on a plan. Pick one now — you will name your workspace and pay on
            the next screen, and it opens as soon as the payment goes through.
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <Tabs
            value={interval}
            onValueChange={(value) => setInterval(value === "yearly" ? "yearly" : "monthly")}
          >
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="mt-10 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : plans.length === 0 ? (
          /*
            An empty plan list is a platform misconfiguration, not a state the buyer caused. It
            must not read as "you have no plans" — and it must not strand them either, so the
            one thing they can still do is offered rather than described.
          */
          <div className="mt-10 rounded-lg border border-border bg-surface-2 p-8 text-center">
            <p className="text-[14px] font-medium text-foreground">No plans are available yet.</p>
            <p className="mt-1 text-[12px] text-ink-muted">
              Nothing can be purchased until the platform publishes a plan. Please try again
              later.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const perMonth = monthlyDisplayPrice(plan, interval);
              const total = checkoutTotal(plan, interval);
              const features = buildFeatureList(plan);
              const isPreselected = plan.slug === preselectedPlanSlug;

              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-lg border bg-surface-1 p-5 shadow-sm ${
                    isPreselected ? "border-primary ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[15px] font-semibold text-foreground">{plan.name}</div>
                    {isPreselected && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Your pick
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-muted text-pretty">
                    {plan.description || getPlanDescription(plan.name)}
                  </p>

                  <div className="mt-4">
                    <span className="text-[24px] font-semibold text-foreground">
                      {perMonth > 0 ? formatMoney(perMonth, plan.currency) : "Free"}
                    </span>
                    {perMonth > 0 && (
                      <span className="ml-1 text-[12px] text-ink-muted">/month</span>
                    )}
                    {interval === "yearly" && total > 0 && (
                      <div className="mt-1 text-[11px] text-ink-muted">
                        Billed yearly: {formatMoney(total, plan.currency)}
                      </div>
                    )}
                  </div>

                  <ul className="mt-4 flex-1 space-y-1.5">
                    {features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-1.5 text-[12px] text-ink-muted"
                      >
                        <CheckCircle
                          weight="fill"
                          size={14}
                          className="mt-[1px] shrink-0 text-primary"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => choosePlan(plan.slug)}
                    className="mt-5 h-9 w-full rounded-md bg-primary px-3 text-[12px] font-semibold text-white transition hover:bg-primary-hover cursor-pointer"
                  >
                    Choose {plan.name}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
