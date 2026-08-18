"use client";

/**
 * DO NOT DELETE, and do not "consolidate" this into /{slug}/payment/plans.
 *
 * Nothing in this app links here any more, which makes it look exactly like the stale
 * duplicate it is not. Its caller is Stripe: this path is the configured cancel URL in
 * production (deploy/production/app.compose.yml, `Stripe__CancelUrl`), and in the k3s chart
 * and docker-compose defaults besides. Anyone who abandons a checkout lands on this page.
 *
 * That is also why it is unslugged and why it sits in PUBLIC_ROUTES: the person returning
 * from Stripe may no longer have a live session, and a redirect to /login at that moment
 * reads as "my payment broke".
 *
 * Changing this path means changing Stripe__CancelUrl in every deployment first.
 */

import {
  ArrowFatDown,
  ArrowFatUp,
  ArrowLeft,
  CheckCircle,
  Crown,
  Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import { buildFeatureList, getPlanDescription } from "@/lib/utils";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { PlanDto, SubscriptionDto } from "@/types/billing";
import { formatMoney } from "@/lib/format/currency";

export default function PaymentPlansPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();

  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [isCheckoutProcessing, setIsCheckoutProcessing] = useState(false);

  // Dialogs
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  /**
   * WT-370, applied here at last. This read `user?.id`, so every request on this page asked the
   * billing service about a workspace whose id is a USER id: the subscription lookup could only
   * 404, "Cancel subscription" cancelled nothing, and — the one that costs money — the checkout
   * below sent that id as `WorkspaceId` in the Stripe metadata. It is a well-formed Guid, so it
   * passes every validation downstream and fails on the workspace foreign key four layers away,
   * after the card has been charged.
   *
   * The slugged plans page was fixed for exactly this in WT-370. This copy was missed because
   * nothing in the app links here — Stripe does.
   */
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId) ?? "";
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

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
  const { data: activeSub, isLoading: isSubLoading } =
    useQuery<SubscriptionDto | null>({
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
    mutationFn: () =>
      billingService.cancelSubscription(
        workspaceId,
        "User requested cancellation via plan page",
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subscription", workspaceId],
      });
      setCancelDialogOpen(false);
      toast.success(
        "Subscription cancelled. Your plan remains active until the end of the billing period.",
      );
    },
    onError: () => {
      toast.error("Failed to cancel subscription. Please try again.");
    },
  });

  /*
   * WT-381 — a `changePlanMutation` calling `/subscriptions/workspace/{id}/change-plan` stood
   * here. That route has never existed in the billing service. Changing plans is a purchase, and
   * it needs the dialog that explains the charge; that dialog lives on the workspace's own plans
   * page, which is where the buttons below now lead.
   */

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
    if (!workspaceId) {
      toast.error(
        "Open a workspace before choosing a plan — a subscription belongs to a workspace.",
      );
      return;
    }

    try {
      setIsCheckoutProcessing(true);
      const url = await billingService.createCheckoutSession({
        userId: user.id,
        workspaceId,
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
      setIsCheckoutProcessing(false);
    }
  };

  const currentPlanName = activeSub?.planName ?? null;
  const cancelAtPeriodEnd = activeSub?.cancelAtPeriodEnd ?? false;
  const periodEnd = activeSub?.currentPeriodEnd
    ? format(new Date(activeSub.currentPeriodEnd), "MMMM dd, yyyy")
    : null;

  const handleBackNav = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (activeWorkspaceSlug) {
      router.push(`/${activeWorkspaceSlug}/dashboard`);
    } else {
      router.push("/workspace/create");
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center pb-12 pt-4">
      {/* Top Navigation Bar */}
      <div className="w-full max-w-4xl px-4 mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBackNav}
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Back to Workspace Creation</span>
        </button>

        {activeWorkspaceSlug && (
          <button
            type="button"
            onClick={() => router.push(`/${activeWorkspaceSlug}/dashboard`)}
            className="text-[12px] text-ink-muted transition-colors hover:text-ink cursor-pointer"
          >
            Return to Dashboard
          </button>
        )}
      </div>

      {/* Header */}
      <div className="text-center max-w-2xl mb-12">
        <Badge
          variant="secondary"
          className="mb-4 bg-surface-2 text-primary border border-hairline hover:bg-surface-2"
        >
          Pricing & Subscriptions
        </Badge>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-ink mb-4">
          Choose the right plan for your team
        </h1>
        <p className="text-lg text-muted-foreground">
          Upgrade your workspace to unlock advanced AI capabilities, real-time
          translation, and more credits.
        </p>

        {/* Cancel at period end notice */}
        {cancelAtPeriodEnd && periodEnd && (
          <div className="mt-4 inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 rounded-lg px-4 py-2.5 text-sm">
            <Warning className="h-4 w-4 shrink-0" weight="fill" />
            <span>
              Your plan is scheduled to cancel on <strong>{periodEnd}</strong>.
              You can resubscribe anytime.
            </span>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <Tabs
            value={billingInterval}
            onValueChange={(val) =>
              setBillingInterval(val as "monthly" | "yearly")
            }
            className="w-fit"
          >
            <TabsList className="bg-surface-2 p-1 rounded-full border border-hairline">
              <TabsTrigger
                value="monthly"
                className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger
                value="yearly"
                className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm"
              >
                Yearly (Save 20%)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl px-4">
        {backendPlans
          .filter((p) => p.isActive !== false)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((plan) => {
            const planName = plan.name;
            const isCurrentPlan =
              currentPlanName?.toLowerCase() === planName.toLowerCase();
            const hasActiveSub = !!currentPlanName;
            const currentPlanOrder =
              backendPlans.find((p) => p.name === currentPlanName)?.sortOrder ||
              0;
            const isUpgrade = plan.sortOrder > currentPlanOrder && hasActiveSub;
            const isDowngrade =
              plan.sortOrder < currentPlanOrder && hasActiveSub;

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
                    <Badge className="bg-primary hover:bg-primary text-primary-foreground border-none shadow-sm rounded-full px-3 py-0.5">
                      Most Popular
                    </Badge>
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
                  <CardTitle className="text-xl font-medium">
                    {planName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">
                    {getPlanDescription(plan.name)}
                  </p>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-tight">
                      {plan.price === 0
                        ? "Free"
                        : formatMoney(plan.price, plan.currency)}
                    </span>
                    <span className="text-sm text-muted-foreground mb-1">
                      /month
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 p-6 pt-4">
                  <ul className="space-y-3">
                    {featureList.map((feature: string, i: number) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle
                          className="h-5 w-5 text-primary shrink-0 mt-0.5"
                          weight="fill"
                        />
                        <span className="text-sm text-ink">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="p-6 pt-0 flex flex-col gap-2">
                  {isSubLoading ? (
                    <button
                      disabled
                      className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium bg-surface-2 text-ink-muted border border-hairline opacity-50 cursor-wait"
                    >
                      Loading...
                    </button>
                  ) : isCurrentPlan ? (
                    <>
                      <button
                        disabled
                        className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-300/50 dark:border-emerald-700/50 cursor-default"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" weight="fill" />
                        {cancelAtPeriodEnd
                          ? `Active until ${periodEnd}`
                          : "Current Plan"}
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
                  ) : isUpgrade || isDowngrade ? (
                    /* Changing plans charges in full and restarts the billing period today. That
                       needs saying before the checkout opens, and the dialog that says it lives on
                       the workspace's own plans page — so this points there rather than carrying a
                       second copy of the explanation. */
                    <a
                      href={
                        activeWorkspaceSlug
                          ? `/${activeWorkspaceSlug}/payment/plans`
                          : "/workspace"
                      }
                      className="inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium transition-colors bg-surface-2 hover:bg-surface-3 text-ink border border-hairline cursor-pointer"
                    >
                      {isUpgrade ? (
                        <ArrowFatUp className="mr-2 h-4 w-4" weight="fill" />
                      ) : (
                        <ArrowFatDown className="mr-2 h-4 w-4" />
                      )}
                      Manage plan
                    </a>
                  ) : (
                    // No active subscription — show checkout
                    <button
                      type="button"
                      disabled={isCheckoutProcessing}
                      onClick={() => {
                        handleCheckout(
                          plan.price,
                          "Subscription",
                          plan.slug,
                          plan.billingCycle || "monthly",
                        );
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

      {/* Top-up Section — switched off, and it says why.

          Three separate problems, each enough on its own. The button posted
          `paymentType: "CreditTopUp"`, which is not one of the backend's payment types
          (Subscription / SubscriptionRenewal / SubscriptionUpdate / InvoicePayment), so no handler
          matched: the customer was charged, an invoice was issued, and the balance never moved.
          The prices were a 9 / 8.5 / 8 VND-per-credit ladder against a documented retail rate of
          4 VND (docs/credit-economics.md §4.2) — a 2x overcharge. And the "Save 10/15/20%" badges
          advertised volume discounts WarpTalk does not offer.

          The slugged plans page turned this off for the first of those reasons. This copy was
          missed, and it is the page Stripe returns an abandoned checkout to. */}
      <div className="mt-16 w-full max-w-4xl px-4">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-ink">
            Credit top-up is temporarily unavailable
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Payment would be taken without the credits being added, so the purchase is switched
            off until that is fixed. Your subscription still renews its credits on schedule.
            Contact support if you need a balance adjustment.
          </p>
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
              Your <strong>{currentPlanName}</strong> plan will remain fully
              active until <strong>{periodEnd}</strong>. After that, your
              workspace will be downgraded and you won&apos;t be charged again.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 my-2">
            Unused credits will be retained until the period ends. No refund is
            issued for the current billing period.
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
              {cancelMutation.isPending
                ? "Cancelling..."
                : "Cancel at Period End"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade / Downgrade Dialog */}
    </div>
  );
}
