"use client";

import { CheckCircle, Lightning, ArrowRight, ArrowUp, ArrowDown, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { paymentService } from "@/services/payment.service";
import { billingService } from "@/services/billing.service";
import type { SubscriptionDto } from "@/types/billing";

const PLAN_TIERS = ["startup", "enterprise"] as const;
type PlanSlug = typeof PLAN_TIERS[number];

const plans = [
  {
    name: "Startup",
    slug: "startup" as PlanSlug,
    monthlyPrice: "190.000đ",
    yearlyPrice: "150.000đ",
    monthlyTotal: 190000,
    yearlyTotal: 1800000,
    interval: "/month",
    description: "For growing global teams that need reliable AI summaries and history.",
    features: [
      "30,000 credits per cycle",
      "120 minutes of Voice Cloning",
      "Automatic standard fallback",
      "Web access for up to 15 members",
      "Standard email support",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    slug: "enterprise" as PlanSlug,
    monthlyPrice: "490.000đ",
    yearlyPrice: "400.000đ",
    monthlyTotal: 490000,
    yearlyTotal: 4800000,
    interval: "/month",
    description: "For operators using voice cloning and native-feeling interpretation at scale.",
    features: [
      "100,000 credits per cycle",
      "Unlimited Voice Cloning",
      "Workspace Glossary & AI Customization",
      "Advanced ACL permission controls",
      "Stripe-backed top-up support",
    ],
    featured: false,
  },
];

function getTopUpRate(credits: number) {
  if (credits >= 50000) return { rate: 8, discount: 20 };
  if (credits >= 25000) return { rate: 8.5, discount: 15 };
  if (credits >= 10000) return { rate: 9, discount: 10 };
  return { rate: 10, discount: 0 };
}

export default function WorkspacePlansPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [topUpCredits, setTopUpCredits] = useState<number>(0);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user) router.push("/login");
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setLoadingSub(true);
    billingService.getActiveSubscription(activeWorkspaceId)
      .then((sub) => setSubscription(sub))
      .catch(() => setSubscription(null))
      .finally(() => setLoadingSub(false));
  }, [activeWorkspaceId]);

  const activePlanSlug = subscription?.planName?.toLowerCase() as PlanSlug | undefined;
  const activePlanTierIndex = activePlanSlug ? PLAN_TIERS.indexOf(activePlanSlug) : -1;

  const handleCheckout = async (amount: number, paymentType: string, planSlug = "", billingCycle = "") => {
    if (!isAuthenticated || !user) { router.push("/login"); return; }
    try {
      setIsProcessing(true);
      const url = await paymentService.createCheckoutSession({
        userId: user.id,
        workspaceId: activeWorkspaceId || user.id,
        amount,
        currency: "vnd",
        paymentType,
        planSlug: planSlug || undefined,
        billingCycle: billingCycle || undefined,
      });
      if (url) window.location.href = url;
    } catch {
      toast.error("Failed to initiate checkout. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!activeWorkspaceId) return;
    try {
      setIsCancelling(true);
      await billingService.cancelSubscription(activeWorkspaceId, "User requested cancellation from plans page");
      toast.success("Subscription cancelled. You will retain access until the end of your billing period.");
      setSubscription(null);
      setShowCancelDialog(false);
    } catch {
      toast.error("Failed to cancel subscription. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const getPlanAction = (plan: typeof plans[number]) => {
    if (loadingSub) return { label: "Loading...", variant: "loading", disabled: true };
    const planTierIndex = PLAN_TIERS.indexOf(plan.slug);
    const isCurrent = activePlanSlug === plan.slug && subscription?.status === "active";
    if (isCurrent) return { label: "Current Plan", variant: "current", disabled: true };
    if (activePlanTierIndex === -1) return { label: "Get Started", variant: "get-started", disabled: false };
    if (planTierIndex > activePlanTierIndex) return { label: "Upgrade", variant: "upgrade", disabled: false };
    return { label: "Downgrade", variant: "downgrade", disabled: false };
  };

  const { rate, discount } = getTopUpRate(topUpCredits);
  const topUpTotal = topUpCredits * rate;

  return (
    <div className="flex min-h-full flex-col items-center pb-12 pt-8">
      <div className="text-center max-w-2xl mb-12">
        <Badge variant="secondary" className="mb-4 bg-surface-2 text-primary border border-hairline hover:bg-surface-2">Pricing &amp; Subscriptions</Badge>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-ink mb-4">Choose the right plan for your team</h1>
        <p className="text-lg text-muted-foreground">
          {subscription?.status === "active"
            ? `You are currently on the ${subscription.planName} plan.`
            : "Upgrade your workspace to unlock advanced AI capabilities, real-time translation, and more credits."}
        </p>
        <div className="mt-8 flex justify-center">
          <Tabs value={billingInterval} onValueChange={(val) => setBillingInterval(val as "monthly" | "yearly")} className="w-fit">
            <TabsList className="bg-surface-2 p-1 rounded-full border border-hairline">
              <TabsTrigger value="monthly" className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Monthly</TabsTrigger>
              <TabsTrigger value="yearly" className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Yearly (Save up to 21%)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl px-4">
        {plans.map((plan) => {
          const action = getPlanAction(plan);
          const isCurrent = action.variant === "current";

          return (
            <Card
              key={plan.name}
              className={`relative flex flex-col rounded-xl shadow-linear transition-transform duration-300 hover:-translate-y-1 ${
                isCurrent
                  ? "border-2 border-primary bg-surface-2 shadow-[0_8px_30px_rgb(94,106,210,0.15)]"
                  : plan.featured
                  ? "border-primary/50 bg-surface-2 shadow-[0_8px_30px_rgb(94,106,210,0.08)]"
                  : "border-hairline bg-surface-1"
              }`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-2">
                {isCurrent && (
                  <Badge className="bg-primary hover:bg-primary text-primary-foreground border-none shadow-sm rounded-full px-3 py-0.5">
                    ✓ Current Plan
                  </Badge>
                )}
                {!isCurrent && plan.featured && (
                  <Badge className="bg-surface-3 hover:bg-surface-3 text-ink border border-hairline shadow-sm rounded-full px-3 py-0.5">
                    Most Popular
                  </Badge>
                )}
              </div>

              <CardHeader className="p-6 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-medium">{plan.name}</CardTitle>
                  {isCurrent && subscription?.status === "active" && (
                    <Badge className="bg-semantic-success/10 text-semantic-success border border-semantic-success/30 text-xs hover:bg-semantic-success/10">Active</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">{plan.description}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{billingInterval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}</span>
                  {plan.interval && <span className="text-sm text-muted-foreground mb-1">{plan.interval}</span>}
                </div>
                {billingInterval === "yearly" && plan.interval && (
                  <p className="text-xs text-semantic-success mt-1">
                    Billed yearly: {plan.name === "Startup" ? "1.800.000đ" : "4.800.000đ"} ({plan.name === "Startup" ? "Save 21%" : "Save 18%"})
                  </p>
                )}
                {isCurrent && subscription?.currentPeriodEnd && (
                  <p className="text-xs text-ink-muted mt-2">
                    Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
              </CardHeader>

              <CardContent className="flex-1 p-6 pt-4">
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                      <span className="text-sm text-ink">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="p-6 pt-0 flex flex-col gap-2">
                {!isCurrent && (
                  <button
                    type="button"
                    disabled={action.disabled || isProcessing}
                    onClick={() => {
                      const amount = billingInterval === "yearly" ? plan.yearlyTotal : plan.monthlyTotal;
                      handleCheckout(amount, "Subscription", plan.slug, billingInterval);
                    }}
                    className={`inline-flex items-center justify-center gap-2 w-full rounded-md h-10 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      action.variant === "upgrade" || action.variant === "get-started"
                        ? "bg-primary hover:bg-primary-hover text-primary-foreground"
                        : "bg-surface-2 hover:bg-surface-3 text-ink border border-hairline"
                    }`}
                  >
                    {action.variant === "upgrade" && <ArrowUp className="h-4 w-4" />}
                    {action.variant === "downgrade" && <ArrowDown className="h-4 w-4" />}
                    {isProcessing ? "Processing..." : action.label}
                  </button>
                )}
                {isCurrent && (
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={() => setShowCancelDialog(true)}
                    className="inline-flex items-center justify-center gap-2 w-full rounded-md h-10 text-sm font-medium transition-colors border border-hairline bg-surface-1 hover:bg-red-500/5 hover:border-red-400/40 hover:text-red-400 text-ink-muted cursor-pointer disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Cancel Subscription
                  </button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="mt-16 w-full max-w-4xl px-4 pb-4">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Lightning className="h-5 w-5 text-primary" weight="fill" />
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Need more credits?</h2>
          </div>
          <p className="text-sm text-muted-foreground">Enter the number of credits you want. Volume discounts apply automatically.</p>
        </div>
        <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
          <CardContent className="p-6">
            <div className="flex flex-col gap-6">
              <div>
                <label className="text-sm font-medium text-ink mb-2 block">Credits amount</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min="1" step="1000"
                    value={topUpCredits || ""}
                    onChange={(e) => setTopUpCredits(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="e.g. 10000"
                    className="flex-1 h-11 rounded-md border border-hairline bg-surface-2 px-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-focus focus:border-transparent"
                  />
                  <span className="text-sm text-ink-muted shrink-0">credits</span>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {[{ label: "10k", value: 10000 }, { label: "25k", value: 25000 }, { label: "50k", value: 50000 }, { label: "100k", value: 100000 }].map((preset) => (
                    <button key={preset.value} type="button" onClick={() => setTopUpCredits(preset.value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${topUpCredits === preset.value ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 text-ink-muted border-hairline hover:border-primary/50 hover:text-ink"}`}>
                      {preset.label} credits
                    </button>
                  ))}
                </div>
              </div>
              {topUpCredits > 0 && (
                <div className="rounded-lg bg-surface-2 border border-hairline p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">Rate</span>
                    <div className="flex items-center gap-2">
                      {discount > 0 && <Badge className="bg-semantic-success/90 hover:bg-semantic-success/90 text-white border-none text-xs px-2 py-0">Save {discount}%</Badge>}
                      <span className="font-medium text-ink">{rate} VND/credit</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">Credits</span>
                    <span className="font-medium text-ink">{topUpCredits.toLocaleString()} credits</span>
                  </div>
                  <div className="border-t border-hairline pt-2 flex items-center justify-between">
                    <span className="font-medium text-ink">Total</span>
                    <span className="text-xl font-semibold text-ink">{topUpTotal.toLocaleString("vi-VN")}đ</span>
                  </div>
                </div>
              )}
              <div className="text-xs text-ink-muted">
                <p className="font-medium text-ink-subtle mb-1.5">Volume discount tiers:</p>
                <div className="flex flex-wrap gap-4">
                  <span className={topUpCredits > 0 && topUpCredits < 10000 ? "text-primary font-semibold" : ""}>&lt; 10k: 10 VND/credit</span>
                  <span className={topUpCredits >= 10000 && topUpCredits < 25000 ? "text-primary font-semibold" : ""}>10k+: 9 VND/credit (10% off)</span>
                  <span className={topUpCredits >= 25000 && topUpCredits < 50000 ? "text-primary font-semibold" : ""}>25k+: 8.5 VND/credit (15% off)</span>
                  <span className={topUpCredits >= 50000 ? "text-primary font-semibold" : ""}>50k+: 8 VND/credit (20% off)</span>
                </div>
              </div>
              <button type="button" disabled={isProcessing || topUpCredits <= 0}
                onClick={() => handleCheckout(topUpTotal, "CreditTopUp")}
                className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus bg-primary hover:bg-primary-hover text-primary-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {isProcessing ? "Processing..." : topUpCredits > 0 ? <><span>Top up {topUpCredits.toLocaleString()} credits</span><ArrowRight className="ml-2 h-4 w-4" /></> : "Enter credit amount above"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Cancel Subscription confirmation dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-[440px] border-hairline bg-surface-1 shadow-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-ink">Cancel subscription?</DialogTitle>
            <DialogDescription className="text-sm text-ink-muted mt-1">
              Your workspace will remain on the <strong>{subscription?.planName}</strong> plan until the end of the current billing period on{" "}
              <strong>
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                  : "the end of the period"}
              </strong>. After that, your workspace will revert to basic access.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-hairline bg-surface-2 p-4 text-xs text-ink-muted space-y-1 my-2">
            <p>• Credits already used this cycle will not be refunded.</p>
            <p>• You can re-subscribe at any time.</p>
            <p>• Active rooms and history will not be deleted.</p>
          </div>
          <DialogFooter className="flex gap-2 flex-row justify-end">
            <button
              type="button"
              onClick={() => setShowCancelDialog(false)}
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
    </div>
  );
}