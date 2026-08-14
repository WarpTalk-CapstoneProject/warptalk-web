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
import { getErrorMessage } from "@/lib/api/errors";
import { createHubConnection } from "@/lib/realtime/signalr";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceRole,
  useWorkspaceRoleLoaded,
} from "@/hooks/use-workspace-role";
import type { PlanDto, SubscriptionDto } from "@/types/billing";
import {
  ArrowRight,
  CaretLeft,
  Lightning,
  Lock,
  X,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format/currency";

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
 * WHY THE PRICE IS ONE NUMBER
 *     The ladder here was 10 / 9 / 8.5 / 8 VND per credit with volume discounts. None of it is
 *     real: docs/credit-economics.md §4.2 sets retail at 4.00 VND per credit with no discount,
 *     and the backend already agrees (CreditValueVnd = 4m). The frontend was overcharging by
 *     2–2.5×; a 1,500-credit minimum was quoted at 15,000 VND against a true 6,000 VND.
 *
 *     It is stated, not hardcoded into a calculation: 4 VND is an admin-editable parameter in
 *     billing_pricing_config, so once the handler exists this panel must READ the configured
 *     value rather than carry its own copy — even a copy that happens to be right today.
 */
const TOP_UP_ENABLED = false;

/** Retail rate from docs/credit-economics.md §4.2. Display only — see above. */
const DOCUMENTED_VND_PER_CREDIT = 4;

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
  const [topUpCredits, setTopUpCredits] = useState<number>(0);
  // Fetch plans from backend
  const { data: plansData = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingService.getPlans(),
  });

  const activePlans = plansData
    .filter((p) => p.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

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

  const pendingPlanTierIndex = pendingPlanSlug
    ? activePlans.findIndex((p) => p.slug === pendingPlanSlug)
    : -1;
  const isUpgrade =
    activePlanTierIndex === -1 ||
    (pendingPlanTierIndex > -1 && pendingPlanTierIndex > activePlanTierIndex);
  const isDowngrade =
    activePlanTierIndex !== -1 &&
    pendingPlanTierIndex > -1 &&
    pendingPlanTierIndex < activePlanTierIndex;

  const confirmChangePlan = async () => {
    if (!pendingPlanSlug || !activeWorkspaceId) return;
    try {
      setIsProcessing(true);
      setShowChangePlanDialog(false);
      const plansList = await billingService.getPlans().catch(() => []);
      const targetPlan = plansList.find((p) => p.slug === pendingPlanSlug);
      if (targetPlan) {
        const updatedSub = await billingService.changeSubscription(
          activeWorkspaceId,
          targetPlan.id,
        );
        toast.success(`Successfully updated your plan to ${targetPlan.name}!`);
        queryClient.setQueryData(
          ["subscription", activeWorkspaceId],
          updatedSub,
        );
        // Invalidate billing query cache so billing page shows updated plan
        queryClient.invalidateQueries({ queryKey: ["billing"] });
      }
    } catch (error) {
      // PUT /subscriptions/workspace/{id}/change-plan does not exist: there is no `change-plan`
      // route anywhere in the billing service, so this always 404s for a workspace that already
      // has a subscription — which is every workspace that reaches this button. Until the endpoint
      // is built, say what is true. "Please contact support" reads as a transient fault and sends
      // the user to ask about a feature that was never wired up.
      toast.error(
        getErrorMessage(
          error,
          "Changing an existing plan is not available yet. Contact sales to move between plans.",
        ),
      );
    } finally {
      setIsProcessing(false);
      setPendingPlanSlug("");
      setPendingPlanName("");
    }
  };

  const handleCheckout = async (
    amount: number,
    paymentType: string,
    planSlug = "",
    billingCycle = "",
  ) => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    // If upgrading/downgrading and user already has an active subscription, call direct changeSubscription API instead of Stripe Checkout
    if (
      paymentType === "Subscription" &&
      subscription &&
      subscription.status === "active"
    ) {
      const plansList = await billingService.getPlans().catch(() => []);
      const targetPlan = plansList.find((p) => p.slug === planSlug);

      if (targetPlan) {
        setPendingPlanSlug(planSlug);
        setPendingPlanName(targetPlan.name);
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
        currency: "vnd",
        paymentType,
        planSlug: planSlug || undefined,
        billingCycle: billingCycle || undefined,
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
      queryClient.setQueryData(["subscription", activeWorkspaceId], null);
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

  const topUpTotal = topUpCredits * DOCUMENTED_VND_PER_CREDIT;

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
            href={`/${slug}/billing`}
            className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <CaretLeft className="h-3.5 w-3.5" />
            <span>Billing</span>
          </Link>
          <span className="truncate text-[13px] text-ink-muted">
            {subscription?.status === "active"
              ? `Currently on ${subscription.planName}.`
              : "No active plan on this workspace."}
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
      <div
        className={`grid grid-cols-1 gap-6 lg:gap-8 w-full mx-auto justify-center ${
          activePlans.length === 1
            ? "max-w-[380px] md:grid-cols-1"
            : activePlans.length === 2
              ? "max-w-[780px] md:grid-cols-2"
              : activePlans.length === 3
                ? "max-w-[1150px] md:grid-cols-3"
                : "max-w-[1400px] md:grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {loadingPlans ? (
          <div className="col-span-1 md:col-span-3 flex w-full items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          activePlans.map((plan, index) => {
            const action = getPlanAction(plan);
            const isCurrent = action.variant === "current";
            const isFeatured = index === 0; // Highlight the first plan or based on some custom logic

            const monthlyPrice = plan.price;
            let yearlyPrice = plan.price;
            if (plan.billingCycle?.toLowerCase() === "yearly") {
              // Assuming the plan's price is already the yearly price, but we display monthly equivalent
              yearlyPrice = plan.price;
            } else {
              // Calculate yearly discount equivalent
              yearlyPrice = Math.round(plan.price * 0.79); // 21% off
            }

            const displayPrice =
              billingInterval === "yearly" ? yearlyPrice : monthlyPrice;
            const displayTotal =
              billingInterval === "yearly"
                ? monthlyPrice * 12 * 0.79
                : monthlyPrice;

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
                className={`relative flex h-full flex-col overflow-hidden rounded-[14px] border bg-surface-1 p-5 shadow-linear transition-colors ${
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
                        {displayPrice > 0 ? formatMoney(displayPrice, "VND") : "Free"}
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
                            ? "bg-[#7F1DFF] hover:bg-[#6c17db] text-white shadow-sm"
                            : "bg-[#00E58F] hover:bg-[#00cf81] text-gray-900 shadow-sm"
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
                      Billed yearly: {formatMoney(displayTotal, "VND")}
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
      {subscription?.status === "active" ? (
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

      <div className="mt-8 w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex size-8 rounded-full bg-primary/10 items-center justify-center">
              <Lightning className="h-4 w-4 text-primary" weight="fill" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-ink">
              Need more credits?
            </h2>
          </div>
          <p className="text-base text-muted-foreground">
            Enter the number of credits you want. Volume discounts apply
            automatically.
          </p>
        </div>

        <Card className="rounded-2xl border-2 border-hairline bg-surface-1 shadow-md overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col gap-8">
              <div>
                <label className="text-base font-semibold text-ink mb-3 block">
                  How many credits do you need?
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      step="1000"
                      value={topUpCredits || ""}
                      onChange={(e) =>
                        setTopUpCredits(
                          Math.max(0, parseInt(e.target.value) || 0),
                        )
                      }
                      placeholder="e.g. 10000"
                      className="w-full h-14 rounded-xl border-2 border-hairline bg-surface-1 px-5 text-xl font-medium text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                    />
                  </div>
                  <span className="text-base font-medium text-ink-muted shrink-0">
                    credits
                  </span>
                </div>

                <div className="flex gap-2.5 mt-4 flex-wrap">
                  {[
                    { label: "10k", value: 10000 },
                    { label: "25k", value: 25000 },
                    { label: "50k", value: 50000 },
                    { label: "100k", value: 100000 },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setTopUpCredits(preset.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all cursor-pointer ${topUpCredits === preset.value ? "bg-primary/10 text-primary border-primary shadow-sm" : "bg-surface-1 text-ink-muted border-hairline hover:border-ink-muted/30 hover:text-ink"}`}
                    >
                      {preset.label} credits
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-surface-2/50 rounded-xl p-5 border border-hairline">
                <p className="text-sm font-semibold text-ink">
                  {DOCUMENTED_VND_PER_CREDIT} VND per credit
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  One rate, whatever the amount. There is no volume discount.
                </p>
              </div>

              {topUpCredits > 0 && (
                <div className="rounded-xl bg-surface-2 border border-hairline p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-muted">
                      Rate applied
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {DOCUMENTED_VND_PER_CREDIT} VND / credit
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-muted">
                      Credits to add
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {topUpCredits.toLocaleString()} credits
                    </span>
                  </div>
                  <div className="border-t border-hairline pt-3 mt-1 flex items-center justify-between">
                    <span className="text-base font-bold text-ink">Total</span>
                    <span className="text-2xl font-bold text-ink tracking-tight">
                      {formatMoney(topUpTotal, "VND")}
                    </span>
                  </div>
                </div>
              )}

              {topUpCredits > 0 && topUpCredits < 1500 && (
                <p className="text-xs font-semibold text-rose-500 mt-2 bg-rose-500/10 p-3 rounded-lg">
                  ⚠️ Minimum top-up amount is 1,500 credits (equivalent to
                  15,000 VND Stripe transaction limit).
                </p>
              )}

              {TOP_UP_ENABLED ? (
              <button
                type="button"
                disabled={isProcessing || topUpCredits < 1500}
                onClick={() =>
                  handleCheckout(topUpTotal, "CreditTopUp", "", "")
                }
                className="inline-flex items-center justify-center w-full rounded-xl h-14 text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {isProcessing ? (
                  "Processing..."
                ) : topUpCredits >= 1500 ? (
                  <>
                    <span>
                      Complete Top Up of {topUpCredits.toLocaleString()} credits
                    </span>
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                ) : (
                  "Enter credit amount above (Min 1,500)"
                )}
              </button>
              ) : (
                /* Says why, and does not pretend the button is merely busy. Somebody who came
                   here to buy credit needs to know it will not arrive, not to be left guessing
                   whether they clicked wrong. */
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="text-sm font-semibold text-ink">
                    Credit top-up is temporarily unavailable
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Payment would be taken without the credits being added, so the purchase is
                    switched off until that is fixed. Your subscription still renews its credits
                    on schedule. Contact support if you need a balance adjustment.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
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
              {isUpgrade
                ? "Upgrade workspace plan?"
                : isDowngrade
                  ? "Downgrade workspace plan?"
                  : "Change workspace plan?"}
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-muted mt-1">
              {isUpgrade
                ? "Are you sure you want to upgrade your workspace plan to "
                : isDowngrade
                  ? "Are you sure you want to downgrade your workspace plan to "
                  : "Are you sure you want to change your workspace plan to "}
              <strong>{pendingPlanName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-hairline bg-surface-2 p-4 text-xs text-ink-muted space-y-1.5 my-2">
            <p>
              • <strong>Billing updates today</strong>: Your billing cycle and
              price will update immediately.
            </p>
            <p>
              • <strong>Pro-rated credit</strong>: Any unused time on your
              current plan will be credited to this change.
            </p>
            <p>
              • <strong>Credits carried over</strong>: All your remaining
              credits will roll over to your new plan.
            </p>
          </div>
          <DialogFooter className="flex gap-2 flex-row justify-end">
            <button
              type="button"
              onClick={() => setShowChangePlanDialog(false)}
              className="inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 px-4 text-sm font-medium text-ink cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={confirmChangePlan}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground px-4 text-sm font-medium cursor-pointer transition disabled:opacity-60"
            >
              {isProcessing
                ? "Updating..."
                : isUpgrade
                  ? "Confirm Upgrade"
                  : isDowngrade
                    ? "Confirm Downgrade"
                    : "Confirm Change"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
