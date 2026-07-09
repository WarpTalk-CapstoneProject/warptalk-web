"use client";

import { CheckCircle, Lightning, ArrowRight, ArrowUp, ArrowDown, X, Lock, CaretLeft } from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { paymentService } from "@/services/payment.service";
import { billingService } from "@/services/billing.service";
import type { SubscriptionDto } from "@/types/billing";
import { createHubConnection } from "@/lib/signalr";

// We fetch plans dynamically now.

function getTopUpRate(credits: number) {
  if (credits >= 50000) return { rate: 8, discount: 20 };
  if (credits >= 25000) return { rate: 8.5, discount: 15 };
  if (credits >= 10000) return { rate: 9, discount: 10 };
  return { rate: 10, discount: 0 };
}

export default function WorkspacePlansPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.workspaceSlug as string;
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceStore((state) => state.role);

  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false);
  const [pendingPlanSlug, setPendingPlanSlug] = useState("");
  const [pendingPlanName, setPendingPlanName] = useState("");
  const [topUpCredits, setTopUpCredits] = useState<number>(0);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  // Fetch plans from backend
  const { data: plansData = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => billingService.getPlans(),
  });

  const activePlans = plansData.filter((p: any) => p.isActive !== false).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

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
  const activePlanTierIndex = activePlanId ? activePlans.findIndex((p: any) => p.id === activePlanId) : -1;

  const pendingPlanTierIndex = pendingPlanSlug ? activePlans.findIndex((p: any) => p.slug === pendingPlanSlug) : -1;
  const isUpgrade = activePlanTierIndex === -1 || (pendingPlanTierIndex > -1 && pendingPlanTierIndex > activePlanTierIndex);
  const isDowngrade = activePlanTierIndex !== -1 && pendingPlanTierIndex > -1 && pendingPlanTierIndex < activePlanTierIndex;

  const confirmChangePlan = async () => {
    if (!pendingPlanSlug || !activeWorkspaceId) return;
    try {
      setIsProcessing(true);
      setShowChangePlanDialog(false);
      const plansList = await billingService.getPlans().catch(() => []);
      const targetPlan = plansList.find(p => p.slug === pendingPlanSlug);
      if (targetPlan) {
        const updatedSub = await billingService.changeSubscription(activeWorkspaceId, targetPlan.id);
        toast.success(`Successfully updated your plan to ${targetPlan.name}!`);
        setSubscription(updatedSub);
        // Invalidate billing query cache so billing page shows updated plan
        queryClient.invalidateQueries({ queryKey: ["billing"] });
      }
    } catch {
      toast.error("Failed to update plan. Please contact support.");
    } finally {
      setIsProcessing(false);
      setPendingPlanSlug("");
      setPendingPlanName("");
    }
  };

  const handleCheckout = async (amount: number, paymentType: string, planSlug = "", billingCycle = "") => {
    if (!isAuthenticated || !user) { router.push("/login"); return; }
    
    // If upgrading/downgrading and user already has an active subscription, call direct changeSubscription API instead of Stripe Checkout
    if (paymentType === "Subscription" && subscription && subscription.status === "active") {
      const plansList = await billingService.getPlans().catch(() => []);
      const targetPlan = plansList.find(p => p.slug === planSlug);
      
      if (targetPlan) {
        setPendingPlanSlug(planSlug);
        setPendingPlanName(targetPlan.name);
        setShowChangePlanDialog(true);
        return;
      }
    }

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

  const getPlanAction = (plan: any) => {
    if (loadingSub || loadingPlans) return { label: "Loading...", variant: "loading", disabled: true };
    const planTierIndex = activePlans.findIndex((p: any) => p.id === plan.id);
    const isCurrent = activePlanId === plan.id;
    if (isCurrent) return { label: "Current Plan", variant: "current", disabled: true };
    if (activePlanTierIndex === -1) return { label: "Get Started", variant: "get-started", disabled: false };
    if (planTierIndex > activePlanTierIndex) return { label: "Upgrade", variant: "upgrade", disabled: false };
    return { label: "Downgrade", variant: "downgrade", disabled: false };
  };

  const { rate, discount } = getTopUpRate(topUpCredits);
  const topUpTotal = topUpCredits * rate;

  if (!role) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (role !== "Owner" && role !== "Admin") {
    return (
      <div className="flex h-[80vh] items-center justify-center w-full">
        <Card className="max-w-md border-hairline bg-surface-1/40 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can manage subscription plans and top-up credits.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col pb-12 pt-4 px-4 lg:px-8 w-full max-w-[1600px] mx-auto">
      {/* Back to Billing Link */}
      <div className="w-full flex justify-start mb-4">
        <Link 
          href={`/${slug}/billing`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition duration-150 cursor-pointer"
        >
          <CaretLeft className="h-4 w-4" />
          <span>Back to Billing</span>
        </Link>
      </div>

      <div className="text-center max-w-2xl mx-auto mb-10 mt-2">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 w-full max-w-[1400px] mx-auto">
        {loadingPlans ? (
          <div className="col-span-1 md:col-span-3 flex w-full items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          activePlans.map((plan: any, index: number) => {
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

            const displayPrice = billingInterval === "yearly" ? yearlyPrice : monthlyPrice;
            const displayTotal = billingInterval === "yearly" ? (monthlyPrice * 12 * 0.79) : monthlyPrice;

            let parsedFeatures: string[] = [];
            try {
              parsedFeatures = JSON.parse(plan.features || "[]");
              if (!Array.isArray(parsedFeatures)) {
                parsedFeatures = [];
              }
            } catch (e) {
              parsedFeatures = [];
            }

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col h-full overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-lg w-full ${
                  isCurrent
                    ? "border-2 border-primary bg-surface-1 shadow-md ring-4 ring-primary/10"
                    : isFeatured
                    ? "border-2 border-primary/30 bg-surface-1 shadow-md"
                    : "border border-hairline bg-surface-1 hover:border-ink-muted/30"
                }`}
              >
                {/* Optional Top Accent Bar for highlighted cards */}
                {(isCurrent || isFeatured) && (
                  <div className={`h-1.5 w-full absolute top-0 left-0 ${isCurrent ? 'bg-primary' : 'bg-primary/40'}`}></div>
                )}

                <CardHeader className="p-6 md:p-8 pb-6 flex flex-col items-center text-center">
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="flex items-center justify-center flex-wrap gap-2 mb-2">
                      {isCurrent && (
                        <Badge className="bg-primary text-primary-foreground border-none rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase shadow-sm">
                          Current Plan
                        </Badge>
                      )}
                      {!isCurrent && isFeatured && (
                        <Badge className="bg-surface-2 text-ink border border-hairline rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase">
                          Most Popular
                        </Badge>
                      )}
                      
                      {isCurrent && subscription?.status === "active" && (
                        <Badge className="bg-semantic-success/10 text-semantic-success border-semantic-success/30 text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full whitespace-nowrap">Active</Badge>
                      )}
                      {isCurrent && subscription?.status === "cancelled" && (
                        <Badge className="bg-warning/10 text-warning border-warning/30 text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full whitespace-nowrap">Cancelling</Badge>
                      )}
                    </div>
                    
                    <CardTitle className="text-3xl font-bold tracking-tight text-ink">{plan.name}</CardTitle>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-3 mb-1 leading-relaxed max-w-[90%]">{plan.description}</p>
                  
                  <div className="mt-4 flex flex-col justify-start items-center w-full">
                    <div className="flex items-baseline justify-center gap-1.5 whitespace-nowrap">
                      <span className="text-[2rem] lg:text-4xl font-bold tracking-tight text-ink leading-none">{displayPrice > 0 ? `${displayPrice.toLocaleString("vi-VN")}đ` : "Free"}</span>
                      <span className="text-sm font-medium text-muted-foreground">/month</span>
                    </div>
                    {billingInterval === "yearly" && (
                      <p className="text-sm font-medium text-semantic-success mt-1.5">
                        Billed yearly: {displayTotal.toLocaleString("vi-VN")}đ (Save 21%)
                      </p>
                    )}
                    {isCurrent && subscription?.currentPeriodEnd && (
                      <p className="text-sm font-medium text-ink-muted mt-1.5">
                        Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    )}
                  </div>
                </CardHeader>
                
                <hr className="border-hairline mx-6 opacity-60" />

                <CardContent className="flex-1 p-6 pt-5">
                  <ul className="space-y-3.5">
                    {parsedFeatures.map((feature: string, i: number) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                        <span className="text-sm font-medium text-ink/80">{feature}</span>
                      </li>
                    ))}
                    {!parsedFeatures.length && (
                      <>
                        <li className="flex items-start gap-3">
                          <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                          <span className="text-sm font-medium text-ink/80">{plan.creditsPerCycle?.toLocaleString()} credits per cycle</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                          <span className="text-sm font-medium text-ink/80">{plan.voiceCloneEnabled ? (plan.voiceCloneLimitMins ? `${plan.voiceCloneLimitMins} minutes of Voice Cloning` : "Unlimited Voice Cloning") : "No Voice Cloning"}</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                          <span className="text-sm font-medium text-ink/80">Web access for up to {plan.maxParticipants} members</span>
                        </li>
                        {plan.allowGlossary && (
                          <li className="flex items-start gap-3">
                            <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                            <span className="text-sm font-medium text-ink/80">Workspace Glossary included</span>
                          </li>
                        )}
                        {plan.allowAcl && (
                          <li className="flex items-start gap-3">
                            <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                            <span className="text-sm font-medium text-ink/80">Advanced ACL permission controls</span>
                          </li>
                        )}
                      </>
                    )}
                  </ul>
                </CardContent>

                <CardFooter className="p-8 pt-0 flex flex-col gap-2">
                  {!isCurrent && (
                    <button
                      type="button"
                      disabled={action.disabled || isProcessing}
                      onClick={() => {
                        handleCheckout(displayTotal, "Subscription", plan.slug, billingInterval);
                      }}
                      className={`inline-flex items-center justify-center gap-2 w-full rounded-xl h-12 text-[15px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        action.variant === "upgrade" || action.variant === "get-started"
                          ? "bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg hover:-translate-y-0.5"
                          : "bg-surface-1 hover:bg-surface-2 text-ink border-2 border-hairline hover:border-ink/20"
                      }`}
                    >
                      {action.variant === "upgrade" && <ArrowUp className="h-4 w-4" />}
                      {action.variant === "downgrade" && <ArrowDown className="h-4 w-4" />}
                      {isProcessing ? "Processing..." : action.label}
                    </button>
                  )}
                  {isCurrent && subscription?.status === "active" && (
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={() => setShowCancelDialog(true)}
                      className="inline-flex items-center justify-center gap-2 w-full rounded-xl h-12 text-[15px] font-semibold transition-all border-2 border-hairline bg-surface-1 hover:bg-red-500/5 hover:border-red-400/40 hover:text-red-400 text-ink-muted cursor-pointer disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Cancel Subscription
                    </button>
                  )}
                  {isCurrent && subscription?.status === "cancelled" && (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center justify-center gap-2 w-full rounded-xl h-12 text-[15px] font-semibold transition-all border-2 border-hairline bg-surface-1 text-ink-muted opacity-50 cursor-not-allowed"
                    >
                      <X className="h-4 w-4" />
                      Cancelled (Ends soon)
                    </button>
                  )}
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>

      <div className="mt-20 w-full max-w-3xl mx-auto px-4 pb-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex size-8 rounded-full bg-primary/10 items-center justify-center">
              <Lightning className="h-4 w-4 text-primary" weight="fill" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-ink">Need more credits?</h2>
          </div>
          <p className="text-base text-muted-foreground">Enter the number of credits you want. Volume discounts apply automatically.</p>
        </div>

        <Card className="rounded-2xl border-2 border-hairline bg-surface-1 shadow-md overflow-hidden">
          <CardContent className="p-8">
            <div className="flex flex-col gap-8">
              <div>
                <label className="text-base font-semibold text-ink mb-3 block">How many credits do you need?</label>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <input
                      type="number" min="1" step="1000"
                      value={topUpCredits || ""}
                      onChange={(e) => setTopUpCredits(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="e.g. 10000"
                      className="w-full h-14 rounded-xl border-2 border-hairline bg-surface-1 px-5 text-xl font-medium text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                    />
                  </div>
                  <span className="text-base font-medium text-ink-muted shrink-0">credits</span>
                </div>
                
                <div className="flex gap-2.5 mt-4 flex-wrap">
                  {[{ label: "10k", value: 10000 }, { label: "25k", value: 25000 }, { label: "50k", value: 50000 }, { label: "100k", value: 100000 }].map((preset) => (
                    <button key={preset.value} type="button" onClick={() => setTopUpCredits(preset.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all cursor-pointer ${topUpCredits === preset.value ? "bg-primary/10 text-primary border-primary shadow-sm" : "bg-surface-1 text-ink-muted border-hairline hover:border-ink-muted/30 hover:text-ink"}`}>
                      {preset.label} credits
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume Discounts */}
              <div className="bg-surface-2/50 rounded-xl p-5 border border-hairline">
                <p className="text-sm font-semibold text-ink mb-3">Volume discount tiers:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`flex flex-col p-2.5 rounded-lg border transition-colors ${topUpCredits > 0 && topUpCredits < 10000 ? "bg-surface-1 border-primary/40 shadow-sm" : "border-transparent"}`}>
                    <span className={`text-xs font-bold ${topUpCredits > 0 && topUpCredits < 10000 ? "text-primary" : "text-ink-muted"}`}>&lt; 10k</span>
                    <span className="text-xs font-medium text-ink mt-0.5">10đ/cr</span>
                  </div>
                  <div className={`flex flex-col p-2.5 rounded-lg border transition-colors ${topUpCredits >= 10000 && topUpCredits < 25000 ? "bg-surface-1 border-primary/40 shadow-sm" : "border-transparent"}`}>
                    <span className={`text-xs font-bold ${topUpCredits >= 10000 && topUpCredits < 25000 ? "text-primary" : "text-ink-muted"}`}>10k+</span>
                    <span className="text-xs font-medium text-ink mt-0.5">9đ/cr <span className="text-semantic-success text-[10px] ml-0.5">(10%)</span></span>
                  </div>
                  <div className={`flex flex-col p-2.5 rounded-lg border transition-colors ${topUpCredits >= 25000 && topUpCredits < 50000 ? "bg-surface-1 border-primary/40 shadow-sm" : "border-transparent"}`}>
                    <span className={`text-xs font-bold ${topUpCredits >= 25000 && topUpCredits < 50000 ? "text-primary" : "text-ink-muted"}`}>25k+</span>
                    <span className="text-xs font-medium text-ink mt-0.5">8.5đ/cr <span className="text-semantic-success text-[10px] ml-0.5">(15%)</span></span>
                  </div>
                  <div className={`flex flex-col p-2.5 rounded-lg border transition-colors ${topUpCredits >= 50000 ? "bg-surface-1 border-primary/40 shadow-sm" : "border-transparent"}`}>
                    <span className={`text-xs font-bold ${topUpCredits >= 50000 ? "text-primary" : "text-ink-muted"}`}>50k+</span>
                    <span className="text-xs font-medium text-ink mt-0.5">8đ/cr <span className="text-semantic-success text-[10px] ml-0.5">(20%)</span></span>
                  </div>
                </div>
              </div>

              {topUpCredits > 0 && (
                <div className="rounded-xl bg-surface-2 border border-hairline p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-muted">Rate applied</span>
                    <div className="flex items-center gap-2">
                      {discount > 0 && <Badge className="bg-semantic-success/20 hover:bg-semantic-success/20 text-semantic-success border-none text-xs px-2 py-0.5 rounded-full font-bold shadow-none">Save {discount}%</Badge>}
                      <span className="text-sm font-semibold text-ink">{rate} VND / credit</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-muted">Credits to add</span>
                    <span className="text-sm font-semibold text-ink">{topUpCredits.toLocaleString()} credits</span>
                  </div>
                  <div className="border-t border-hairline pt-3 mt-1 flex items-center justify-between">
                    <span className="text-base font-bold text-ink">Total</span>
                    <span className="text-2xl font-bold text-ink tracking-tight">{topUpTotal.toLocaleString("vi-VN")}đ</span>
                  </div>
                </div>
              )}

              <button type="button" disabled={isProcessing || topUpCredits <= 0}
                onClick={() => handleCheckout(topUpTotal, "CreditTopUp")}
                className="inline-flex items-center justify-center w-full rounded-xl h-14 text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 bg-primary hover:bg-primary-hover text-primary-foreground shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none">
                {isProcessing ? "Processing..." : topUpCredits > 0 ? <><span>Complete Top Up of {topUpCredits.toLocaleString()} credits</span><ArrowRight className="ml-2 h-5 w-5" /></> : "Enter credit amount above"}
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
      {/* Change Subscription confirmation dialog */}
      <Dialog open={showChangePlanDialog} onOpenChange={setShowChangePlanDialog}>
        <DialogContent className="sm:max-w-[440px] border-hairline bg-surface-1 shadow-lg rounded-xl text-ink">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {isUpgrade ? "Upgrade workspace plan?" : (isDowngrade ? "Downgrade workspace plan?" : "Change workspace plan?")}
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-muted mt-1">
              {isUpgrade ? "Are you sure you want to upgrade your workspace plan to " : (isDowngrade ? "Are you sure you want to downgrade your workspace plan to " : "Are you sure you want to change your workspace plan to ")}<strong>{pendingPlanName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-hairline bg-surface-2 p-4 text-xs text-ink-muted space-y-1.5 my-2">
            <p>• <strong>Billing updates today</strong>: Your billing cycle and price will update immediately.</p>
            <p>• <strong>Pro-rated credit</strong>: Any unused time on your current plan will be credited to this change.</p>
            <p>• <strong>Credits carried over</strong>: All your remaining credits will roll over to your new plan.</p>
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
              {isProcessing ? "Updating..." : (isUpgrade ? "Confirm Upgrade" : (isDowngrade ? "Confirm Downgrade" : "Confirm Change"))}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}