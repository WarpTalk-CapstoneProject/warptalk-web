"use client";

/**
 * Billing — the subscription itself, and nothing else.
 *
 * WHAT MOVED OUT, AND WHY
 *   This page used to be three tabs (Overview & Usage / Transaction History / Billing History), a
 *   six-cell metric grid, two charts, a per-service table, a filter bar, an Excel export dialog
 *   and a plan sidebar — roughly two thousand lines answering four unrelated questions at once.
 *   Usage now lives at ./usage and invoices at ./invoices, each a sibling in the settings nav, so
 *   the reader picks a question instead of scrolling past three of them.
 *
 *   Top-up left the page entirely. It was a form stacked under the plan cards, which made buying
 *   credits something you found by scrolling; it is an errand, so it is now a modal reached from
 *   the balance it changes.
 *
 * THE SHAPE (owner's call, 2026-09-17: "not cards — a grid, like OpenAI")
 *   The balance flat on the page: plan line, the remaining credits as the one large number, the
 *   two actions, and overages as a single line under them because it changes what that number
 *   means. Then a grid of link tiles, one per sibling page. The plan ladder moved behind "Plans &
 *   pricing" (/payment/plans), where changing plan already happens through Checkout.
 *
 * NO SHADOWS anywhere on this surface. See ./components/billing-primitives.
 */

import {
  ArrowClockwise,
  ChartLine,
  ListChecks,
  Lock,
  Money,
  Receipt,
  Spinner,
  Stack,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { format } from "date-fns";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AdminBillingPage from "@/app/(internal)/billing/page";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { formatAmount, formatMoney } from "@/lib/format/currency";
import { createHubConnection } from "@/lib/realtime/signalr";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { BillingButton } from "./components/billing-primitives";
import { ManageSubscriptionModal } from "./components/manage-subscription-modal";
import { TopUpModal } from "./components/top-up-modal";

/**
 * The billing API answers "this workspace has no plan" with an explicit error code rather than an
 * empty payload, on every endpoint that needs a subscription to compute anything. That is a
 * legitimate account state, not a broken request, and the two must not collapse into one UI.
 */
const NO_SUBSCRIPTION_CODE = "BILLING_SUBSCRIPTION_NOT_FOUND";

interface BillingErrorBody {
  error?: string;
  message?: string;
  Message?: string;
  code?: string;
}

function isNoSubscriptionError(error: unknown): boolean {
  return (
    isAxiosError<BillingErrorBody>(error) &&
    error.response?.data?.code === NO_SUBSCRIPTION_CODE
  );
}

function getBillingErrorMessage(error: unknown): string {
  if (isAxiosError<BillingErrorBody>(error)) {
    const body = error.response?.data;
    const detail = body?.message ?? body?.Message ?? body?.error;
    if (detail) return detail;
    if (error.response?.status) {
      return `The billing service responded with HTTP ${error.response.status}.`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export default function WorkspaceBillingPage() {
  const params = useParams();
  const slug = params?.workspaceSlug as string;

  if (slug === "warptalk-global") {
    return <AdminBillingPage />;
  }

  return <WorkspaceBillingContent slug={slug} />;
}

function WorkspaceBillingContent({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { isAuthenticated, accessToken } = useAuthStore();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceSlug =
    useWorkspaceStore((state) => state.activeWorkspaceSlug) || slug || "";
  const workspaceId = activeWorkspaceId || "";
  const role = useWorkspaceRole();

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      if (
        notification?.type === "billing.credits_updated" ||
        notification?.type === "billing.subscription_changed"
      ) {
        queryClient.invalidateQueries({ queryKey: ["billing"] });
      }
    });

    let isMounted = true;

    connection
      .start()
      .then(() => {
        if (isMounted && workspaceId) {
          connection.invoke("JoinWorkspace", workspaceId).catch(() => undefined);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.message?.includes("stop() was called")) return;
      });

    return () => {
      isMounted = false;
      connection.stop();
    };
  }, [queryClient, accessToken, isAuthenticated, workspaceId]);

  const {
    data: balance,
    isLoading: isBalanceLoading,
    error: balanceError,
  } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId,
    // WT-451: the provider's retry policy already declines every 4xx. A workspace with no
    // subscription answers 404 here, and asking twice only doubles the console noise.
  });

  const {
    data: subscription,
    isLoading: isSubscriptionLoading,
    error: subscriptionError,
  } = useQuery({
    queryKey: ["billing", "subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });

  const { data: plans } = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => billingService.getPlans(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: overage } = useQuery({
    queryKey: ["billing", "overage", workspaceId],
    queryFn: () => billingService.getOverageSetting(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });

  // Cheapest first. The grid's "Everything in X, plus" line and its covered-by-current-plan
  // reasoning both depend on the ladder being in price order, not in arrival order.
  const activePlans = useMemo(() => {
    const list = (plans ?? []).filter((plan) => plan.isActive);
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
  }, [plans]);

  const activePlan = activePlans.find((plan) => plan.id === subscription?.planId) ?? null;

  const currentCredits = balance?.currentCredits ?? 0;
  const totalCredits = balance?.totalCredits ?? 0;
  // The server's own number, not `total - current`. They agree today, but only one of them stays
  // right if a top-up mid-cycle raises the total.
  const creditsUsed = balance?.creditsUsedThisCycle ?? 0;

  const usageRatioPercent = totalCredits > 0 ? (creditsUsed / totalCredits) * 100 : 0;
  const remainingRatioPercent = 100 - usageRatioPercent;

  const renewsDate = balance?.currentPeriodEnd
    ? format(new Date(balance.currentPeriodEnd), "MMM d, yyyy")
    : "—";

  const coreErrors = [balanceError, subscriptionError];
  const isCoreLoading = isBalanceLoading || isSubscriptionLoading;
  const hasNoSubscription = coreErrors.some(isNoSubscriptionError);
  const hardError = coreErrors.find((error) => error && !isNoSubscriptionError(error));

  const retryBillingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["billing"] });
  };

  if (!role) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Card className="max-w-md rounded-[14px] border-border bg-surface-1 p-6 text-center shadow-none">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can view billing and subscription
              configurations.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Decide nothing until the queries that own every number here have settled. Falling through
  // paints a fabricated balance of 0 and then takes it away, which reads as the app changing its
  // mind rather than as an answer.
  if (isCoreLoading) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (hasNoSubscription) {
    return <BillingNoSubscriptionState workspaceSlug={workspaceSlug} />;
  }

  if (hardError) {
    return (
      <BillingErrorState
        message={getBillingErrorMessage(hardError)}
        onRetry={retryBillingQueries}
      />
    );
  }

  const overagesOn = overage?.enabled === true;
  const lowBalance = totalCredits > 0 && remainingRatioPercent <= 15;
  const spentPercent = Math.min(100, Math.max(0, usageRatioPercent));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8 text-ink">
      {/* The balance, flat on the page. It is the one number this screen exists to answer, so it
          is not boxed in a card competing with the tiles below — the same shape as the OpenAI
          billing overview the owner pointed at. */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
          <span className="inline-flex h-[22px] items-center rounded-full border border-hairline bg-surface-1 px-2.5 text-[12px] font-medium text-ink">
            {subscription?.planName ?? "No active plan"}
          </span>
          {subscription ? (
            <span>{formatMoney(subscription.price, activePlan?.currency)} per cycle</span>
          ) : null}
          <span aria-hidden="true">·</span>
          <span className={cn(subscription?.cancelAtPeriodEnd && "text-amber-600 dark:text-amber-400")}>
            {subscription?.cancelAtPeriodEnd
              ? `Cancelled — translation stops ${renewsDate}`
              : `Renews ${renewsDate}`}
          </span>
        </div>

        <div>
          <p className="text-[13px] text-ink-muted">Credits remaining</p>
          <p
            className={cn(
              "mt-1 text-[40px] font-semibold leading-none tracking-[-0.8px] tabular-nums",
              lowBalance ? "text-amber-600 dark:text-amber-400" : "text-ink",
            )}
          >
            {formatAmount(currentCredits)}
          </p>
          {totalCredits > 0 ? (
            <div className="mt-4 max-w-md">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                role="progressbar"
                aria-label="Credits spent this cycle"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(spentPercent)}
              >
                <div
                  className={cn("h-full rounded-full", lowBalance ? "bg-amber-500" : "bg-primary")}
                  style={{ width: `${spentPercent}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] tabular-nums text-ink-muted">
                {formatAmount(creditsUsed)} spent of {formatAmount(totalCredits)} granted this
                cycle
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-ink-muted">No allowance on this cycle.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BillingButton tone="primary" className="w-auto px-4" onClick={() => setIsTopUpOpen(true)}>
            <Wallet className="h-3.5 w-3.5" />
            Buy credits
          </BillingButton>
          <BillingButton tone="outline" className="w-auto px-4" onClick={() => setIsManageOpen(true)}>
            Manage subscription
          </BillingButton>
        </div>

        {/* Overages is a standing condition that changes what the number above means, so it
            stays in this block as one line rather than a banner of its own. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-4 text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-full", overagesOn ? "bg-emerald-500" : "bg-ink-subtle")}
            />
            Overages {overagesOn ? "on" : "off"}
          </span>
          <span className="min-w-0 flex-1 text-ink-muted">
            {overagesOn
              ? `Meetings keep translating past zero credits, up to ${formatAmount(overage?.effectiveCapCredits ?? 0)} credits this cycle.`
              : "Meetings stop the moment the credits run out."}
          </span>
          <button
            type="button"
            onClick={() => setIsManageOpen(true)}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            {overagesOn ? "Manage" : "Turn on"}
          </button>
        </div>
      </section>

      {/* Everything else about money is a destination, not a panel: one tile per sibling page,
          laid out as a grid of links. The plan ladder that used to fill the bottom of this page
          lives behind "Plans & pricing", where it is the whole subject. */}
      <nav aria-label="Billing" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: `/${workspaceSlug}/settings/billing/usage`,
            icon: ChartLine,
            title: "Usage",
            description: "Where credits went, by service and by day.",
          },
          {
            href: `/${workspaceSlug}/settings/billing/invoices`,
            icon: Receipt,
            title: "Invoices",
            description: "Past and current invoices for this workspace.",
          },
          {
            href: `/${workspaceSlug}/settings/billing/payments`,
            icon: Money,
            title: "Payments",
            description: "Every payment and whether it went through.",
          },
          {
            href: `/${workspaceSlug}/settings/features`,
            icon: ListChecks,
            title: "Features",
            description: activePlan
              ? `${activePlan.maxParticipants} participants · ${activePlan.maxLanguages} languages, and what else your plan includes.`
              : "What your plan includes and the limits in force.",
          },
          {
            href: `/${workspaceSlug}/payment/plans`,
            icon: Stack,
            title: "Plans & pricing",
            description: "Compare plans and change yours.",
          },
        ].map(({ href, icon: Icon, title, description }) => (
          <Link
            key={title}
            href={href}
            className="group flex items-start gap-3 rounded-[10px] border border-hairline bg-surface-1 p-4 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-hairline bg-surface-2 text-ink-muted group-hover:text-ink">
              <Icon className="h-4 w-4" weight="duotone" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">{title}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
                {description}
              </span>
            </span>
          </Link>
        ))}
      </nav>

      <ManageSubscriptionModal
        open={isManageOpen}
        onOpenChange={setIsManageOpen}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        subscription={subscription ?? null}
        plan={activePlan}
      />
      <TopUpModal open={isTopUpOpen} onOpenChange={setIsTopUpOpen} workspaceId={workspaceId} />
    </div>
  );
}

/**
 * Legitimate account state: the workspace simply has no plan yet. Deliberately not styled as a
 * failure, and it carries the one action that resolves it.
 */
function BillingNoSubscriptionState({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <div className="px-4 py-4">
      <PagePlaceholder
        kind="billing"
        title="No active subscription"
        description="This workspace has no billing plan yet, so there is no balance or usage to report. Choose a plan to start tracking credits and AI usage."
        action={
          <Link href={`/${workspaceSlug}/payment/plans`}>
            <span className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition hover:opacity-90">
              <Wallet className="h-3.5 w-3.5" />
              Choose a plan
            </span>
          </Link>
        }
      />
    </div>
  );
}

/** Anything that is not "no plan": the numbers are unknown, so none are shown. */
function BillingErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <Card className="max-w-md rounded-[14px] border-border bg-surface-1 p-6 text-center shadow-none">
        <CardHeader className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <WarningCircle className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-bold">Could not load billing data</CardTitle>
          <CardDescription className="text-xs">
            Your balance and usage are unavailable right now, so nothing is shown rather than a
            figure that could be wrong. {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-white transition duration-150 hover:bg-primary-hover"
          >
            <ArrowClockwise className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
