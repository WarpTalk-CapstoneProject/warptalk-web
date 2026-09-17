"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowsLeftRight,
  CreditCard,
  Prohibit,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import {
  SubscriptionLifecycleDialog,
  type SubscriptionLifecycleAction,
} from "@/components/admin/subscription-lifecycle-dialog";
import { ChangePlanDialog } from "@/components/admin/change-plan-dialog";
import {
  useAdminSubscriptionDirectory,
  useAdminSubscriptionSummary,
  useCancelAdminSubscription,
  useChangeAdminSubscriptionPlan,
  useReactivateAdminSubscription,
} from "@/hooks/use-admin-subscriptions";
import {
  formatMonthlyRecurring,
  formatSubscriptionValue,
} from "@/lib/billing/admin-money";
import {
  adminSubscriptionRowAction,
  isEndedSubscription,
} from "@/lib/billing/admin-subscription-actions";
import { cn } from "@/lib/utils";
import type {
  AdminSubscriptionSort,
  AdminSubscriptionStatusFilter,
  AdminSubscriptionSummaryDto,
} from "@/types/admin-subscription";

const PAGE_SIZE = 20;

const STATUS_VALUES = ["all", "active", "pending", "suspended", "cancelled", "expired"] as const;

const SORT_VALUES = [
  "period_end_asc",
  "period_end_desc",
  "credits_asc",
  "created_desc",
  "created_asc",
] as const;

const numberFormatter = new Intl.NumberFormat("en-US");

function isStatusFilter(value: string | null): value is AdminSubscriptionStatusFilter {
  return STATUS_VALUES.some((status) => status === value);
}

function isSort(value: string | null): value is AdminSubscriptionSort {
  return SORT_VALUES.some((option) => option === value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function SummaryTile({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="border-r border-border px-4 py-3.5 last:border-r-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-[21px] font-semibold leading-none tracking-tight tabular-nums",
          tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] text-ink-muted">{helper}</p>
    </div>
  );
}

function SubscriptionsDirectory() {
  const t = useTranslations("adminSubscriptions.page");
  const router = useRouter();
  const searchParams = useSearchParams();

  const STATUS_TABS = useMemo(
    () =>
      STATUS_VALUES.map((value) => ({
        value,
        label: t(`statusTabs.${value}`),
      })),
    [t],
  );

  const SORT_OPTIONS = useMemo(
    () => [
      { value: "period_end_asc" as const, label: t("sort.periodEndAsc") },
      { value: "period_end_desc" as const, label: t("sort.periodEndDesc") },
      { value: "credits_asc" as const, label: t("sort.creditsAsc") },
      { value: "created_desc" as const, label: t("sort.createdDesc") },
      { value: "created_asc" as const, label: t("sort.createdAsc") },
    ],
    [t],
  );

  const statusParam = searchParams.get("status");
  const sortParam = searchParams.get("sort");
  const status: AdminSubscriptionStatusFilter = isStatusFilter(statusParam) ? statusParam : "all";
  const sort: AdminSubscriptionSort = isSort(sortParam) ? sortParam : "period_end_asc";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/admin/subscriptions?${queryString}` : "/admin/subscriptions");
  };

  const query = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, status, sort }),
    [page, status, sort],
  );

  const directoryQuery = useAdminSubscriptionDirectory(query);
  const summaryQuery = useAdminSubscriptionSummary();
  const cancelSubscription = useCancelAdminSubscription();
  const reactivateSubscription = useReactivateAdminSubscription();
  const changePlan = useChangeAdminSubscriptionPlan();

  // The row and the verb travel together: the dialog's wording, its confirm label and the endpoint
  // it calls all follow from the action, and keeping them in one piece of state means they cannot
  // disagree with each other mid-animation as the dialog closes.
  const [pending, setPending] = useState<{
    subscription: AdminSubscriptionSummaryDto;
    action: SubscriptionLifecycleAction;
  } | null>(null);
  const [changingPlanFor, setChangingPlanFor] = useState<AdminSubscriptionSummaryDto | null>(null);

  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = summaryQuery.data;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<CreditCard size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void directoryQuery.refetch();
              void summaryQuery.refetch();
            }}
            disabled={directoryQuery.isFetching}
          >
            <ArrowsClockwise
              size={14}
              className={cn(directoryQuery.isFetching && "animate-spin")}
            />
            {t("refresh")}
          </Button>
        }
      />

      {summaryQuery.isError ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <WarningCircle size={18} weight="duotone" />
          {t("summaryError")}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface-1 lg:grid-cols-4">
          {/* Recurring revenue is a STRING, not a number, because it may be several: the server
              reports one amount per currency and refuses to add VND to USD. Rendering it as a
              single figure here would put back exactly the invention the API avoided. */}
          <SummaryTile
            label={t("summary.monthlyRecurring.label")}
            value={summary ? formatMonthlyRecurring(summary.monthlyRecurring) : "—"}
            helper={
              summary && summary.monthlyRecurring.length > 1
                ? t("summary.monthlyRecurring.helperMultiCurrency")
                : t("summary.monthlyRecurring.helperDefault")
            }
          />
          <SummaryTile
            label={t("summary.active.label")}
            value={summary ? numberFormatter.format(summary.activeCount) : "—"}
            helper={
              summary
                ? t("summary.active.helper", { count: numberFormatter.format(summary.trialCount) })
                : "—"
            }
          />
          <SummaryTile
            label={t("summary.endingWithin14Days.label")}
            value={summary ? numberFormatter.format(summary.endingWithin14Days) : "—"}
            helper={t("summary.endingWithin14Days.helper")}
          />
          <SummaryTile
            label={t("summary.pastDue.label")}
            value={summary ? numberFormatter.format(summary.pastDueCount) : "—"}
            helper={t("summary.pastDue.helper")}
            tone={summary && summary.pastDueCount > 0 ? "warning" : "neutral"}
          />
        </div>
      )}

      <AdminFilterTabs
        tabs={STATUS_TABS}
        value={status}
        onChange={(value) =>
          updateParams({ status: value === "all" ? undefined : value, page: undefined })
        }
        label={t("statusTabs.label")}
        trailing={
          directoryQuery.isPending ? t("loading") : t("subscriptionCount", { count: total })
        }
      />

      <div className="mt-4 flex justify-end">
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          {t("sort.label")}
          <select
            value={sort}
            onChange={(event) => updateParams({ sort: event.target.value, page: undefined })}
            className="h-9 rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AdminPanel className="mt-3">
        {directoryQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("errorState.title")}</p>
              <p className="mt-1 text-ink-muted">{t("errorState.description")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void directoryQuery.refetch()}
              >
                {t("errorState.retry")}
              </Button>
            </div>
          </div>
        ) : directoryQuery.isPending ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li
                key={index}
                className="flex items-center gap-4 border-b border-hairline/60 px-4 py-3 last:border-b-0"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-52 animate-pulse rounded bg-surface-2" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-surface-2" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="grid place-items-center px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                <CreditCard size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("emptyState.title")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("emptyState.description")}</p>
            </div>
          </div>
        ) : (
          <ul>
            {items.map((subscription) => (
              <li key={subscription.id}>
                <SubscriptionRow
                  subscription={subscription}
                  onAction={(target, action) => setPending({ subscription: target, action })}
                  onChangePlan={(target) => setChangingPlanFor(target)}
                />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <ChangePlanDialog
        subscription={changingPlanFor}
        onOpenChange={(open) => {
          if (!open) setChangingPlanFor(null);
        }}
        onSubmit={(planId) => {
          if (!changingPlanFor) return Promise.resolve();
          return changePlan.mutateAsync({
            workspaceId: changingPlanFor.workspaceId,
            planId,
          });
        }}
        isSaving={changePlan.isPending}
      />

      <SubscriptionLifecycleDialog
        subscription={pending?.subscription ?? null}
        action={pending?.action ?? "cancel"}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onSubmit={(reason) => {
          if (!pending) return Promise.resolve();
          return pending.action === "cancel"
            ? cancelSubscription.mutateAsync({
                workspaceId: pending.subscription.workspaceId,
                request: { reason: reason ?? "" },
              })
            : reactivateSubscription.mutateAsync({
                workspaceId: pending.subscription.workspaceId,
              });
        }}
        isSaving={cancelSubscription.isPending || reactivateSubscription.isPending}
      />

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
          <span>{t("pagination.pageOf", { page, totalPages })}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              {t("pagination.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {t("pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}

function SubscriptionRow({
  subscription,
  onAction,
  onChangePlan,
}: {
  subscription: AdminSubscriptionSummaryDto;
  onAction: (
    subscription: AdminSubscriptionSummaryDto,
    action: SubscriptionLifecycleAction,
  ) => void;
  onChangePlan: (subscription: AdminSubscriptionSummaryDto) => void;
}) {
  const t = useTranslations("adminSubscriptions.page");
  const isTrial =
    subscription.trialEndsAt != null && new Date(subscription.trialEndsAt) > new Date();
  // A paid cancellation leaves cancelledAt null (the row stays live until the period ends), so the
  // status is what says "cancelled" for the value column; cancelledAt alone only marks ended rows.
  const isCancelled = subscription.status === "cancelled" || subscription.cancelledAt != null;
  const lifecycleAction = adminSubscriptionRowAction(subscription);
  // Suspended service on a live subscription is the state the status column cannot show: the row
  // still says "active", because it is.
  const isPastDue =
    subscription.serviceState === "suspended" && subscription.suspendedReason === "invoice_overdue";

  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">
          {subscription.planName}
          <span className="ml-2 text-[11px] font-normal text-ink-subtle">
            {subscription.billingCycle}
          </span>
        </p>
        <Link
          href={`/admin/workspaces/${subscription.workspaceId}`}
          className="truncate font-mono text-[11px] text-ink-subtle transition-colors hover:text-ink"
        >
          {subscription.workspaceId.slice(0, 8)}…
        </Link>
      </div>

      <div className="flex w-[150px] shrink-0 flex-wrap items-center gap-1">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            subscription.status === "active"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : subscription.status === "cancelled" || subscription.status === "expired"
                ? "border-border bg-surface-2 text-ink-muted"
                : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          {t(`statusTabs.${subscription.status}`)}
        </span>
        {isPastDue ? (
          <span className="inline-flex items-center rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            {t("row.pastDue")}
          </span>
        ) : null}
      </div>

      {/* "In trial" and "Cancelled" rather than 0. A trial is worth its full price next week and a
          cancellation is worth nothing ever again — printing 0 for both merges two facts that read
          differently. */}
      <div className="w-[150px] shrink-0 text-[13px] tabular-nums text-ink md:text-right">
        {subscription.monthlyValue
          ? formatSubscriptionValue(subscription.monthlyValue, { isTrial, isCancelled })
          : isTrial
            ? t("row.value.trial")
            : isCancelled
              ? t("row.value.cancelled")
              : formatSubscriptionValue(subscription.monthlyValue, { isTrial, isCancelled })}
      </div>

      <div className="w-[110px] shrink-0 text-[13px] tabular-nums text-ink-muted md:text-right">
        {numberFormatter.format(subscription.creditsRemaining)}
      </div>

      <div className="w-[150px] shrink-0 text-[13px] text-ink-muted md:text-right">
        {formatDate(subscription.currentPeriodEnd)}
        {!subscription.autoRenew ? (
          <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            {t("row.noRenew")}
          </span>
        ) : null}
      </div>

      {/* One lifecycle action per row, chosen by what the endpoint would accept (see
          admin-subscription-actions.ts). A renewing row offers Cancel; a scheduled cancellation
          still inside its paid period offers Reactivate (`/reactivate`, never `/resume`, which
          lifts a service suspension); an ended row offers neither. */}
      <div className="flex w-[220px] shrink-0 justify-end gap-1.5 md:ml-3">
        {/* Change plan only where the endpoint would act: it looks for the ACTIVE subscription. */}
        {!isEndedSubscription(subscription) ? (
          <Button variant="outline" size="sm" onClick={() => onChangePlan(subscription)}>
            <ArrowsLeftRight size={13} />
            {t("row.changePlan")}
          </Button>
        ) : null}
        {lifecycleAction === "reactivate" ? (
          <Button variant="outline" size="sm" onClick={() => onAction(subscription, "reactivate")}>
            <ArrowCounterClockwise size={13} />
            {t("row.reactivate")}
          </Button>
        ) : lifecycleAction === "cancel" ? (
          <Button variant="outline" size="sm" onClick={() => onAction(subscription, "cancel")}>
            <Prohibit size={13} />
            {t("row.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminSubscriptionsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <SubscriptionsDirectory />
    </Suspense>
  );
}
