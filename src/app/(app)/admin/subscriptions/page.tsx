"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
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
import {
  useAdminSubscriptionDirectory,
  useAdminSubscriptionSummary,
  useCancelAdminSubscription,
  useResumeAdminSubscription,
} from "@/hooks/use-admin-subscriptions";
import {
  formatMonthlyRecurring,
  formatSubscriptionValue,
} from "@/lib/billing/admin-money";
import { cn } from "@/lib/utils";
import type {
  AdminSubscriptionSort,
  AdminSubscriptionStatusFilter,
  AdminSubscriptionSummaryDto,
} from "@/types/admin-subscription";

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
] as const;

const SORT_OPTIONS = [
  { value: "period_end_asc", label: "Renews soonest" },
  { value: "period_end_desc", label: "Renews latest" },
  { value: "credits_asc", label: "Fewest credits left" },
  { value: "created_desc", label: "Newest" },
  { value: "created_asc", label: "Oldest" },
] as const;

const numberFormatter = new Intl.NumberFormat("en-US");

function isStatusFilter(value: string | null): value is AdminSubscriptionStatusFilter {
  return STATUS_TABS.some((tab) => tab.value === value);
}

function isSort(value: string | null): value is AdminSubscriptionSort {
  return SORT_OPTIONS.some((option) => option.value === value);
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
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const resumeSubscription = useResumeAdminSubscription();

  // The row and the verb travel together: the dialog's wording, its confirm label and the endpoint
  // it calls all follow from the action, and keeping them in one piece of state means they cannot
  // disagree with each other mid-animation as the dialog closes.
  const [pending, setPending] = useState<{
    subscription: AdminSubscriptionSummaryDto;
    action: SubscriptionLifecycleAction;
  } | null>(null);

  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = summaryQuery.data;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Revenue"
        eyebrowIcon={<CreditCard size={14} weight="fill" />}
        title="Subscriptions"
        description="Every plan on the platform, what it is worth per month, and what runs out next."
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
            Refresh
          </Button>
        }
      />

      {summaryQuery.isError ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <WarningCircle size={18} weight="duotone" />
          Revenue totals could not be loaded. The directory below is unaffected.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface-1 lg:grid-cols-4">
          {/* Recurring revenue is a STRING, not a number, because it may be several: the server
              reports one amount per currency and refuses to add VND to USD. Rendering it as a
              single figure here would put back exactly the invention the API avoided. */}
          <SummaryTile
            label="Monthly recurring"
            value={summary ? formatMonthlyRecurring(summary.monthlyRecurring) : "—"}
            helper={
              summary && summary.monthlyRecurring.length > 1
                ? "Kept per currency — not converted"
                : "Excludes trials and cancellations"
            }
          />
          <SummaryTile
            label="Active"
            value={summary ? numberFormatter.format(summary.activeCount) : "—"}
            helper={summary ? `${numberFormatter.format(summary.trialCount)} still in trial` : "—"}
          />
          <SummaryTile
            label="Renewing in 14 days"
            value={summary ? numberFormatter.format(summary.endingWithin14Days) : "—"}
            helper="Renewals and expiries alike"
          />
          <SummaryTile
            label="Past due"
            value={summary ? numberFormatter.format(summary.pastDueCount) : "—"}
            helper="Service suspended on an overdue invoice"
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
        label="Subscription status"
        trailing={
          directoryQuery.isPending
            ? "Loading…"
            : `${numberFormatter.format(total)} subscription${total === 1 ? "" : "s"}`
        }
      />

      <div className="mt-4 flex justify-end">
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          Sort
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
              <p className="font-medium">Subscriptions could not be loaded.</p>
              <p className="mt-1 text-ink-muted">
                Check the billing service and that your session still holds the platform admin
                role.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void directoryQuery.refetch()}
              >
                Try again
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
              <p className="mt-3 text-sm font-medium">No subscriptions match this filter</p>
              <p className="mt-1 text-xs text-ink-muted">Pick a different status tab.</p>
            </div>
          </div>
        ) : (
          <ul>
            {items.map((subscription) => (
              <li key={subscription.id}>
                <SubscriptionRow
                  subscription={subscription}
                  onAction={(target, action) => setPending({ subscription: target, action })}
                />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <SubscriptionLifecycleDialog
        subscription={pending?.subscription ?? null}
        action={pending?.action ?? "cancel"}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onSubmit={(reason) => {
          if (!pending) return Promise.resolve();
          const request = { reason };
          return pending.action === "cancel"
            ? cancelSubscription.mutateAsync({
                workspaceId: pending.subscription.workspaceId,
                request,
              })
            : resumeSubscription.mutateAsync({
                workspaceId: pending.subscription.workspaceId,
                request,
              });
        }}
        isSaving={cancelSubscription.isPending || resumeSubscription.isPending}
      />

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next
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
}: {
  subscription: AdminSubscriptionSummaryDto;
  onAction: (
    subscription: AdminSubscriptionSummaryDto,
    action: SubscriptionLifecycleAction,
  ) => void;
}) {
  const isTrial =
    subscription.trialEndsAt != null && new Date(subscription.trialEndsAt) > new Date();
  const isCancelled = subscription.cancelledAt != null;
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
          {subscription.status}
        </span>
        {isPastDue ? (
          <span className="inline-flex items-center rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            past due
          </span>
        ) : null}
      </div>

      {/* "In trial" and "Cancelled" rather than 0. A trial is worth its full price next week and a
          cancellation is worth nothing ever again — printing 0 for both merges two facts that read
          differently. */}
      <div className="w-[150px] shrink-0 text-[13px] tabular-nums text-ink md:text-right">
        {formatSubscriptionValue(subscription.monthlyValue, { isTrial, isCancelled })}
      </div>

      <div className="w-[110px] shrink-0 text-[13px] tabular-nums text-ink-muted md:text-right">
        {numberFormatter.format(subscription.creditsRemaining)}
      </div>

      <div className="w-[150px] shrink-0 text-[13px] text-ink-muted md:text-right">
        {formatDate(subscription.currentPeriodEnd)}
        {!subscription.autoRenew ? (
          <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">no renew</span>
        ) : null}
      </div>

      {/* One action per row, chosen by where the subscription actually is. A cancelled row offers
          Resume and an active one offers Cancel; an expired one offers neither, because the
          endpoint would refuse — it looks for an ACTIVE subscription and answers 404 otherwise. */}
      <div className="w-[110px] shrink-0 md:ml-3 md:text-right">
        {isCancelled ? (
          <Button variant="outline" size="sm" onClick={() => onAction(subscription, "resume")}>
            <ArrowCounterClockwise size={13} />
            Resume
          </Button>
        ) : subscription.status === "expired" ? null : (
          <Button variant="outline" size="sm" onClick={() => onAction(subscription, "cancel")}>
            <Prohibit size={13} />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminSubscriptionsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-surface-1" />}>
      <SubscriptionsDirectory />
    </Suspense>
  );
}
