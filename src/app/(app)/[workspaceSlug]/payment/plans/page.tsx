"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
  CheckCircle,
  CreditCard,
  Lightning,
  Lock,
  ShieldCheck,
  Wallet,
  X,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format/currency";
import { getPlanPricing } from "@/lib/billing/plan-pricing";

// We fetch plans dynamically now.

function getTopUpRate(credits: number) {
  if (credits >= 50000) return { rate: 8, discount: 20 };
  if (credits >= 25000) return { rate: 8.5, discount: 15 };
  if (credits >= 10000) return { rate: 9, discount: 10 };
  return { rate: 10, discount: 0 };
}

function isEnterprisePlan(plan: PlanDto) {
  const value = `${plan.name} ${plan.slug} ${plan.tier}`.toLowerCase();
  return value.includes("enterprise");
}

function parsePlanFeatures(plan: PlanDto) {
  try {
    const parsed = JSON.parse(plan.features || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (feature): feature is string => typeof feature === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function getPlanFeatureList(plan: PlanDto) {
  const parsedFeatures = parsePlanFeatures(plan);
  if (parsedFeatures.length) return parsedFeatures.slice(0, 6);

  return [
    `${plan.creditsPerCycle?.toLocaleString()} credits per cycle`,
    `${plan.maxParticipants || "Limited"} workspace members`,
    `${plan.maxLanguages || "Limited"} translation languages`,
    plan.aiAssistantEnabled ? "AI assistant included" : "Basic AI access",
    plan.voiceCloneEnabled ? "Voice profiles enabled" : "No voice profiles",
    plan.glossaryEnabled ? "Workspace glossary included" : "No glossary",
  ];
}

function getPlanDescription(plan: PlanDto) {
  if (plan.description) return plan.description;
  return isEnterprisePlan(plan)
    ? "Advanced workspace AI, translation, voice, and governance features for teams."
    : "Basic workspace access for getting started with meetings and collaboration.";
}

/* There is no linked-card list, and this panel must not invent one.
 *
 * It briefly rendered two hardcoded cards — a Visa ending 4242 held by "Alice Smith" and a
 * Mastercard "backup" — under the heading "Cards available for subscription renewal and credit
 * top-up" and the line "Secured by Stripe billing". An owner reading that concludes the
 * workspace has payment methods on file. It does not: neither billing.service.ts nor
 * types/billing.ts has a payment-method endpoint or DTO, and the buttons beside those cards
 * ("Add payment card", the per-card menu) had no handlers, so nothing on screen could correct
 * the impression.
 *
 * What is true is below: the card is collected by Stripe at checkout and held by Stripe, not
 * by this workspace. When a saved-method endpoint exists, this panel can list what it returns.
 */

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
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  // Fetch plans from backend
  const { data: plansData = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingService.getPlans(),
  });

  const activePlans = useMemo(
    () =>
      plansData
        .filter((p) => p.isActive !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [plansData],
  );

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

  /* Every active plan, in sortOrder — not a hand-picked Free/Enterprise pair.
   *
   * This was `[activePlans.find(isFreePlan), activePlans.find(isEnterprisePlan)]`, matched by
   * substring on name/slug/tier. Two things followed. Any third plan the team activates is
   * silently unpurchasable, because the only checkout surface never renders it. Worse, a
   * subscriber whose plan is not in that pair falls through to `comparisonPlans[0]`, which
   * makes `selectedPlanIsCurrent` false — and the Cancel Subscription button is gated on it,
   * so a paying customer had no way to cancel.
   *
   * The workspace's own plan is appended when the catalogue no longer lists it, which is the
   * grandfathered case: migration 040 set is_active = false on every plan except enterprise,
   * so subscriptions predating it point at rows `activePlans` filters out. */
  const comparisonPlans = useMemo(() => {
    const plans = [...activePlans];
    const activePlanRow = plansData.find((plan) => plan.id === activePlanId);
    if (activePlanRow && !plans.some((plan) => plan.id === activePlanRow.id)) {
      plans.push(activePlanRow);
    }
    return plans;
  }, [activePlans, plansData, activePlanId]);
  const activePlanTierIndex = activePlanId
    ? activePlans.findIndex((p) => p.id === activePlanId)
    : -1;
  const selectedPlan =
    comparisonPlans.find((plan) => plan.id === selectedPlanId) ??
    comparisonPlans.find((plan) => plan.id === activePlanId) ??
    comparisonPlans[0] ??
    null;

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

    try {
      setIsProcessing(true);
      const url = await billingService.createCheckoutSession({
        userId: user.id,
        workspaceId: activeWorkspaceId || user.id,
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

  const { rate, discount } = getTopUpRate(topUpCredits);
  const topUpTotal = topUpCredits * rate;
  const selectedPlanAction = selectedPlan ? getPlanAction(selectedPlan) : null;
  const selectedPlanIsCurrent = selectedPlanAction?.variant === "current";
  const selectedPlanIsEnterprise = selectedPlan
    ? isEnterprisePlan(selectedPlan)
    : false;
  const selectedPlanPrice = selectedPlan?.price ?? 0;

  /* The arithmetic lives in lib/billing/plan-pricing, under test. It has been wrong twice
     inline here — most recently by treating a yearly-priced plan's annual figure as a monthly
     one and sending price x 12 x 0.79 to Checkout. */
  const {
    displayPricePerMonth: selectedPlanDisplayPrice,
    checkoutTotal: selectedPlanCheckoutTotal,
  } = getPlanPricing(selectedPlan, billingInterval);
  const selectedPlanFeatures = selectedPlan
    ? getPlanFeatureList(selectedPlan)
    : [];

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
            onValueChange={(val) =>
              setBillingInterval(val as "monthly" | "yearly")
            }
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
                Yearly - save 21%
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-8">
        <section className="mx-auto w-full max-w-6xl">
          <div className="mb-4 flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              Plan & linked cards
            </h1>
            <p className="text-[13px] text-ink-muted">
              Review the workspace plan, connected payment cards, and credit
              balance actions in one place.
            </p>
          </div>

          {loadingPlans ? (
            <div className="flex w-full items-center justify-center rounded-[18px] border border-border bg-canvas p-14 shadow-linear">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : !selectedPlan ? (
            <Card className="rounded-[18px] border-border bg-canvas shadow-linear">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  No active plans found
                </CardTitle>
                <CardDescription>
                  The billing service did not return active Free or Enterprise
                  plans for this workspace.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
              <Card className="relative overflow-hidden rounded-[22px] border-border bg-canvas shadow-linear">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.2),transparent_22%),radial-gradient(circle_at_78%_0%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02)_42%,rgba(0,0,0,0.16))] dark:bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.12),transparent_22%),radial-gradient(circle_at_78%_0%,rgba(255,255,255,0.08),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_42%,rgba(0,0,0,0.34))]" />
                <CardHeader className="relative flex flex-row items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface-1/80 text-ink shadow-sm backdrop-blur">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                      Selected workspace plan
                    </CardDescription>
                    <CardTitle className="mt-2 truncate text-2xl font-semibold tracking-tight text-ink">
                      {selectedPlan.name}
                    </CardTitle>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {selectedPlanIsCurrent && (
                      <Badge className="rounded-full border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-ink shadow-none hover:bg-surface-1">
                        Current
                      </Badge>
                    )}
                    <Badge className="rounded-full border border-border bg-surface-1/70 px-2.5 py-1 text-[11px] font-medium text-ink-muted shadow-none hover:bg-surface-1/70">
                      {billingInterval === "yearly" ? "Yearly" : "Monthly"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="relative space-y-5 px-5 pb-5">
                  <div>
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-semibold tracking-tight text-ink">
                        {selectedPlanDisplayPrice > 0
                          ? formatMoney(selectedPlanDisplayPrice, "VND")
                          : "Free"}
                      </span>
                      <span className="pb-1.5 text-[13px] text-ink-muted">
                        /mo
                      </span>
                    </div>
                    <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-muted">
                      {getPlanDescription(selectedPlan)}
                    </p>
                    {billingInterval === "yearly" && selectedPlanPrice > 0 && (
                      <p className="mt-2 text-[12px] font-medium text-ink-muted">
                        Billed yearly:{" "}
                        {formatMoney(selectedPlanCheckoutTotal, "VND")}
                      </p>
                    )}
                    {selectedPlanIsCurrent &&
                      subscription?.currentPeriodEnd && (
                        <p className="mt-2 text-[12px] font-medium text-ink-muted">
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
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      {
                        label: "Credits",
                        value: selectedPlan.creditsPerCycle?.toLocaleString(),
                      },
                      {
                        label: "Members",
                        value: selectedPlan.maxParticipants || "Limited",
                      },
                      {
                        label: "Languages",
                        value: selectedPlan.maxLanguages || "Limited",
                      },
                      {
                        label: "Voice",
                        value: selectedPlan.voiceCloneEnabled
                          ? "Enabled"
                          : "Basic",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-border bg-surface-1/70 p-3 backdrop-blur"
                      >
                        <p className="text-[11px] text-ink-muted">
                          {item.label}
                        </p>
                        <p className="mt-1 truncate text-[13px] font-semibold text-ink">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-1/70 p-2 backdrop-blur">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {comparisonPlans.map((plan) => {
                        const isSelected = plan.id === selectedPlan.id;
                        const isCurrent = plan.id === activePlanId;

                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                              isSelected
                                ? "border-ink bg-ink text-canvas"
                                : "border-transparent bg-transparent text-ink hover:bg-surface-2"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold">
                                {plan.name}
                              </span>
                              <span
                                className={`block text-[11px] ${
                                  isSelected
                                    ? "text-canvas/70"
                                    : "text-ink-muted"
                                }`}
                              >
                                {isCurrent ? "Current plan" : "Available plan"}
                              </span>
                            </span>
                            {isSelected && (
                              <CheckCircle
                                className="h-4 w-4 shrink-0"
                                weight="fill"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedPlanFeatures.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedPlanFeatures.slice(0, 4).map((feature) => (
                        <span
                          key={feature}
                          className="rounded-full border border-border bg-surface-1/70 px-3 py-1 text-[11px] font-medium text-ink-muted"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {!selectedPlanIsCurrent && selectedPlanAction && (
                      <button
                        type="button"
                        disabled={selectedPlanAction.disabled || isProcessing}
                        onClick={() =>
                          handleCheckout(
                            selectedPlanCheckoutTotal,
                            "Subscription",
                            selectedPlan.slug,
                            billingInterval,
                          )
                        }
                        className={`inline-flex h-11 flex-1 items-center justify-center rounded-full px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          selectedPlanIsEnterprise
                            ? "bg-ink text-canvas hover:opacity-90"
                            : "border border-border bg-surface-1 text-ink hover:bg-surface-2"
                        }`}
                      >
                        {isProcessing
                          ? "Processing..."
                          : selectedPlanAction.label}
                      </button>
                    )}

                    {selectedPlanIsCurrent &&
                      subscription?.status === "active" &&
                      selectedPlan.price > 0 && (
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() => setShowCancelDialog(true)}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-surface-1 px-4 text-[13px] font-semibold text-ink transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel Subscription
                        </button>
                      )}

                    {selectedPlanIsCurrent &&
                      (subscription?.status !== "active" ||
                        selectedPlan.price === 0) && (
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-border bg-surface-2 px-4 text-[13px] font-semibold text-ink-muted"
                        >
                          Current Plan
                        </button>
                      )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[22px] border-border bg-canvas shadow-linear">
                <CardHeader className="p-5">
                  <CardTitle className="text-base font-semibold text-ink">
                    How payment works
                  </CardTitle>
                  <CardDescription className="mt-1 text-[12px]">
                    WarpTalk does not hold a card for this workspace.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 px-5 pb-5">
                  <div className="rounded-2xl border border-border bg-surface-1 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-canvas text-ink">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink">
                          Card details are entered at checkout
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                          Choosing a plan or topping up credits opens Stripe
                          Checkout. The card is collected and stored there, so
                          nothing sensitive passes through or rests in WarpTalk.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-1 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-canvas text-ink">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink">
                          Managing a saved card
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                          Replacing or removing a card is done from the Stripe
                          receipt emailed after each payment. WarpTalk has no
                          saved-card list to show here yet.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </section>
        <section className="mx-auto mt-6 w-full max-w-6xl">
          <Card className="relative overflow-hidden rounded-[22px] border-border bg-canvas shadow-linear">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(255,255,255,0.18),transparent_24%),radial-gradient(circle_at_90%_8%,rgba(255,255,255,0.1),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02)_46%,rgba(0,0,0,0.18))] dark:bg-[radial-gradient(circle_at_8%_0%,rgba(255,255,255,0.1),transparent_24%),radial-gradient(circle_at_90%_8%,rgba(255,255,255,0.08),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015)_46%,rgba(0,0,0,0.34))]" />
            <CardHeader className="relative flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-1/80 text-ink shadow-sm backdrop-blur">
                  <Lightning className="h-5 w-5" weight="fill" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-ink">
                    Top up credits
                  </CardTitle>
                  <CardDescription className="mt-1 text-[12px]">
                    Add workspace credits with automatic volume discounts.
                  </CardDescription>
                </div>
              </div>

              {topUpCredits > 0 && (
                <div className="rounded-2xl border border-border bg-surface-1/70 px-4 py-3 text-right backdrop-blur">
                  <p className="text-[11px] text-ink-muted">Estimated total</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-ink">
                    {formatMoney(topUpTotal, "VND")}
                  </p>
                </div>
              )}
            </CardHeader>

            <CardContent className="relative space-y-5 px-5 pb-5">
              <div className="rounded-2xl border border-border bg-surface-1/70 p-4 backdrop-blur">
                <label className="mb-3 block text-[13px] font-semibold text-ink">
                  How many credits do you need?
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                      className="h-14 w-full rounded-2xl border border-border bg-canvas px-5 text-xl font-semibold text-ink placeholder:text-ink-muted/45 transition focus:border-ink/40 focus:outline-none focus:ring-4 focus:ring-ink/5"
                    />
                  </div>
                  <span className="shrink-0 px-1 text-[13px] font-medium text-ink-muted">
                    credits
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2.5">
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
                      className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
                        topUpCredits === preset.value
                          ? "border-ink bg-ink text-canvas"
                          : "border-border bg-canvas text-ink-muted hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      {preset.label} credits
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-1/70 p-4 backdrop-blur">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Volume discount tiers
                    </p>
                    <p className="text-[12px] text-ink-muted">
                      Higher credit packs reduce the price per credit.
                    </p>
                  </div>
                  {discount > 0 && (
                    <Badge className="w-fit rounded-full border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink shadow-none hover:bg-canvas">
                      Save {discount}%
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    {
                      label: "< 10k",
                      rateText: "10 VND/cr",
                      active: topUpCredits > 0 && topUpCredits < 10000,
                    },
                    {
                      label: "10k+",
                      rateText: "9 VND/cr",
                      discountText: "10%",
                      active: topUpCredits >= 10000 && topUpCredits < 25000,
                    },
                    {
                      label: "25k+",
                      rateText: "8.5 VND/cr",
                      discountText: "15%",
                      active: topUpCredits >= 25000 && topUpCredits < 50000,
                    },
                    {
                      label: "50k+",
                      rateText: "8 VND/cr",
                      discountText: "20%",
                      active: topUpCredits >= 50000,
                    },
                  ].map((tier) => (
                    <div
                      key={tier.label}
                      className={`rounded-2xl border p-3 transition ${
                        tier.active
                          ? "border-ink bg-ink text-canvas"
                          : "border-border bg-canvas text-ink"
                      }`}
                    >
                      <p
                        className={`text-[12px] font-semibold ${
                          tier.active ? "text-canvas/70" : "text-ink-muted"
                        }`}
                      >
                        {tier.label}
                      </p>
                      <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[13px] font-semibold">
                          {tier.rateText}
                        </span>
                        {tier.discountText && (
                          <span
                            className={`text-[11px] font-semibold ${
                              tier.active ? "text-canvas/70" : "text-ink-muted"
                            }`}
                          >
                            ({tier.discountText})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {topUpCredits > 0 && (
                <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface-1/70 p-4 backdrop-blur sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] text-ink-muted">Rate applied</p>
                    <p className="mt-1 text-[13px] font-semibold text-ink">
                      {rate} VND / credit
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-muted">Credits to add</p>
                    <p className="mt-1 text-[13px] font-semibold text-ink">
                      {topUpCredits.toLocaleString()} credits
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[11px] text-ink-muted">Total</p>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-ink">
                      {formatMoney(topUpTotal, "VND")}
                    </p>
                  </div>
                </div>
              )}

              {topUpCredits > 0 && topUpCredits < 1500 && (
                <p className="rounded-2xl border border-border bg-surface-1/70 p-3 text-[12px] font-medium text-ink-muted backdrop-blur">
                  Minimum top-up amount is 1,500 credits, equivalent to the
                  15,000 VND Stripe transaction limit.
                </p>
              )}

              <button
                type="button"
                disabled={isProcessing || topUpCredits < 1500}
                onClick={() =>
                  handleCheckout(topUpTotal, "CreditTopUp", "", "")
                }
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-4 text-[13px] font-semibold text-canvas shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isProcessing ? (
                  "Processing..."
                ) : topUpCredits >= 1500 ? (
                  <>
                    <span>
                      Complete Top Up of {topUpCredits.toLocaleString()} credits
                    </span>
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  "Enter credit amount above (Min 1,500)"
                )}
              </button>
            </CardContent>
          </Card>
        </section>
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
              Cancel subscription?
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
            <p>- Credits already used this cycle will not be refunded.</p>
            <p>- You can re-subscribe at any time.</p>
            <p>- Active rooms and history will not be deleted.</p>
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
