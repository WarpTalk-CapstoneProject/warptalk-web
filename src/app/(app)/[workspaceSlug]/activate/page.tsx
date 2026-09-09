"use client";

/**
 * The one page a workspace with no plan has.
 *
 * WHAT THIS REPLACES
 *   A workspace is created BEFORE Stripe opens — it has to be, `Subscription.WorkspaceId` is
 *   non-nullable and there is nothing to attach a subscription to until the row exists. So there
 *   is always a window in which a real, named, fully built workspace exists and has never been
 *   paid for, and the only question is what its owner sees during it.
 *
 *   Until now they saw the product. WT-515 stopped the features working and WT-570 redirected
 *   them to `/{slug}/payment/plans` — but that route lives in the `(app)` group, so the redirect
 *   landed them inside the whole portal: sidebar, workspace tabs, header, chatbot, every
 *   destination present and every one of them bouncing back. "Locked features inside the app" is
 *   a punishment screen. It says the workspace is broken, when the truth is that it is finished
 *   and waiting on one thing.
 *
 *   This is that one thing, as a page: the workspace's name, what it costs to open, and the
 *   button that opens it. No portal around it — see `isWorkspaceActivationPath`, which is what
 *   tells the app shell not to draw one.
 *
 * WHY IT IS UNDER [workspaceSlug] AND NOT AT THE TOP LEVEL
 *   It needs the workspace, not just its name: the checkout is billed to a workspace id, and the
 *   plan grid must not be shown to somebody who is not a member. The `[workspaceSlug]` layout
 *   already resolves the slug, calls `SelectWorkspace`, and blocks on a spinner until the store
 *   holds this workspace's id, name and the viewer's role in it. Sitting inside that layout means
 *   this page never repeats any of it — and an unauthorised slug is redirected to /workspace by
 *   the same code that guards every real page.
 *
 * OWNER AND MEMBER SEE THE SAME PAGE
 *   Deliberately, and it is a change from WT-570, which showed members a bare sentence. A member
 *   who cannot open their own workspace is owed the reason, the workspace's name and what their
 *   owner has to do about it — all of which is here. What differs is the buttons: a member gets
 *   no checkout, because a plan is bought once, by somebody who can be billed for it.
 *
 * This file is the wiring. The picture is `WorkspaceActivationLanding`, which takes props and no
 * stores so /dev/workspace-activation-preview can show every state without an unpaid workspace.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { WorkspaceActivationLanding } from "@/components/workspace/workspace-activation-landing";
import { billingService } from "@/services/billing.service";
import { describeSubscription, hasPaidEntitlement } from "@/lib/billing/subscription-state";
import {
  type BillingInterval,
  checkoutCurrency,
  checkoutTotal,
  selectablePlans,
} from "@/lib/billing/plan-pricing";
import { readCheckoutIntent } from "@/lib/billing/checkout-intent";
import { normalizeWorkspaceSlug } from "@/lib/workspace/workspace-slug";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import type { PlanDto, SubscriptionDto } from "@/types/billing";

export default function WorkspaceActivationPage() {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const slug = normalizeWorkspaceSlug(params?.workspaceSlug) ?? "";
  /**
   * The plan this buyer already picked, if the create form sent them here after a checkout that
   * did not open. WT-491 carries that choice through sign-up in the URL; dropping it here would
   * make the failure cost them the decision as well as the payment.
   */
  const preselectedPlanSlug = readCheckoutIntent(useSearchParams());

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const canBuy = roleLoaded && (role === "owner" || role === "admin");

  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [pendingPlanSlug, setPendingPlanSlug] = useState<string | null>(null);

  const { data: plansData = [], isLoading: plansLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingService.getPlans(),
  });
  const plans = useMemo(() => selectablePlans(plansData), [plansData]);

  /**
   * The same query the paywall runs, option for option.
   *
   * Identical observers share one cache entry, so this reads the answer the gate outside already
   * fetched rather than issuing a second request with subtly different semantics. (The plans page
   * does the opposite — same key, a queryFn that swallows the error into `null` — and two
   * observers disagreeing about what a failure MEANS on one cache entry is a bug waiting for a
   * refetch to expose it.)
   */
  const subscriptionQuery = useQuery<SubscriptionDto | null>({
    queryKey: ["subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 60_000,
  });

  // Read once per mount. This decides which sentence the page tells, and a moving `Date.now()`
  // would let it change under a reader mid-session.
  const [clock] = useState(() => Date.now());
  const subscriptionState = describeSubscription(subscriptionQuery.data ?? null, clock);
  const isPaid = hasPaidEntitlement(subscriptionState);

  /**
   * Somebody who already has a plan does not belong on the activation screen.
   *
   * The paywall lets this route through unconditionally — it has to, or the page that unlocks a
   * workspace could be covered by the lock — so "already paid" is this page's own to notice. It
   * happens on Back from a checkout that succeeded, or when a second tab finished paying.
   */
  useEffect(() => {
    if (isPaid && slug) router.replace(`/${slug}/home`);
  }, [isPaid, slug, router]);

  const choosePlan = async (plan: PlanDto) => {
    if (!user) {
      router.push("/login");
      return;
    }

    // WT-370 — never bill a USER ID as a workspace. There is no sensible fallback here: a plan
    // belongs to a workspace, and a well-formed Guid that is not one passes every validation
    // downstream and fails on the foreign key after the card has been charged.
    if (!workspaceId) {
      toast.error("This workspace is still loading. Give it a moment and try again.");
      return;
    }

    try {
      setPendingPlanSlug(plan.slug);
      const url = await billingService.createCheckoutSession({
        userId: user.id,
        workspaceId,
        amount: checkoutTotal(plan, interval),
        // WT-518: the plan decides its own denomination. A literal here charged a USD plan in VND
        // while every screen quoted it in USD.
        currency: checkoutCurrency(plan),
        paymentType: "Subscription",
        planSlug: plan.slug,
        billingCycle: interval,
      });
      if (url) {
        window.location.assign(url);
        return;
      }
      toast.error("Checkout could not be started. Please try again.");
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    }
    setPendingPlanSlug(null);
  };

  return (
    <WorkspaceActivationLanding
      workspaceName={activeWorkspaceName?.trim() || slug}
      canBuy={canBuy}
      plans={plans}
      plansLoading={plansLoading}
      interval={interval}
      onIntervalChange={setInterval}
      pendingPlanSlug={pendingPlanSlug}
      preselectedPlanSlug={preselectedPlanSlug}
      onChoosePlan={(plan) => void choosePlan(plan)}
      lapsed={
        subscriptionState.kind === "lapsed"
          ? { planName: subscriptionState.planName, endedOn: subscriptionState.endedOn }
          : null
      }
      onSwitchWorkspace={() => router.push("/workspace")}
      onSignOut={() => {
        logout();
        router.replace("/login");
      }}
    />
  );
}
