"use client";

import { CheckCircle, Lightning, ArrowRight, Crown, ArrowFatUp, ArrowFatDown, X, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { paymentService } from "@/services/payment.service";
import { billingService } from "@/services/billing.service";
import type { PlanDto, SubscriptionDto } from "@/types/billing";
import { getPlanDescription, buildFeatureList } from "@/lib/utils";
import { createHubConnection } from "@/lib/signalr";

// Static plan metadata (display info) — maps to backend plan slugs
const PLAN_META: Record<string, {
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyTotal: number;
  yearlyTotal: number;
  yearlyBilled: string;
  description: string;
  features: string[];
  featured: boolean;
}> = {
  Startup: {
    monthlyPrice: "190.000đ",
    yearlyPrice: "158.000đ",
    monthlyTotal: 190000,
    yearlyTotal: 1900000,
    yearlyBilled: "1.900.000đ",
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
  Enterprise: {
    monthlyPrice: "490.000đ",
    yearlyPrice: "408.000đ",
    monthlyTotal: 490000,
    yearlyTotal: 4900000,
    yearlyBilled: "4.900.000đ",
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
};

export default function PaymentPlansPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();

  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [isCheckoutProcessing, setIsCheckoutProcessing] = useState(false);

  // Dialogs
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [changePlanDialog, setChangePlanDialog] = useState<{ open: boolean; plan: PlanDto | null; direction: "upgrade" | "downgrade" }>({
    open: false, plan: null, direction: "upgrade"
  });

  const workspaceId = user?.id ?? "";

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

  // Fetch backend plans (for Guid IDs)
  const { data: backendPlans = [] } = useQuery<PlanDto[]>({
    queryKey: ["plans"],
    queryFn: () => billingService.getPlans(),
    enabled: !!workspaceId,
  });

  // Fetch active subscription
  const { data: activeSub, isLoading: isSubLoading } = useQuery<SubscriptionDto | null>({
    queryKey: ["subscription", workspaceId],
    queryFn: async () => {
      try {
        return await billingService.getActiveSubscription(workspaceId);
      } catch {
        return null; // 404 = no active sub
      }
    },
    enabled: !!workspaceId,
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: () => billingService.cancelSubscription(workspaceId, "User requested cancellation via plan page"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", workspaceId] });
      setCancelDialogOpen(false);
      toast.success("Subscription cancelled. Your plan remains active until the end of the billing period.");
    },
    onError: () => {
      toast.error("Failed to cancel subscription. Please try again.");
    },
  });

  // Change plan mutation
  const changePlanMutation = useMutation({
    mutationFn: (newPlanId: string) => billingService.changeSubscription(workspaceId, newPlanId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["subscription", workspaceId] });
      setChangePlanDialog({ open: false, plan: null, direction: "upgrade" });
      toast.success(`Successfully switched to ${data.planName} plan!`);
    },
    onError: () => {
      toast.error("Failed to change plan. Please try again.");
    },
  });

  const handleCheckout = async (amount: number, paymentType: string, planSlug = "", billingCycle = "") => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }
    try {
      setIsCheckoutProcessing(true);
      const url = await paymentService.createCheckoutSession({
        userId: user.id,
        workspaceId: user.id,
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
      setIsCheckoutProcessing(false);
    }
  };

  const getPlanBackendId = (planName: string): string | undefined =>
    backendPlans.find(p => p.name.toLowerCase() === planName.toLowerCase())?.id;

  const currentPlanName = activeSub?.planName ?? null;
  const cancelAtPeriodEnd = activeSub?.cancelAtPeriodEnd ?? false;
  const periodEnd = activeSub?.currentPeriodEnd ? format(new Date(activeSub.currentPeriodEnd), "MMMM dd, yyyy") : null;

  return (
    <div className="flex min-h-full flex-col items-center pb-12 pt-8">
      {/* Header */}
      <div className="text-center max-w-2xl mb-12">
        <Badge variant="secondary" className="mb-4 bg-surface-2 text-primary border border-hairline hover:bg-surface-2">
          Pricing & Subscriptions
        </Badge>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-ink mb-4">
          Choose the right plan for your team
        </h1>
        <p className="text-lg text-muted-foreground">
          Upgrade your workspace to unlock advanced AI capabilities, real-time translation, and more credits.
        </p>

        {/* Cancel at period end notice */}
        {cancelAtPeriodEnd && periodEnd && (
          <div className="mt-4 inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 rounded-lg px-4 py-2.5 text-sm">
            <Warning className="h-4 w-4 shrink-0" weight="fill" />
            <span>Your plan is scheduled to cancel on <strong>{periodEnd}</strong>. You can resubscribe anytime.</span>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <Tabs value={billingInterval} onValueChange={(val) => setBillingInterval(val as "monthly" | "yearly")} className="w-fit">
            <TabsList className="bg-surface-2 p-1 rounded-full border border-hairline">
              <TabsTrigger value="monthly" className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Monthly</TabsTrigger>
              <TabsTrigger value="yearly" className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Yearly (Save 20%)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl px-4">
        {backendPlans.filter(p => p.isActive !== false).sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => {
          const planName = plan.name;
          const isCurrentPlan = currentPlanName?.toLowerCase() === planName.toLowerCase();
          const hasActiveSub = !!currentPlanName;
          const currentPlanOrder = backendPlans.find(p => p.name === currentPlanName)?.sortOrder || 0;
          const isUpgrade = plan.sortOrder > currentPlanOrder && hasActiveSub;
          const isDowngrade = plan.sortOrder < currentPlanOrder && hasActiveSub;
          const backendPlanId = plan.id;
          
          const featureList = buildFeatureList(plan);
          const isFeatured = plan.sortOrder > 1;

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col !overflow-visible rounded-xl shadow-linear transition-transform duration-300 hover:-translate-y-1 ${
                isFeatured
                  ? "border-primary/50 bg-surface-2 shadow-[0_8px_30px_rgb(94,106,210,0.12)]"
                  : "border-hairline bg-surface-1"
              } ${isCurrentPlan ? "ring-2 ring-primary/40" : ""}`}
            >
              {/* Most Popular badge */}
              {isFeatured && !isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary hover:bg-primary text-primary-foreground border-none shadow-sm rounded-full px-3 py-0.5">Most Popular</Badge>
                </div>
              )}
              {/* Current Plan badge */}
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-none shadow-sm rounded-full px-3 py-0.5 flex items-center gap-1">
                    <Crown className="h-3 w-3" weight="fill" />
                    {cancelAtPeriodEnd ? "Cancels Soon" : "Current Plan"}
                  </Badge>
                </div>
              )}

              <CardHeader className="p-6 pb-4">
                <CardTitle className="text-xl font-medium">{planName}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">{getPlanDescription(plan.name)}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-semibold tracking-tight">
                    {plan.price === 0 ? "Free" : `${plan.price.toLocaleString()}${plan.currency === "VND" ? "đ" : ` ${plan.currency}`}`}
                  </span>
                  <span className="text-sm text-muted-foreground mb-1">/month</span>
                </div>
              </CardHeader>

              <CardContent className="flex-1 p-6 pt-4">
                <ul className="space-y-3">
                  {featureList.map((feature: string, i: number) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                      <span className="text-sm text-ink">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="p-6 pt-0 flex flex-col gap-2">
                {isSubLoading ? (
                  <button disabled className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium bg-surface-2 text-ink-muted border border-hairline opacity-50 cursor-wait">
                    Loading...
                  </button>
                ) : isCurrentPlan ? (
                  <>
                    <button
                      disabled
                      className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-300/50 dark:border-emerald-700/50 cursor-default"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" weight="fill" />
                      {cancelAtPeriodEnd ? `Active until ${periodEnd}` : "Current Plan"}
                    </button>
                    {!cancelAtPeriodEnd && (
                      <button
                        onClick={() => setCancelDialogOpen(true)}
                        className="inline-flex items-center justify-center w-full rounded-md h-8 text-xs font-medium text-ink-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border border-hairline/50 transition-colors cursor-pointer"
                      >
                        Cancel subscription
                      </button>
                    )}
                  </>
                ) : isUpgrade ? (
                  <button
                    type="button"
                    disabled={changePlanMutation.isPending || !backendPlanId}
                    onClick={() => setChangePlanDialog({ open: true, plan: backendPlans.find(p => p.name === planName) ?? null, direction: "upgrade" })}
                    className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium transition-colors bg-primary hover:bg-primary-hover text-primary-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowFatUp className="mr-2 h-4 w-4" weight="fill" />
                    Upgrade Plan
                  </button>
                ) : isDowngrade ? (
                  <button
                    type="button"
                    disabled={changePlanMutation.isPending || !backendPlanId}
                    onClick={() => setChangePlanDialog({ open: true, plan: backendPlans.find(p => p.name === planName) ?? null, direction: "downgrade" })}
                    className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium transition-colors bg-surface-2 hover:bg-surface-3 text-ink border border-hairline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowFatDown className="mr-2 h-4 w-4" />
                    Downgrade Plan
                  </button>
                ) : (
                  // No active subscription — show checkout
                  <button
                    type="button"
                    disabled={isCheckoutProcessing}
                    onClick={() => {
                      handleCheckout(plan.price, "Subscription", plan.slug, plan.billingCycle || "monthly");
                    }}
                    className={`inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isFeatured
                        ? "bg-primary hover:bg-primary-hover text-primary-foreground"
                        : "bg-surface-2 hover:bg-surface-3 text-ink border border-hairline"
                    }`}
                  >
                    {isCheckoutProcessing ? "Processing..." : "Choose Plan"}
                  </button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Top-up Section */}
      <div className="mt-16 w-full max-w-4xl px-4">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Lightning className="h-5 w-5 text-primary" weight="fill" />
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Need more credits?</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Top up your AI credits without changing your plan. Rate: 1 credit = 10 VND. Volume discounts applied automatically.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            { credits: "10,000", creditsNum: 10000, price: "90.000đ", priceNum: 90000, perCredit: "9 VND/credit", discount: "Save 10%", label: "Standard" },
            { credits: "25,000", creditsNum: 25000, price: "212.500đ", priceNum: 212500, perCredit: "8.5 VND/credit", discount: "Save 15%", label: "Popular" },
            { credits: "50,000", creditsNum: 50000, price: "400.000đ", priceNum: 400000, perCredit: "8 VND/credit", discount: "Save 20%", label: "Best Value" },
          ].map((pkg) => (
            <Card key={pkg.credits} className="relative flex flex-col rounded-xl border-hairline bg-surface-1 shadow-linear hover:-translate-y-0.5 transition-transform duration-200">
              {pkg.discount && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-semantic-success/90 hover:bg-semantic-success/90 text-white border-none shadow-sm rounded-full px-3 py-0.5 text-xs">{pkg.discount}</Badge>
                </div>
              )}
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium text-ink-muted">{pkg.label}</CardTitle>
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-semibold tracking-tight text-ink">{pkg.credits}</span>
                  <span className="text-sm text-muted-foreground ml-1">credits</span>
                </div>
                <p className="text-xs text-ink-muted mt-1">{pkg.perCredit}</p>
              </CardHeader>
              <CardFooter className="p-5 pt-0 flex flex-col gap-2 mt-auto">
                <div className="text-xl font-semibold text-ink">{pkg.price}</div>
                <button
                  type="button"
                  disabled={isCheckoutProcessing}
                  onClick={() => handleCheckout(pkg.priceNum, "CreditTopUp")}
                  className="inline-flex items-center justify-center w-full rounded-md h-9 text-sm font-medium transition-colors bg-surface-2 hover:bg-surface-3 text-ink border border-hairline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCheckoutProcessing ? "Processing..." : <><ArrowRight className="mr-2 h-4 w-4" />Top up {pkg.credits} credits</>}
                </button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* Cancel Subscription Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-[420px] border-hairline bg-surface-1">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-ink">
              <Warning className="h-5 w-5 text-amber-500" weight="fill" />
              Cancel Subscription?
            </DialogTitle>
            <DialogDescription className="text-ink-muted">
              Your <strong>{currentPlanName}</strong> plan will remain fully active until{" "}
              <strong>{periodEnd}</strong>. After that, your workspace will be downgraded and you won&apos;t be charged again.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 my-2">
            Unused credits will be retained until the period ends. No refund is issued for the current billing period.
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setCancelDialogOpen(false)}
              className="flex-1 inline-flex h-9 items-center justify-center rounded-md border border-hairline bg-surface-1 hover:bg-surface-2 px-3 text-sm font-medium text-ink cursor-pointer transition-colors"
            >
              Keep Plan
            </button>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="flex-1 inline-flex h-9 items-center justify-center rounded-md bg-red-500 hover:bg-red-600 px-3 text-sm font-medium text-white cursor-pointer transition-colors disabled:opacity-50"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel at Period End"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade / Downgrade Dialog */}
      <Dialog open={changePlanDialog.open} onOpenChange={(open) => !open && setChangePlanDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="sm:max-w-[440px] border-hairline bg-surface-1">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-ink">
              {changePlanDialog.direction === "upgrade"
                ? <><ArrowFatUp className="h-5 w-5 text-primary" weight="fill" /> Upgrade to Enterprise</>
                : <><ArrowFatDown className="h-5 w-5 text-ink-muted" /> Downgrade to Startup</>
              }
            </DialogTitle>
            <DialogDescription className="text-ink-muted">
              {changePlanDialog.direction === "upgrade"
                ? <>You&apos;re switching from <strong>{currentPlanName}</strong> to <strong>Enterprise</strong>. Stripe will automatically calculate a prorated charge for the remaining days in your billing cycle.</>
                : <>You&apos;re switching from <strong>{currentPlanName}</strong> to <strong>Startup</strong>. The change will take effect immediately. Unused credits will carry over.</>
              }
            </DialogDescription>
          </DialogHeader>

          <div className={`rounded-lg p-3 text-xs my-2 border ${changePlanDialog.direction === "upgrade" ? "bg-primary/5 border-primary/20 text-primary" : "bg-surface-2 border-hairline text-ink-muted"}`}>
            {changePlanDialog.direction === "upgrade"
              ? "⚡ Upgrade takes effect immediately. You'll have access to Enterprise features right away."
              : "📋 Downgrade takes effect immediately. Some Enterprise features will become unavailable."
            }
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => setChangePlanDialog(prev => ({ ...prev, open: false }))}
              className="flex-1 inline-flex h-9 items-center justify-center rounded-md border border-hairline bg-surface-1 hover:bg-surface-2 px-3 text-sm font-medium text-ink cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const planId = changePlanDialog.plan?.id;
                if (planId) changePlanMutation.mutate(planId);
              }}
              disabled={changePlanMutation.isPending || !changePlanDialog.plan}
              className={`flex-1 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-white cursor-pointer transition-colors disabled:opacity-50 ${
                changePlanDialog.direction === "upgrade" ? "bg-primary hover:bg-primary-hover" : "bg-surface-3 hover:bg-surface-2 !text-ink border border-hairline"
              }`}
            >
              {changePlanMutation.isPending
                ? "Processing..."
                : changePlanDialog.direction === "upgrade"
                  ? "Confirm Upgrade"
                  : "Confirm Downgrade"
              }
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
