"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createHubConnection } from "@/lib/realtime/signalr";
import {
  canCancelRenewal,
  describeSubscription,
  hasPaidEntitlement,
} from "@/lib/billing/subscription-state";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceRole,
  useWorkspaceRoleLoaded,
} from "@/hooks/use-workspace-role";
import type { PlanDto, SubscriptionDto } from "@/types/billing";
import {
  CaretLeft,
  Lock,
  X,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format/currency";
import { checkoutTotal, checkoutCurrency, monthlyDisplayPrice, selectablePlans } from "@/lib/billing/plan-pricing";

// We fetch plans dynamically now.

/**
 * Buying credit is switched off here, and the panel says so.
 *
 * WHY THE BUTTON IS GONE
 *     It posted `paymentType: "CreditTopUp"`, and the backend has no such payment type —
 *     PaymentConstants.PaymentTypes is Subscription / SubscriptionRenewal / SubscriptionUpdate /
 *     InvoicePayment. So no handler matched, `if (handler is not null)` skipped the credit grant
 *     in silence, and the request still wrote a payment record, issued an invoice and returned
 *     success. The customer paid, saw an invoice, and their balance never moved. There are only
 *     three paths that raise CreditsRemaining — cycle renewal, the subscription handler, and an
 *     admin adjustment — and the gRPC top-up is refused outright with "Direct credit top-up is
 *     disabled".
 *
 *     A button that takes money and grants nothing cannot stay reachable while the handler is
 *     written. Turning it off is the smallest change that stops the harm.
 *
 * WT-429 — THE HANDLER NOW EXISTS, SO THIS IS BACK ON.
 *     CreditTopUpPaymentEventHandler is registered and claims "CreditTopUp"; the credit count
 *     travels on the Stripe session metadata; and PaymentAppService logs loudly when a PAID
 *     payment type matches no handler, so the silent version of this incident cannot recur.
 *
 * WHY THE PRICE IS NO LONGER OURS TO QUOTE
 *     The ladder here was 10 / 9 / 8.5 / 8 VND per credit with volume discounts. None of it was
 *     real: docs/credit-economics.md §4.2 sets retail at 4.00 VND with no discount, and the
 *     backend agreed (CreditValueVnd = 4m) — the frontend was overcharging by 2–2.5×.
 *
 *     The fix is not a corrected constant. The request now carries the CREDIT COUNT and the
 *     server prices it against billing_pricing_config, overwriting whatever amount we sent, so
 *     this page cannot drift from the real rate again. DOCUMENTED_VND_PER_CREDIT survives for
 *     the on-screen estimate ONLY; the charge is whatever the server computes.
 */
/*
 * WT-464: TOP_UP_ENABLED, TOP_UP_MINIMUM_CREDITS, TOP_UP_PACKAGES and
 * DOCUMENTED_VND_PER_CREDIT moved with the form to
 * settings/billing/components/top-up-modal.tsx. The reasoning above about the server owning the
 * price moved with them, because that is where it now applies.
 */

/** One date format for the page, so "until 14 September 2026" reads the same wherever it appears. */
const formatPlanDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function WorkspacePlansPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.workspaceSlug as string;
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const role = useWorkspaceRole();
  const isRoleLoaded = useWorkspaceRoleLoaded();

  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonOther, setCancelReasonOther] = useState("");

  const CANCEL_REASONS = [
    "Too expensive",
    "Not using it enough",
    "Missing features I need",
    "Switching to another service",
    "Other",
  ];
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false);
  const [pendingPlanSlug, setPendingPlanSlug] = useState("");
  const [pendingPlanName, setPendingPlanName] = useState("");
  const [pendingPlanTotal, setPendingPlanTotal] = useState(0);
  // Fetch plans from backend
  const { data: plansData = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingService.getPlans(),
  });

  const activePlans = selectablePlans(plansData);

  useEffect(() => {
    if (!isAuthenticated || !user) router.push("/login");
  }, [isAuthenticated, user, router]);

  const { data: subscription = null, isLoading: loadingSub } =
    useQuery<SubscriptionDto | null>({
      queryKey: ["subscription", activeWorkspaceId],
      queryFn: async () => {
        try {
          return await billingService.getActiveSubscription(activeWorkspaceId!);
        } catch {
          return null;
        }
      },
      enabled: !!activeWorkspaceId,
    });

  // SignalR for real-time plan updates
  useEffect(() => {
    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      if (notification?.type === "billing.plan_changed") {
        console.log("Real-time plan update received:", notification.content);
        toast.info(notification.content, { duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ["plans"] });
      }
    });

    let isMounted = true;
    connection.start().catch((err) => {
      if (!isMounted) return;
      if (err?.message?.includes("stop() was called")) return;
    });

    return () => {
      isMounted = false;
      connection.stop();
    };
  }, [queryClient]);

  const activePlanId = subscription?.planId;
  const activePlanTierIndex = activePlanId
    ? activePlans.findIndex((p) => p.id === activePlanId)
    : -1;

  /**
   * One reading of the subscription, for the whole page.
   *
   * `subscription?.status === "active"` was the test here, in three places, and it is the bug:
   * a renewal cancelled at period end sets Status to "cancelled" while the plan stays fully in
   * force, so the page reported no plan on a workspace that had one.
   *
   * The clock is read once per mount rather than per render — this decides which controls exist,
   * and a moving `Date.now()` would let them change under a reader mid-session.
   */
  const [subscriptionClock] = useState(() => Date.now());
  const subscriptionState = describeSubscription(subscription, subscriptionClock);
  const planEndsOn =
    subscriptionState.kind === "cancellation-scheduled" ? subscriptionState.endsOn : null;

  /**
   * WT-381 — this used to PUT `/subscriptions/workspace/{id}/change-plan`, a route that does not
   * exist anywhere in the billing service. Every owner who reached this button got a 404 dressed
   * up as "contact sales", and the dialog they got it from promised a pro-rated credit for their
   * unused time, which nothing in the system has ever calculated.
   *
   * Checkout is the path that works, and it has worked all along. `SubscriptionPaymentEventHandler`
   * writes `Subscription.PlanId = plan.Id` when a payment arrives for a workspace that already has
   * a subscription — so paying for a different plan IS the plan change. What it does not do is
   * pro-rate: it sets `CurrentPeriodStart` to now, moves the period end a full cycle out, and adds
   * the new plan's credits to the balance. The dialog now says that, because that is what happens.
   */
  const confirmChangePlan = () => {
    if (!pendingPlanSlug) return;
    setShowChangePlanDialog(false);
    void handleCheckout(pendingPlanTotal, "Subscription", pendingPlanSlug, billingInterval, true);
  };

  const handleCheckout = async (
    amount: number,
    paymentType: string,
    planSlug = "",
    billingCycle = "",
    /** Set once the change-plan dialog has been confirmed, so it is not shown a second time. */
    confirmed = false,
    /** WT-429, top-ups only: the credit count. The SERVER prices it — see below. */
    credits = 0,
  ) => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    // Moving between plans charges in full and restarts the billing period today — see
    // confirmChangePlan. Nobody should discover that on a Stripe page, so it is said first.
    if (
      paymentType === "Subscription" &&
      !confirmed &&
      hasPaidEntitlement(subscriptionState)
    ) {
      const targetPlan = activePlans.find((p) => p.slug === planSlug);

      if (targetPlan) {
        setPendingPlanSlug(planSlug);
        setPendingPlanName(targetPlan.name);
        setPendingPlanTotal(amount);
        setShowChangePlanDialog(true);
        return;
      }
    }

    // WT-370 — never bill a USER ID as a workspace.
    //
    // This used to fall back to `activeWorkspaceId || user.id`, so a checkout started before the
    // workspace store had hydrated sent the buyer's own id in the WorkspaceId metadata. It is a
    // well-formed Guid, so every validation downstream passes it: the webhook parses it, the
    // handler builds a Subscription row against it, and the INSERT then fails on the workspace
    // foreign key — inside a try/catch that logs and, until today, answered Stripe 200 OK. Money
    // taken, no plan, no retry, nothing to see in the dashboard.
    //
    // There is no sensible fallback here. A plan belongs to a workspace; without one there is
    // nothing to buy, and saying so is better than guessing an id that will fail four layers away.
    if (!activeWorkspaceId) {
      toast.error(
        "Open a workspace before choosing a plan — a subscription belongs to a workspace.",
      );
      return;
    }

    try {
      setIsProcessing(true);
      const url = await billingService.createCheckoutSession({
        userId: user.id,
        workspaceId: activeWorkspaceId,
        amount,
        // WT-518: the plan decides its own denomination. A literal here charged a USD plan
        // in VND while every screen quoted it in USD.
        currency: checkoutCurrency(activePlans.find((p) => p.slug === planSlug)),
        paymentType,
        planSlug: planSlug || undefined,
        billingCycle: billingCycle || undefined,
        credits: credits > 0 ? credits : undefined,
      });
      if (url) window.location.assign(url);
    } catch {
      toast.error("Failed to initiate checkout. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!activeWorkspaceId) return;
    const finalReason =
      cancelReason === "Other"
        ? cancelReasonOther.trim() || "Other"
        : cancelReason || "User requested cancellation";
    try {
      setIsCancelling(true);
      await billingService.cancelSubscription(activeWorkspaceId, finalReason);
      toast.success(
        "Subscription cancelled. You will retain access until the end of your billing period.",
      );
      // WT-381 — this wrote `null` here, and the page then showed a workspace with no plan at all.
      // The backend had done no such thing: `Cancel()` sets AutoRenew=false and Status=cancelled
      // and leaves IsActive=true on purpose, so the workspace keeps Enterprise to the end of the
      // period it paid for. Refetching asks the only party that knows.
      await queryClient.invalidateQueries({
        queryKey: ["subscription", activeWorkspaceId],
      });
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      setShowCancelDialog(false);
      setCancelReason("");
      setCancelReasonOther("");
    } catch {
      toast.error("Failed to cancel subscription. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const getPlanAction = (plan: PlanDto) => {
    if (loadingSub || loadingPlans)
      return { label: "Loading...", variant: "loading", disabled: true };
    const planTierIndex = activePlans.findIndex((p) => p.id === plan.id);
    const isCurrent = activePlanId === plan.id;
    if (isCurrent)
      return { label: "Current Plan", variant: "current", disabled: true };
    if (activePlanTierIndex === -1)
      return { label: "Get Started", variant: "get-started", disabled: false };
    if (planTierIndex > activePlanTierIndex)
      return { label: "Upgrade", variant: "upgrade", disabled: false };
    return { label: "Downgrade", variant: "downgrade", disabled: false };
  };


  if (!isRoleLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="flex h-[80vh] items-center justify-center w-full">
        <Card className="max-w-md border-hairline bg-surface-1/40 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can manage subscription
              plans and top-up credits.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    /* This was a marketing landing page living inside the product: a 5xl centred headline, a
       "Pricing & Subscriptions" badge above it, and a lead paragraph — the visual language of a
       website's /pricing, rendered inside a workspace the user has already signed into and paid
       attention to. It is a settings screen. It gets the settings chrome: the same toolbar row
       every other workspace page has, with the one real choice (monthly or yearly) in it. */
    <div className="flex h-full min-h-0 flex-col bg-surface-1 text-ink">
      <div className="flex shrink-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-[260px] flex-1 items-center gap-3">
          <Link
            href={`/${slug}/settings/billing`}
            className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <CaretLeft className="h-3.5 w-3.5" />
            <span>Billing</span>
          </Link>
          {/* WT-381 — this said "No active plan on this workspace" to anyone who had cancelled
              their renewal, which was the plainest form of the lie: the workspace is on the plan,
              paid for, until the date now printed beside it. */}
          <span className="truncate text-[13px] text-ink-muted">
            {subscriptionState.kind === "active" &&
              `Currently on ${subscriptionState.planName}.`}
            {subscriptionState.kind === "cancellation-scheduled" &&
              `${subscriptionState.planName} until ${formatPlanDate(subscriptionState.endsOn)} — renewal cancelled.`}
            {subscriptionState.kind === "lapsed" &&
              `${subscriptionState.planName} ended on ${formatPlanDate(subscriptionState.endedOn)}.`}
            {subscriptionState.kind === "none" && "No active plan on this workspace."}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 pl-4">
          <Tabs
            value={billingInterval}
            onValueChange={(val) => setBillingInterval(val as "monthly" | "yearly")}
            className="w-fit"
          >
            <TabsList className="h-[28px] rounded-full border border-border/60 bg-surface-2 p-0.5">
              <TabsTrigger
                value="monthly"
                className="h-[24px] rounded-full px-3 text-[12px] data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger
                value="yearly"
                className="h-[24px] rounded-full px-3 text-[12px] data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm"
              >
                Yearly · save 21%
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-8">
      {/* One container width for the whole page, and one card width whatever the plan count.
          The grid used to resize itself around however many plans existed — max-w-[380px] for
          one, 1150px for three — so a workspace with a single plan got one narrow card floating
          in the middle of an empty screen, directly above a full-width "Need more credits?"
          panel. Two blocks, two different pages. The columns are fixed now and a short row is
          simply a short row. */}
      <div className="mx-auto flex flex-wrap justify-center gap-6 w-full max-w-5xl">
        {loadingPlans ? (
          <div className="flex w-full items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          activePlans.map((plan, index) => {
            const action = getPlanAction(plan);
            const isCurrent = action.variant === "current";
            const isFeatured = index === 0; // Highlight the first plan or based on some custom logic

            // The 21% yearly discount used to be a bare 0.79 written twice, right here. It now
            // lives in lib/billing/plan-pricing because /workspace/plans quotes the same prices
            // before a workspace exists and the create form sends the charged amount to Stripe —
            // three copies of one rule is three chances for the quote and the charge to disagree.
            const displayPrice = monthlyDisplayPrice(plan, billingInterval);
            const displayTotal = checkoutTotal(plan, billingInterval);

            let parsedFeatures: string[] = [];
            try {
              parsedFeatures = JSON.parse(plan.features || "[]");
              if (!Array.isArray(parsedFeatures)) {
                parsedFeatures = [];
              }
            } catch {
              parsedFeatures = [];
            }

            return (
              /* Palette tokens, not #7F1DFF and text-gray-900. The hardcoded pair meant the card
                 rendered near-black text on near-black in dark mode, and its accent was a purple
                 that appears nowhere else in the app. */
              <Card
                key={plan.id}
                className={`relative flex h-full w-full sm:w-[340px] md:w-[360px] shrink-0 flex-col overflow-hidden rounded-[14px] border bg-surface-1 p-5 shadow-linear transition-colors ${
                  isCurrent
                    ? "border-primary"
                    : isFeatured
                      ? "border-primary/40"
                      : "border-border hover:border-border/80"
                }`}
              >
                <CardHeader className="flex flex-col items-start p-0 pb-4 text-left">
                  <div className="mb-2 flex w-full items-center justify-between gap-2">
                    <CardTitle className="text-[15px] font-semibold tracking-tight text-ink">
                      {plan.name}
                    </CardTitle>

                    <div className="flex shrink-0 gap-2">
                      {isCurrent && (
                        <Badge className="rounded-full border-none bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Current plan
                        </Badge>
                      )}
                      {!isCurrent && isFeatured && (
                        <Badge className="rounded-full border-none bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Most popular
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="min-h-[34px] text-[12px] leading-relaxed text-ink-muted">
                    {plan.description}
                  </p>

                  <div className="mt-4 flex w-full flex-col items-start">
                    <div className="flex items-baseline whitespace-nowrap">
                      <span className="text-[24px] font-semibold tracking-tight text-ink">
                        {/* WT-459: the plan's OWN currency, not a hardcoded "VND".
                            An admin priced a plan at 200 USD and this rendered "200 VND" —
                            a number three orders of magnitude out, stated with total
                            confidence. `PlanDto.currency` has always carried the answer;
                            formatMoney already falls back to VND when it is absent, so
                            nothing changes for the VND plans that make up the catalogue. */}
                        {displayPrice > 0 ? formatMoney(displayPrice, plan.currency) : "Free"}
                      </span>
                      <span className="ml-1 text-[12px] text-ink-muted">/mo</span>
                    </div>

                    <p className="mt-1.5 text-[11px] text-ink-muted">
                      Pause or cancel anytime · 24/7 support
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 p-0 pb-6">
                  {/* Styled action button inside content wrapper matching reference */}
                  <div className="mb-6">
                    {!isCurrent && (
                      <button
                        type="button"
                        disabled={action.disabled || isProcessing}
                        onClick={() => {
                          handleCheckout(
                            displayTotal,
                            "Subscription",
                            plan.slug,
                            billingInterval,
                          );
                        }}
                        className={`inline-flex items-center justify-center gap-2 w-full rounded-full h-11 text-xs font-bold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          action.variant === "upgrade" ||
                          action.variant === "get-started"
                            ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm"
                            : "bg-foreground text-background hover:opacity-90 shadow-sm"
                        }`}
                      >
                        {isProcessing ? "Processing..." : "Get Started"}
                      </button>
                    )}
                    {/* No cancel button inside the plan card.
                        It sat where every other card shows "Get started", so the primary action on
                        the plan you already have was to leave — the loudest thing on the page
                        pointed at the exit. Ending a subscription is also not a per-plan choice:
                        it belongs to the account, once, and it now lives under the grid.

                        The disabled "Cancelled (Ends soon)" button that replaced it was worse
                        still: a button-shaped thing that cannot be pressed, occupying the slot a
                        reader looks to for what they can do. The state is on the badge above. */}
                  </div>

                  <ul className="space-y-3">
                    {parsedFeatures.map((feature: string, i: number) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-[13px]"
                      >
                        <span className="text-[#00E58F] shrink-0 mt-0.5 font-bold">
                          ✓
                        </span>
                        <span className="text-gray-700 font-medium">
                          {feature}
                        </span>
                      </li>
                    ))}
                    {!parsedFeatures.length && (
                      <>
                        <li className="flex items-start gap-2.5 text-[13px]">
                          <span className="text-[#00E58F] shrink-0 mt-0.5 font-bold">
                            ✓
                          </span>
                          <span className="text-gray-700 font-medium">
                            {plan.creditsPerCycle?.toLocaleString()} credits per
                            cycle
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5 text-[13px]">
                          <span className="text-[#00E58F] shrink-0 mt-0.5 font-bold">
                            ✓
                          </span>
                          <span className="text-gray-700 font-medium">
                            {plan.voiceCloneEnabled
                              ? "Voice Cloning Enabled"
                              : "No Voice Cloning"}
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5 text-[13px]">
                          <span className="text-[#00E58F] shrink-0 mt-0.5 font-bold">
                            ✓
                          </span>
                          <span className="text-gray-700 font-medium">
                            Web access for up to {plan.maxParticipants} members
                          </span>
                        </li>
                      </>
                    )}
                  </ul>
                </CardContent>

                <CardFooter className="p-0 mt-auto flex flex-col gap-2">
                  {isCurrent && subscription?.currentPeriodEnd && (
                    <p className="text-[11px] text-gray-400 font-medium text-center w-full">
                      Renews on{" "}
                      {new Date(
                        subscription.currentPeriodEnd,
                      ).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  {billingInterval === "yearly" && (
                    <p className="text-[11px] text-[#7F1DFF] font-semibold text-center w-full">
                      Billed yearly: {formatMoney(displayTotal, plan.currency)}
                    </p>
                  )}
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>

      {/* Cancel RENEWAL, not the subscription.
          The old wording and the old endpoint said "Cancel Subscription", which reads as "end it
          now" — and an owner who wanted to stop paying next month had no way to say so without
          fearing they would cut translation off mid-cycle for everybody. What the API actually
          does is set cancelAtPeriodEnd: the plan runs to the date it was paid for. The label now
          says that, and the confirmation dialog says the date out loud. */}
      {canCancelRenewal(subscriptionState) ? (
        <div className="mt-6 flex w-full max-w-3xl justify-center">
          <button
            type="button"
            disabled={isCancelling}
            onClick={() => setShowCancelDialog(true)}
            className="text-[12px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-50"
          >
            Cancel renewal
          </button>
        </div>
      ) : null}

      {/* Once it has been done, say so — and say what is still true. Silence here was read as the
          cancellation not having worked, which is what sent owners back to press it again.
          Resuming a scheduled cancellation needs a backend endpoint that does not exist yet
          (WT-381), so this does not offer a button it cannot honour. */}
      {planEndsOn ? (
        <div className="mt-6 flex w-full max-w-3xl justify-center">
          <p className="max-w-md text-center text-[12px] leading-5 text-ink-muted">
            Renewal is cancelled. Everything keeps working until{" "}
            <span className="font-medium text-ink">{formatPlanDate(planEndsOn)}</span>, and you
            will not be charged again. To keep the plan beyond that date, contact WarpTalk before
            it ends.
          </p>
        </div>
      ) : null}

      {/*
        WT-464: the credit top-up form used to live here, stacked under the plan cards.

        It made buying credits something you found by SCROLLING PAST a plan comparison — two
        unrelated questions on one page, and the second one below the fold. Top-up is an
        errand: it is now a modal opened from the balance it changes, on Settings -> Billing.

        Nothing about the purchase changed. The same createCheckoutSession call, carrying the
        credit COUNT so the server prices it against billing_pricing_config, is in
        settings/billing/components/top-up-modal.tsx.
      */}
      </div>
      {/* Cancel Subscription confirmation dialog */}
      <Dialog
        open={showCancelDialog}
        onOpenChange={(open) => {
          setShowCancelDialog(open);
          if (!open) {
            setCancelReason("");
            setCancelReasonOther("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px] border-hairline bg-surface-1 shadow-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-ink">
              Cancel renewal?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-muted mt-1">
              Your workspace will remain on the{" "}
              <strong>{subscription?.planName}</strong> plan until{" "}
              <strong>
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "long", year: "numeric" },
                    )
                  : "the end of the period"}
              </strong>
              . After that, your workspace will revert to basic access.
            </DialogDescription>
          </DialogHeader>

          {/* Reason selection */}
          <div className="space-y-3 my-1">
            <p className="text-sm font-medium text-ink">
              Why are you cancelling?{" "}
              <span className="text-ink-muted font-normal">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setCancelReason(r);
                    if (r !== "Other") setCancelReasonOther("");
                  }}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-all cursor-pointer ${
                    cancelReason === r
                      ? "bg-red-500/10 border-red-400/60 text-red-500"
                      : "bg-surface-2 border-hairline text-ink-muted hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {cancelReason === "Other" && (
              <textarea
                value={cancelReasonOther}
                onChange={(e) => setCancelReasonOther(e.target.value)}
                placeholder="Tell us more (optional)..."
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            )}
          </div>

          <div className="rounded-lg border border-hairline bg-surface-2 p-4 text-xs text-ink-muted space-y-1">
            <p>• Credits already used this cycle will not be refunded.</p>
            <p>• You can re-subscribe at any time.</p>
            <p>• Active rooms and history will not be deleted.</p>
          </div>

          <DialogFooter className="flex gap-2 flex-row justify-end">
            <button
              type="button"
              onClick={() => {
                setShowCancelDialog(false);
                setCancelReason("");
                setCancelReasonOther("");
              }}
              className="inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 px-4 text-sm font-medium text-ink cursor-pointer transition"
            >
              Keep Subscription
            </button>
            <button
              type="button"
              disabled={isCancelling}
              onClick={handleCancel}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-red-500 hover:bg-red-600 px-4 text-sm font-medium text-white cursor-pointer transition disabled:opacity-60"
            >
              <X className="h-4 w-4" />
              {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Change Subscription confirmation dialog */}
      <Dialog
        open={showChangePlanDialog}
        onOpenChange={setShowChangePlanDialog}
      >
        <DialogContent className="sm:max-w-[440px] border-hairline bg-surface-1 shadow-lg rounded-xl text-ink">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Move to {pendingPlanName}?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-muted mt-1">
              This workspace is already on{" "}
              <strong>
                {subscriptionState.kind === "none" ? "a plan" : subscriptionState.planName}
              </strong>
              . Moving is a new purchase, not an adjustment to the current one.
            </DialogDescription>
          </DialogHeader>
          {/* Every line here is what SubscriptionPaymentEventHandler actually does on payment.
              The three it replaced were written for an endpoint that did not exist, and the
              middle one — "any unused time will be credited to this change" — promised a
              pro-rated refund that nothing in the billing service has ever calculated. */}
          <div className="rounded-lg border border-hairline bg-surface-2 p-4 text-xs text-ink-muted space-y-1.5 my-2">
            <p>
              • <strong>You pay in full today</strong>:{" "}
              {formatMoney(pendingPlanTotal, "VND")} for one{" "}
              {billingInterval === "yearly" ? "year" : "month"}.
            </p>
            <p>
              • <strong>The billing period restarts</strong>: it runs from today, and time
              remaining on the current plan is not refunded or pro-rated.
            </p>
            <p>
              • <strong>Credits are added, not replaced</strong>: the new plan&apos;s allowance
              is added to the balance you already have.
            </p>
          </div>
          <DialogFooter className="flex gap-2 flex-row justify-end">
            <button
              type="button"
              onClick={() => setShowChangePlanDialog(false)}
              className="inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 px-4 text-sm font-medium text-ink cursor-pointer transition"
            >
              Keep current plan
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={confirmChangePlan}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground px-4 text-sm font-medium cursor-pointer transition disabled:opacity-60"
            >
              {isProcessing ? "Opening checkout..." : "Continue to payment"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
