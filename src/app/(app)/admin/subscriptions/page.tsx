"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  ArrowsCounterClockwise,
  ArrowsLeftRight,
  Buildings,
  CalendarBlank,
  CreditCard,
  Gauge,
  Prohibit,
  Tag,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  AdminStatusTabs,
  resolveAdminWorkspaces,
  searchAdminWorkspaces,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import {
  SubscriptionLifecycleDialog,
  type SubscriptionLifecycleAction,
} from "@/components/admin/subscription-lifecycle-dialog";
import { ChangePlanDialog } from "@/components/admin/change-plan-dialog";
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import {
  useAdminSubscriptionDirectory,
  useAdminSubscriptionSummary,
  useCancelAdminSubscription,
  useChangeAdminSubscriptionPlan,
  useReactivateAdminSubscription,
} from "@/hooks/use-admin-subscriptions";
import {
  booleanValue,
  dateRangeBounds,
  dateRangeValue,
  entityValues,
  enumValue,
  type ListStateConfig,
} from "@/lib/admin/list-state";
import { formatMonthlyRecurring, formatSubscriptionValue } from "@/lib/billing/admin-money";
import {
  adminSubscriptionRowAction,
  isEndedSubscription,
} from "@/lib/billing/admin-subscription-actions";
import { cn } from "@/lib/utils";
import type {
  AdminSubscriptionDirectoryQuery,
  AdminSubscriptionServiceState,
  AdminSubscriptionSort,
  AdminSubscriptionStatusFilter,
  AdminSubscriptionSummaryDto,
} from "@/types/admin-subscription";

const PAGE_SIZE = 20;

const STATUS_VALUES = ["all", "active", "pending", "suspended", "cancelled", "expired"] as const;
const SERVICE_STATES: AdminSubscriptionServiceState[] = ["healthy", "low_balance", "in_overage", "suspended"];

/**
 * The directory's whole view in the URL. Every filter is server-side
 * (SubscriptionRepository.ApplyAdminFilters in billing); the page holds one page of rows.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", values: ["active", "pending", "suspended", "cancelled", "expired"] },
    // Plan slugs are the catalogue's, loaded after mount — an open set.
    { key: "plan", kind: "enum" },
    { key: "service", kind: "enum", values: SERVICE_STATES },
    { key: "cycle", kind: "enum", values: ["monthly", "yearly"] },
    { key: "autoRenew", kind: "boolean" },
    { key: "workspace", kind: "entity" },
    { key: "renews", kind: "dateRange" },
  ],
  sortFields: ["periodEnd", "created", "credits"],
  defaultSort: { field: "periodEnd", direction: "asc" },
  columns: [
    { id: "plan" },
    { id: "status" },
    { id: "value" },
    { id: "credits" },
    { id: "periodEnd" },
    { id: "actions" },
  ],
  groupings: ["status", "plan", "service"],
};

function apiSort(field: string, direction: "asc" | "desc"): AdminSubscriptionSort {
  if (field === "created") return direction === "asc" ? "created_asc" : "created_desc";
  if (field === "credits") return direction === "asc" ? "credits_asc" : "credits_desc";
  return direction === "asc" ? "period_end_asc" : "period_end_desc";
}

const numberFormatter = new Intl.NumberFormat("en-US");

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
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">{label}</p>
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
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;

  const status = (enumValue(state.filters, "status") ?? "all") as AdminSubscriptionStatusFilter;
  const planSlug = enumValue(state.filters, "plan");
  const serviceState = enumValue(state.filters, "service") as AdminSubscriptionServiceState | undefined;
  const billingCycle = enumValue(state.filters, "cycle") as "monthly" | "yearly" | undefined;
  const autoRenew = booleanValue(state.filters, "autoRenew");
  const workspaceId = entityValues(state.filters, "workspace")[0];
  const renewsRange = dateRangeValue(state.filters, "renews");
  const renews = dateRangeBounds(renewsRange ?? {});

  const query = useMemo<AdminSubscriptionDirectoryQuery>(
    () => ({
      page: state.page,
      pageSize: PAGE_SIZE,
      status,
      sort: apiSort(state.sort.field, state.sort.direction),
      planSlug,
      serviceState,
      billingCycle,
      autoRenew,
      workspaceId,
      periodEndFrom: renews.from,
      periodEndTo: renews.toExclusive,
    }),
    [
      state.page,
      status,
      state.sort.field,
      state.sort.direction,
      planSlug,
      serviceState,
      billingCycle,
      autoRenew,
      workspaceId,
      renews.from,
      renews.toExclusive,
    ],
  );

  const directoryQuery = useAdminSubscriptionDirectory(query);
  const summaryQuery = useAdminSubscriptionSummary();
  const plansQuery = useAdminPlans();
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

  const statusTabs = useMemo(
    () => STATUS_VALUES.map((value) => ({ value, label: t(`statusTabs.${value}`) })),
    [t],
  );

  const planOptions = useMemo(() => {
    const plans = plansQuery.data ?? [];
    const options = plans.map((plan) => ({ value: plan.slug, label: plan.name, hint: `${plan.slug} · ${plan.billingCycle}` }));
    if (planSlug && !options.some((option) => option.value === planSlug)) options.push({ value: planSlug, label: planSlug, hint: "" });
    return options;
  }, [plansQuery.data, planSlug]);

  const filterFields = useMemo<AdminFilterField[]>(
    () => [
      { key: "plan", label: t("filters.plan"), icon: <Tag size={13} />, kind: "enum", options: planOptions },
      {
        key: "service",
        label: t("filters.service"),
        icon: <Gauge size={13} />,
        kind: "enum",
        options: SERVICE_STATES.map((value) => ({ value, label: t(`filters.serviceStates.${value}`) })),
      },
      {
        key: "cycle",
        label: t("filters.cycle"),
        icon: <ArrowsCounterClockwise size={13} />,
        kind: "enum",
        options: [
          { value: "monthly", label: t("filters.cycles.monthly") },
          { value: "yearly", label: t("filters.cycles.yearly") },
        ],
      },
      {
        key: "autoRenew",
        label: t("filters.autoRenew"),
        icon: <ArrowsClockwise size={13} />,
        kind: "boolean",
        trueLabel: t("filters.renews"),
        falseLabel: t("filters.doesNotRenew"),
      },
      {
        key: "workspace",
        label: t("filters.workspace"),
        icon: <Buildings size={13} />,
        kind: "entity",
        placeholder: t("filters.workspacePlaceholder"),
        search: searchAdminWorkspaces,
        resolve: resolveAdminWorkspaces,
      },
      { key: "renews", label: t("filters.periodEnd"), icon: <CalendarBlank size={13} />, kind: "dateRange" },
    ],
    [planOptions, t],
  );

  const columns = useMemo<AdminColumn<AdminSubscriptionSummaryDto>[]>(
    () => [
      {
        id: "plan",
        header: t("columns.plan"),
        primary: true,
        cell: (subscription) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">
              {subscription.planName}
              <span className="ml-2 text-[11px] font-normal text-ink-subtle">{subscription.billingCycle}</span>
            </p>
            <Link
              href={`/admin/workspaces/${subscription.workspaceId}`}
              className="truncate font-mono text-[11px] text-ink-subtle transition-colors hover:text-ink"
            >
              {subscription.workspaceId.slice(0, 8)}…
            </Link>
          </div>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        className: "w-[160px]",
        cell: (subscription) => <StatusCell subscription={subscription} />,
      },
      {
        id: "value",
        header: t("columns.value"),
        align: "right",
        className: "w-[160px]",
        cell: (subscription) => <ValueCell subscription={subscription} />,
      },
      {
        id: "credits",
        header: t("columns.credits"),
        align: "right",
        className: "w-[120px]",
        sortField: "credits",
        defaultDirection: "asc",
        cell: (subscription) => (
          <span className="text-ink-muted">{numberFormatter.format(subscription.creditsRemaining)}</span>
        ),
      },
      {
        id: "periodEnd",
        header: t("columns.periodEnd"),
        align: "right",
        className: "w-[160px]",
        sortField: "periodEnd",
        defaultDirection: "asc",
        cell: (subscription) => (
          <span className="text-ink-muted">
            {formatDate(subscription.currentPeriodEnd)}
            {!subscription.autoRenew ? (
              <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">{t("row.noRenew")}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        align: "right",
        className: "w-[240px]",
        cell: (subscription) => (
          <RowActions
            subscription={subscription}
            onAction={(target, action) => setPending({ subscription: target, action })}
            onChangePlan={(target) => setChangingPlanFor(target)}
          />
        ),
      },
    ],
    [t],
  );

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
            <ArrowsClockwise size={14} className={cn(directoryQuery.isFetching && "animate-spin")} />
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

      <AdminStatusTabs list={list} filterKey="status" tabs={statusTabs} label={t("statusTabs.label")} />

      <AdminListToolbar
        list={list}
        filters={filterFields}
        count={directoryQuery.isPending ? null : total}
        countLabel={t("subscriptionCount", { count: total })}
        isFetching={directoryQuery.isFetching && !directoryQuery.isPending}
        display={{
          sortOptions: [
            { field: "periodEnd", label: t("sortFields.periodEnd") },
            { field: "created", label: t("sortFields.created") },
            { field: "credits", label: t("sortFields.credits") },
          ],
          groupOptions: [
            { key: "status", label: t("columns.status") },
            { key: "plan", label: t("columns.plan") },
            { key: "service", label: t("filters.service") },
          ],
          columns: columns
            .filter((column) => !column.primary && column.id !== "actions")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={items}
          rowKey={(subscription) => subscription.id}
          isPending={directoryQuery.isPending}
          isError={directoryQuery.isError}
          onRetry={() => void directoryQuery.refetch()}
          empty={{
            title: t("emptyState.title"),
            description: t("emptyState.description"),
            icon: <CreditCard size={20} weight="duotone" />,
          }}
          groupings={{
            status: {
              keyOf: (subscription) => subscription.status,
              label: (key) => t(`statusTabs.${key}`),
              order: ["active", "pending", "suspended", "cancelled", "expired"],
            },
            plan: { keyOf: (subscription) => subscription.planName, label: (key) => key },
            service: {
              keyOf: (subscription) => subscription.serviceState,
              label: (key) =>
                (SERVICE_STATES as string[]).includes(key) ? t(`filters.serviceStates.${key}`) : key,
              order: SERVICE_STATES,
            },
          }}
          pagination={{ page: state.page, pageCount: totalPages, total, pageSize: PAGE_SIZE }}
          caption={t("title")}
          minWidth={1000}
        />
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
    </AdminPage>
  );
}

function StatusCell({ subscription }: { subscription: AdminSubscriptionSummaryDto }) {
  const t = useTranslations("adminSubscriptions.page");
  // Suspended service on a live subscription is the state the status column cannot show: the row
  // still says "active", because it is.
  const isPastDue =
    subscription.serviceState === "suspended" && subscription.suspendedReason === "invoice_overdue";
  return (
    <div className="flex flex-wrap items-center gap-1">
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
  );
}

/**
 * "In trial" and "Cancelled" rather than 0. A trial is worth its full price next week and a
 * cancellation is worth nothing ever again — printing 0 for both merges two facts that read
 * differently.
 */
function ValueCell({ subscription }: { subscription: AdminSubscriptionSummaryDto }) {
  const t = useTranslations("adminSubscriptions.page");
  const isTrial = subscription.trialEndsAt != null && new Date(subscription.trialEndsAt) > new Date();
  // A paid cancellation leaves cancelledAt null (the row stays live until the period ends), so the
  // status is what says "cancelled" for the value column; cancelledAt alone only marks ended rows.
  const isCancelled = subscription.status === "cancelled" || subscription.cancelledAt != null;
  return (
    <span className="text-ink">
      {subscription.monthlyValue
        ? formatSubscriptionValue(subscription.monthlyValue, { isTrial, isCancelled })
        : isTrial
          ? t("row.value.trial")
          : isCancelled
            ? t("row.value.cancelled")
            : formatSubscriptionValue(subscription.monthlyValue, { isTrial, isCancelled })}
    </span>
  );
}

/**
 * One lifecycle action per row, chosen by what the endpoint would accept (see
 * admin-subscription-actions.ts). A renewing row offers Cancel; a scheduled cancellation still
 * inside its paid period offers Reactivate (`/reactivate`, never `/resume`, which lifts a service
 * suspension); an ended row offers neither.
 */
function RowActions({
  subscription,
  onAction,
  onChangePlan,
}: {
  subscription: AdminSubscriptionSummaryDto;
  onAction: (subscription: AdminSubscriptionSummaryDto, action: SubscriptionLifecycleAction) => void;
  onChangePlan: (subscription: AdminSubscriptionSummaryDto) => void;
}) {
  const t = useTranslations("adminSubscriptions.page");
  const lifecycleAction = adminSubscriptionRowAction(subscription);
  return (
    <div className="flex justify-end gap-1.5">
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
  );
}

export default function AdminSubscriptionsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <SubscriptionsDirectory />
    </Suspense>
  );
}
