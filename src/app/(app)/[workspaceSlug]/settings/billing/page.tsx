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
 *   means. Then the two balances: credits remaining carries the meter (WT-878), and the plan cell
 *   carries the two buttons — Buy credits and Manage subscription, the latter owning every state
 *   change short of a purchase — so there is no separate "current plan" row. Then auto-renew as
 *   one line. Then the work zone: the plan ladder on the left, the Extras panel (credit packs and
 *   add-ons) on the right, both in the first screen instead of under a scroll. Below 1000px the
 *   zone is one pane at a time behind a two-way switch.
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
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useBillingRealtime } from "@/hooks/use-billing-realtime";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { canBuyExtraCredits } from "@/lib/billing/extra-credits";
import { formatAmount, formatMoney } from "@/lib/format/currency";
import { createHubConnection } from "@/lib/realtime/signalr";
import { cn } from "@/lib/utils";
import { normalizeWorkspaceSlug } from "@/lib/workspace/workspace-slug";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { BillingInterval } from "@/lib/billing/plan-pricing";
import type { FrozenCreditsDto, PlanDto, SubscriptionDto } from "@/types/billing";

import {
  BannerRow,
  BillingButton,
  Pill,
  StatCell,
} from "./components/billing-primitives";
import { CreditLevelPill, CreditMeter, creditLook } from "./components/credit-meter";
import { ManageSubscriptionModal } from "./components/manage-subscription-modal";
import { PlanGrid } from "./components/plan-grid";
import { TopUpModal } from "./components/top-up-modal";
import { AutoRenewRow, PaymentFailedBanner } from "./components/auto-renew-section";
import { CatalogSection, useHasCatalogExtras } from "./components/catalog-section";

/**
 * The billing API answers "this workspace has no plan" with an explicit error code rather than an
 * empty payload, on every endpoint that needs a subscription to compute anything. That is a
 * legitimate account state, not a broken request, and the two must not collapse into one UI.
 */
const NO_SUBSCRIPTION_CODE = "BILLING_SUBSCRIPTION_NOT_FOUND";

/** The Usage page's cadence: frequent enough to follow a meeting, rare enough for the gateway. */
const POLL_INTERVAL_MS = 30_000;

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

/**
 * How the current subscription is billed, or null when nothing says.
 *
 * Read in order of how directly the source answers: an explicit `billingCycle` on the
 * subscription (the type does not declare one yet, so it is read defensively), then the length of
 * the period it is actually paying for — a year-long period IS a yearly subscription whatever the
 * plan's own cycle says, because a monthly-priced plan can be bought yearly. The plan's own
 * cycle is deliberately NOT consulted: it describes how the plan is priced, not how it was bought.
 */
function subscriptionInterval(subscription: SubscriptionDto | null | undefined): BillingInterval | null {
  if (!subscription) return null;
  const declared = (subscription as { billingCycle?: string | null }).billingCycle?.toLowerCase();
  if (declared === "yearly" || declared === "year" || declared === "annual") return "yearly";
  if (declared === "monthly" || declared === "month") return "monthly";

  const start = Date.parse(subscription.currentPeriodStart);
  const end = Date.parse(subscription.currentPeriodEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const days = Math.round((end - start) / 86_400_000);
  if (days >= 360 && days <= 370) return "yearly";
  if (days >= 28 && days <= 31) return "monthly";
  return null;
}

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
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  /**
   * WT-878 — the workspace is the one in the URL, and the store only supplies its id.
   *
   * This used to take the id from the store and the slug from wherever it could find one. For
   * the moment between a workspace switch writing the store and the URL catching up (or the other
   * way round), every query and mutation below targeted the workspace the page was NOT showing —
   * Cancel renewal on the wrong workspace, a top-up credited elsewhere. The layout re-selects the
   * workspace for the URL slug; until the store says it has, the id here is empty (no query is
   * enabled on an empty id) and the page shows a spinner instead of rendering any control.
   */
  const urlSlug = normalizeWorkspaceSlug(slug);
  const storeMatchesUrl =
    !!urlSlug && !!activeWorkspaceId && activeWorkspaceSlug === urlSlug;
  const workspaceId = storeMatchesUrl ? (activeWorkspaceId ?? "") : "";
  const workspaceSlug = urlSlug ?? slug ?? "";
  const role = useWorkspaceRole();

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  // Below 1000px the plan ladder and the Extras panel take turns instead of sitting side by side.
  const [zoneTab, setZoneTab] = useState<"plans" | "extras">("plans");
  const hasExtras = useHasCatalogExtras(workspaceId);
  // Null until somebody picks; then it follows the subscription's own cycle, else monthly.
  const [pickedInterval, setPickedInterval] = useState<BillingInterval | null>(null);

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

  /**
   * WT-878 — freshness, the way Usage does it.
   *
   * The notification hub above only fires if the backend publishes `billing.credits_updated`,
   * which today nothing does, so the balance sat still until a reload. The billing hub
   * (`useBillingRealtime`) carries subscription, plan, payment and overage events and refreshes
   * everything; a 30s poll, only while the tab is visible, follows the numbers spending moves.
   *
   * The poll is narrower than Usage's on purpose: this page also mounts the recurring-billing
   * query, which reads the card from Stripe, and re-asking Stripe every half minute for a card
   * that does not change with spending is load for nothing.
   */
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["billing"] });
  }, [queryClient]);
  useBillingRealtime(refreshAll);

  useEffect(() => {
    if (!workspaceId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      for (const key of ["balance", "subscription", "overage", "frozen"]) {
        queryClient.invalidateQueries({ queryKey: ["billing", key, workspaceId] });
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [queryClient, workspaceId]);

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
  const currentInterval = subscriptionInterval(subscription);
  const interval: BillingInterval = pickedInterval ?? currentInterval ?? "monthly";

  // backend#467: the server refuses a top-up or pack without a live plan (409), so every way to
  // buy one is hidden in exactly that case. The same rule as the server's, not hasPaidEntitlement.
  const canBuyCredits = canBuyExtraCredits(subscription);

  const currentCredits = balance?.currentCredits ?? 0;
  const totalCredits = balance?.totalCredits ?? 0;
  // The server's own number, not `total - current`. They agree today, but only one of them stays
  // right if a top-up mid-cycle raises the total.
  const creditsUsed = balance?.creditsUsedThisCycle ?? 0;

  // WT-878: one rule for the number's tint, the meter and the label — the thresholds the layout's
  // low-credit banner already uses (this used to be a private "<= 15% left").
  const { level: creditLevel, look: creditLevelLook } = creditLook(balance);

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
    // `billingCycle` is the parameter lib/billing/plan-pricing's readBillingInterval reads.
    window.location.assign(
      `/${workspaceSlug}/payment/plans?plan=${plan.slug}&billingCycle=${interval}`,
    );
  };

  // A store that has not caught up with the URL is not an answer about this workspace.
  if (!role || !storeMatchesUrl) {
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
      {/* backend#466: a renewal charge failed — the plan runs until the grace ends. */}
      <PaymentFailedBanner workspaceId={workspaceId} />
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
          badge={<CreditLevelPill level={creditLevel} />}
          valueTone={creditLevelLook.valueTone}
          meter={
            balance ? (
              <CreditMeter balance={balance} overage={overage} overagesOn={overagesOn} />
            ) : undefined
          }
          lines={[
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
            currentInterval
              ? t(
                  currentInterval === "yearly"
                    ? "stats.currentPlan.billedYearly"
                    : "stats.currentPlan.billedMonthly",
                )
              : null,
            activePlan
              ? t("stats.currentPlan.limits", {
                  participants: activePlan.maxParticipants,
                  languages: activePlan.maxLanguages,
                })
              : t("stats.currentPlan.limitsUnavailable"),
            subscription?.cancelAtPeriodEnd
              ? t("stats.currentPlan.cancelled", { date: renewsDate })
              : t("stats.currentPlan.renews", { date: renewsDate }),
          ].filter((line): line is string => line !== null)}
          actions={
            <>
              {/* backend#467: extra credits are sold only on top of a live plan. */}
              {canBuyCredits ? (
                <BillingButton
                  tone="outline"
                  className="w-auto px-3.5"
                  onClick={() => setIsTopUpOpen(true)}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  {t("buyCredits")}
                </BillingButton>
              ) : null}
              <BillingButton
                tone="outline"
                className="w-auto px-3.5"
                onClick={() => setIsManageOpen(true)}
              >
                {t("manageSubscription")}
              </BillingButton>
            </>
          }
        />
      </div>

      {/* backend#466: auto-renew = the saved card is charged each cycle (Stripe). */}
      <AutoRenewRow workspaceId={workspaceId} plansHref={`/${workspaceSlug}/payment/plans`} />

      {canBuyCredits ? null : (
        <div className="border-b border-border px-4 py-3">
          <ExtraCreditsNeedPlan plansHref={`/${workspaceSlug}/payment/plans`} />
        </div>
      )}

      {/* The work zone: plans on the left, what else can be bought on the right. The switch only
          exists below 1000px, where the two can no longer sit side by side. */}
      {activePlans.length > 0 || hasExtras ? (
        <div className="min-w-0">
          {activePlans.length > 0 && hasExtras ? (
            <div className="border-b border-hairline px-4 py-2.5 min-[1000px]:hidden sm:px-6">
              <div
                role="group"
                aria-label={t("zone.ariaLabel")}
                className="inline-flex overflow-hidden rounded-[8px] border border-hairline bg-surface-1"
              >
                {(["plans", "extras"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={zoneTab === value}
                    onClick={() => setZoneTab(value)}
                    className={cn(
                      "h-7 cursor-pointer border-r border-hairline px-3 text-[12px] font-medium outline-none last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-safe:transition-colors motion-safe:duration-150",
                      zoneTab === value
                        ? "bg-surface-3 text-ink"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {t(`zone.${value}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div
            className={cn(
              "grid min-w-0",
              activePlans.length > 0 && hasExtras && "min-[1000px]:grid-cols-[minmax(0,1fr)_340px]",
            )}
          >
            {activePlans.length > 0 ? (
              <div className={cn("min-w-0", hasExtras && zoneTab === "extras" && "max-[999px]:hidden")}>
                <PlanGrid
                  plans={activePlans}
                  currentPlanId={subscription?.planId ?? null}
                  onSelect={goToCheckout}
                  interval={interval}
                  onIntervalChange={setPickedInterval}
                />
              </div>
            ) : null}
            {/* G11: the credit packs and add-ons this workspace may buy, priced by the server. */}
            {hasExtras ? (
              <aside
                className={cn(
                  "min-w-0 border-hairline",
                  activePlans.length > 0 && "min-[1000px]:border-l",
                  activePlans.length > 0 && zoneTab === "plans" && "max-[999px]:hidden",
                )}
              >
                <CatalogSection workspaceId={workspaceId} variant="panel" />
              </aside>
            ) : null}
          </div>
        </div>
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
