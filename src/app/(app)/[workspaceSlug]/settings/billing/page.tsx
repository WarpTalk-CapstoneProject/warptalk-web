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
 * THE SHAPE
 *   Overages first, because it is a standing condition that changes what every number below it
 *   means. Then the two balances. Then the current plan with one control — Manage subscription —
 *   that owns every state change short of a purchase. Then the ladder.
 *
 * THE FRAME: ONE RULED SURFACE, NOT A STACK OF CARDS
 *   Those four blocks used to be separate rounded boxes with gaps between them, and the ladder a
 *   fifth box of its own. They are now cells of a single grid on the shell's panel, split by 1px
 *   hairlines that run edge to edge (the platform.openai.com/usage look): each row rules its bottom
 *   edge, the two balances rule the line between them, and the ladder's columns continue the same
 *   rules. The page paints no ground of its own — see scripts/check-page-ground.mjs.
 *
 *   Only the framing changed. A "flat overview + link tiles" rewrite that moved the ladder off
 *   this page was rejected; the owner's call, 2026-09-17: "giữ nguyên content cũ của billing nhưng
 *   làm dạng grid line" — keep the old content, lay it out as grid lines.
 *
 * NO SHADOWS anywhere on this surface. See ./components/billing-primitives.
 */

import {
  ArrowClockwise,
  Lock,
  Spinner,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
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
import { ExtraCreditsNeedPlan } from "@/components/billing/extra-credits-need-plan";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { canBuyExtraCredits } from "@/lib/billing/extra-credits";
import { formatAmount, formatMoney } from "@/lib/format/currency";
import { createHubConnection } from "@/lib/realtime/signalr";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { FrozenCreditsDto, PlanDto } from "@/types/billing";

import {
  BannerRow,
  BillingButton,
  GridRow,
  Pill,
  StatCell,
} from "./components/billing-primitives";
import { ManageSubscriptionModal } from "./components/manage-subscription-modal";
import { PlanGrid } from "./components/plan-grid";
import { TopUpModal } from "./components/top-up-modal";
import { CatalogSection } from "./components/catalog-section";

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

type BillingT = ReturnType<typeof useTranslations>;

function getBillingErrorMessage(error: unknown, t: BillingT): string {
  if (isAxiosError<BillingErrorBody>(error)) {
    const body = error.response?.data;
    const detail = body?.message ?? body?.Message ?? body?.error;
    if (detail) return detail;
    if (error.response?.status) {
      return t("errorState.httpError", { status: error.response.status });
    }
    return error.message;
  }
  return error instanceof Error ? error.message : t("errorState.unexpected");
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
  const t = useTranslations("settingsBilling");
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

  // Credits kept from a subscription that ended. Asked separately because it is the one number
  // that still exists when there is no plan: the balance above 404s for an expired workspace.
  const { data: frozen } = useQuery({
    queryKey: ["billing", "frozen", workspaceId],
    queryFn: () => billingService.getFrozenCredits(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });
  const frozenCredits = frozen?.frozenCredits ?? 0;

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

  // backend#467: the server refuses a top-up or pack without a live plan (409), so every way to
  // buy one is hidden in exactly that case. The same rule as the server's, not hasPaidEntitlement.
  const canBuyCredits = canBuyExtraCredits(subscription);

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

  // Changing plan is a PURCHASE and goes through Stripe Checkout, which lives on the plans page.
  // There is no in-place "change plan" call to make: WT-381 established that the change-plan route
  // never existed, and that a payment for a different plan IS the change.
  const goToCheckout = (plan: PlanDto) => {
    window.location.assign(`/${workspaceSlug}/payment/plans?plan=${plan.slug}`);
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
            <CardTitle className="text-lg font-bold">{t("accessDenied.title")}</CardTitle>
            <CardDescription className="text-xs">
              {t("accessDenied.description")}
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
    return <BillingNoSubscriptionState workspaceSlug={workspaceSlug} frozen={frozen ?? null} />;
  }

  if (hardError) {
    return (
      <BillingErrorState
        message={getBillingErrorMessage(hardError, t)}
        onRetry={retryBillingQueries}
      />
    );
  }

  const overagesOn = overage?.enabled === true;

  return (
    <div className="flex min-w-0 flex-col text-ink">
      {frozenCredits > 0 ? (
        // Renewed, and the previous subscription's kept credits are on their way into this one
        // (the payment moves them; the hourly billing sweep catches any it did not).
        <BannerRow
          title={t("frozen.pendingTitle")}
          badge={<Pill tone="accent">{formatAmount(frozenCredits)}</Pill>}
          description={t("frozen.pendingDescription", { credits: formatAmount(frozenCredits) })}
        />
      ) : null}
      <BannerRow
        title={t("overages.title")}
        badge={<Pill tone="accent">{t("overages.badge")}</Pill>}
        description={
          overagesOn
            ? t("overages.descriptionOn", {
                cap: formatAmount(overage?.effectiveCapCredits ?? 0),
              })
            : t("overages.descriptionOff")
        }
        action={
          <BillingButton
            tone={overagesOn ? "outline" : "primary"}
            className="w-auto px-4"
            onClick={() => setIsManageOpen(true)}
          >
            {overagesOn ? t("overages.manage") : t("overages.enable")}
          </BillingButton>
        }
      />

      {/* Stacked on a phone, where the first cell's bottom rule is the line between them; side by
          side from sm, where that rule becomes the vertical one. */}
      <div className="grid sm:grid-cols-2">
        <StatCell
          label={t("stats.creditsRemaining.label")}
          className="sm:border-r"
          value={formatAmount(currentCredits)}
          tone={totalCredits > 0 && remainingRatioPercent <= 15 ? "warn" : "default"}
          lines={[
            totalCredits > 0
              ? t("stats.creditsRemaining.granted", { total: formatAmount(totalCredits) })
              : t("stats.creditsRemaining.noAllowance"),
            t("stats.creditsRemaining.spent", { used: formatAmount(creditsUsed) }),
            t("stats.creditsRemaining.cycleEnds", { date: renewsDate }),
          ]}
        />
        <StatCell
          label={t("stats.currentPlan.label")}
          value={subscription?.planName ?? t("stats.currentPlan.noPlan")}
          tone={subscription?.cancelAtPeriodEnd ? "warn" : "default"}
          lines={[
            subscription
              ? t("stats.currentPlan.pricePerCycle", {
                  price: formatMoney(subscription.price, activePlan?.currency),
                })
              : t("stats.currentPlan.noBalance"),
            activePlan
              ? t("stats.currentPlan.limits", {
                  participants: activePlan.maxParticipants,
                  languages: activePlan.maxLanguages,
                })
              : t("stats.currentPlan.limitsUnavailable"),
            subscription?.cancelAtPeriodEnd
              ? t("stats.currentPlan.cancelled", { date: renewsDate })
              : t("stats.currentPlan.renews", { date: renewsDate }),
          ]}
        />
      </div>

      <GridRow className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] text-ink-muted">{t("currentPlanRow.label")}</p>
          <p className="mt-1 truncate text-[20px] font-semibold leading-tight text-ink">
            {subscription?.planName ?? t("stats.currentPlan.noPlan")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="hidden text-[12px] text-ink-muted sm:inline">
            {subscription?.cancelAtPeriodEnd
              ? t("currentPlanRow.endsOn", { date: renewsDate })
              : t("currentPlanRow.renewsOn", { date: renewsDate })}
          </span>
          {/* backend#467: extra credits are sold only on top of a live plan. */}
          {canBuyCredits ? (
            <BillingButton
              tone="outline"
              className="w-auto px-3"
              onClick={() => setIsTopUpOpen(true)}
            >
              <Wallet className="h-3.5 w-3.5" />
              {t("buyCredits")}
            </BillingButton>
          ) : null}
          <BillingButton
            tone="outline"
            className="w-auto px-3"
            onClick={() => setIsManageOpen(true)}
          >
            {t("manageSubscription")}
          </BillingButton>
        </div>
      </GridRow>

      {canBuyCredits ? null : (
        <div className="border-b border-border px-4 py-3">
          <ExtraCreditsNeedPlan plansHref={`/${workspaceSlug}/payment/plans`} />
        </div>
      )}

      {/* G11: the credit packs and add-ons this workspace may buy, priced by the server. */}
      <CatalogSection workspaceId={workspaceId} />

      {activePlans.length > 0 ? (
        <PlanGrid
          plans={activePlans}
          currentPlanId={subscription?.planId ?? null}
          onSelect={goToCheckout}
        />
      ) : null}

      <ManageSubscriptionModal
        open={isManageOpen}
        onOpenChange={setIsManageOpen}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        subscription={subscription ?? null}
        plan={activePlan}
      />
      {canBuyCredits ? (
        <TopUpModal open={isTopUpOpen} onOpenChange={setIsTopUpOpen} workspaceId={workspaceId} />
      ) : null}
    </div>
  );
}

/**
 * Legitimate account state: the workspace simply has no plan yet. Deliberately not styled as a
 * failure, and it carries the one action that resolves it.
 */
function BillingNoSubscriptionState({
  workspaceSlug,
  frozen,
}: {
  workspaceSlug: string;
  frozen: FrozenCreditsDto | null;
}) {
  const t = useTranslations("settingsBilling");
  const kept = frozen?.frozenCredits ?? 0;
  // An expired workspace still owns what it bought. Say so, with the number, instead of the
  // generic "no plan" copy that reads as if everything was lost.
  const description =
    kept > 0
      ? [
          t("frozen.keptDetail", {
            date: frozen?.endedAt ? format(new Date(frozen.endedAt), "MMM d, yyyy") : "—",
          }),
          frozen?.dormantSince
            ? t("frozen.dormant", { date: format(new Date(frozen.dormantSince), "MMM d, yyyy") })
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : t("noSubscription.description");
  return (
    <div className="px-4 py-4">
      <PagePlaceholder
        kind="billing"
        title={kept > 0 ? t("frozen.kept", { credits: formatAmount(kept) }) : t("noSubscription.title")}
        description={description}
        action={
          <Link href={`/${workspaceSlug}/payment/plans`}>
            <span className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition hover:opacity-90">
              <Wallet className="h-3.5 w-3.5" />
              {t("noSubscription.choosePlan")}
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
  const t = useTranslations("settingsBilling");
  return (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <Card className="max-w-md rounded-[14px] border-border bg-surface-1 p-6 text-center shadow-none">
        <CardHeader className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <WarningCircle className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-bold">{t("errorState.title")}</CardTitle>
          <CardDescription className="text-xs">
            {t("errorState.description", { message })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-white transition duration-150 hover:bg-primary-hover"
          >
            <ArrowClockwise className="h-3.5 w-3.5" />
            <span>{t("errorState.retry")}</span>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
