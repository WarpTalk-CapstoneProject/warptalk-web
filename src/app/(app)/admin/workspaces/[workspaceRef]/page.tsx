"use client";

import {
  ArrowLeft,
  ArrowsClockwise,
  CaretDown,
  CurrencyCircleDollar,
  DownloadSimple,
  Gift,
  HourglassMedium,
  Info,
  Megaphone,
  NotePencil,
  PlusMinus,
  Prohibit,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  Swap,
  Trash,
  UserSwitch,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { WorkspaceContractBilling } from "@/components/admin/workspace-contract-billing";
import { CreditBurnChart } from "@/components/admin/workspace-detail/credit-burn-chart";
import {
  WorkspaceActionDialogs,
  type OpenWorkspaceAction,
} from "@/components/admin/workspace-detail/workspace-action-dialogs";
import { WorkspaceTimeline } from "@/components/admin/workspace-detail/workspace-timeline";
import {
  WorkspaceLifecycleDialog,
  type WorkspaceLifecycleAction,
} from "@/components/admin/WorkspaceLifecycleDialog";
import { WorkspaceStatusBadge } from "@/components/admin/WorkspaceStatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdminWorkspaceBillingOverview,
  useAdminWorkspaceMeetingTotals,
} from "@/hooks/use-admin-workspace-actions";
import {
  useAdminWorkspaceAnalytics,
  useAdminWorkspaceCreditTransactions,
  useAdminWorkspaceByRef,
  useAdminWorkspaceMembers,
  useDeleteAdminWorkspace,
  useReactivateAdminWorkspace,
  useSuspendAdminWorkspace,
} from "@/hooks/use-admin-workspaces";
import { marginTone, transferCandidates } from "@/lib/admin/workspace-actions";
import { workspaceRefKind } from "@/lib/admin/workspace-ref";
import { getErrorMessage } from "@/lib/api/errors";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import { cn } from "@/lib/utils";
import type { AdminWorkspaceDetailDto, AdminWorkspaceMemberDto } from "@/types/admin-workspace";
import type {
  AdminWorkspaceBillingOverviewDto,
  AdminWorkspaceMoneyDto,
} from "@/types/admin-workspace-actions";

const numberFormatter = new Intl.NumberFormat("en-US");
const hoursFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

/** A server money figure: "—" when it could not be computed, never a fabricated 0. */
function money(value: AdminWorkspaceMoneyDto | undefined | null) {
  if (!value || value.amount === null) return "—";
  return formatAdminMoney({ amount: value.amount, currency: value.currency });
}

type Tone = "neutral" | "good" | "bad" | "warn";

const TONE_VALUE: Record<Tone, string> = {
  neutral: "text-ink",
  good: "text-emerald-700 dark:text-emerald-300",
  bad: "text-destructive",
  warn: "text-amber-700 dark:text-amber-300",
};

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  title,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  /** The server's note behind a figure, as a hover explanation. */
  title?: string | null;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear" title={title ?? undefined}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{label}</p>
      <p className={cn("mt-2 text-xl font-semibold tabular-nums", TONE_VALUE[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline/60 py-2.5 last:border-b-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-right text-[13px] text-ink">{value}</span>
    </div>
  );
}

function Card({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-1.5">{action}</div> : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function TabState({
  isError,
  isPending,
  isEmpty,
  errorText,
  emptyText,
  onRetry,
  children,
}: {
  isError: boolean;
  isPending: boolean;
  isEmpty: boolean;
  errorText: string;
  emptyText: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("adminWorkspaces.detail");
  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-10 text-sm shadow-linear">
        <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{errorText}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            {t("tryAgain")}
          </Button>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="grid place-items-center rounded-xl border border-hairline bg-surface-1 px-6 py-14 text-center shadow-linear">
        <div className="max-w-md">
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
            <Info size={20} weight="duotone" />
          </span>
          <p className="mt-3 text-sm text-ink-muted">{emptyText}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


/**
 * The decision numbers, OpenBoox-customer-360 style: what this tenant has paid, what it holds,
 * what it owes, what it uses, and whether it makes or loses money. Each figure is the server's;
 * a null is "—" with the server's note on hover, never a 0.
 */
function KpiStrip({
  workspace,
  overview,
  meetingsHeld,
  hoursHeld,
}: {
  workspace: AdminWorkspaceDetailDto;
  overview: AdminWorkspaceBillingOverviewDto | undefined;
  meetingsHeld: number | null;
  hoursHeld: number | null;
}) {
  const t = useTranslations("adminWorkspaces.detail.kpis");
  const subscription = overview?.subscription ?? null;
  const tone = overview ? marginTone(overview.grossMarginInPeriod) : "unknown";

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label={t("revenue")}
        value={money(overview?.revenueLifetime)}
        hint={overview ? t("revenueHint", { period: money(overview.revenueInPeriod), payments: overview.paymentsLifetime }) : undefined}
        title={overview?.revenueLifetime.note}
      />
      <Stat
        label={t("credits")}
        value={subscription ? numberFormatter.format(subscription.creditsRemaining) : "—"}
        hint={
          subscription
            ? t("creditsHint", {
                used: numberFormatter.format(subscription.creditsUsedThisCycle),
                perCycle: numberFormatter.format(subscription.creditsPerCycle),
              })
            : t("noSubscription")
        }
        tone={subscription && subscription.creditsRemaining <= 0 ? "bad" : "neutral"}
      />
      <Stat
        label={t("plan")}
        value={subscription?.planName ?? "—"}
        hint={
          subscription
            ? subscription.isTrial && subscription.trialEndsAt
              ? t("trialEnds", { date: formatDate(subscription.trialEndsAt) })
              : t("periodEnds", { status: subscription.status, date: formatDate(subscription.currentPeriodEnd) })
            : t("noSubscription")
        }
        tone={subscription?.serviceState === "suspended" ? "bad" : subscription?.isTrial ? "warn" : "neutral"}
      />
      <Stat
        label={t("invoices")}
        value={overview ? numberFormatter.format(overview.invoices.open) : "—"}
        hint={
          overview
            ? t("invoicesHint", { outstanding: money(overview.invoices.outstanding), overdue: overview.invoices.overdue })
            : undefined
        }
        tone={overview && overview.invoices.overdue > 0 ? "bad" : "neutral"}
      />
      <Stat
        label={t("members")}
        value={numberFormatter.format(workspace.memberCount)}
        hint={t("membersHint", { internal: workspace.internalMemberCount, external: workspace.externalMemberCount })}
      />
      <Stat
        label={t("meetings")}
        value={meetingsHeld === null ? "—" : numberFormatter.format(meetingsHeld)}
        hint={hoursHeld === null ? t("last30Days") : t("meetingsHint", { hours: hoursFormatter.format(hoursHeld) })}
      />
      <Stat
        label={t("aiCost")}
        value={money(overview?.aiProviderCostInPeriod)}
        hint={t("last30Days")}
        title={overview?.aiProviderCostInPeriod.note}
      />
      <Stat
        label={t("profit")}
        value={money(overview?.grossMarginInPeriod)}
        hint={t("profitHint")}
        tone={tone === "profit" ? "good" : tone === "loss" ? "bad" : "neutral"}
        title={overview?.grossMarginInPeriod.note}
      />
    </div>
  );
}

function OverviewTab({
  workspace,
  overview,
  overviewError,
  onAction,
}: {
  workspace: AdminWorkspaceDetailDto;
  overview: AdminWorkspaceBillingOverviewDto | undefined;
  overviewError: boolean;
  onAction: (action: OpenWorkspaceAction) => void;
}) {
  const t = useTranslations("adminWorkspaces.detail.overview");
  const subscription = overview?.subscription ?? null;

  return (
    <div className="space-y-4">
      {overviewError ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm">
          <WarningCircle size={18} weight="duotone" className="shrink-0 text-amber-600" />
          {t("billingUnavailable")}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title={t("subscriptionHeading")}
          subtitle={subscription ? t("subscriptionSubtitle", { plan: subscription.planName, cycle: subscription.billingCycle }) : t("noSubscription")}
          action={
            subscription ? (
              <>
                <Button variant="outline" size="sm" onClick={() => onAction({ id: "changePlan" })}>
                  <Swap size={13} />
                  {t("changePlan")}
                </Button>
                {subscription.isTrial ? (
                  <Button variant="outline" size="sm" onClick={() => onAction({ id: "extendTrial" })}>
                    <HourglassMedium size={13} />
                    {t("extendTrial")}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => onAction({ id: "compPeriod" })}>
                    <Gift size={13} />
                    {t("comp")}
                  </Button>
                )}
              </>
            ) : null
          }
        >
          {subscription ? (
            <>
              <Field label={t("status")} value={`${subscription.status} · ${subscription.serviceState}`} />
              {subscription.suspendedReason ? <Field label={t("suspendedReason")} value={subscription.suspendedReason} /> : null}
              <Field
                label={t("period")}
                value={`${formatDate(subscription.currentPeriodStart)} → ${formatDate(subscription.currentPeriodEnd)}`}
              />
              {subscription.trialEndsAt ? <Field label={t("trialEnds")} value={formatDate(subscription.trialEndsAt)} /> : null}
              <Field label={t("autoRenew")} value={subscription.autoRenew ? t("yes") : t("no")} />
              <Field label={t("creditsPerCycle")} value={numberFormatter.format(subscription.creditsPerCycle)} />
            </>
          ) : (
            <p className="py-4 text-[13px] text-ink-muted">{t("noSubscription")}</p>
          )}
        </Card>

        <Card title={t("pnlHeading")} subtitle={t("pnlSubtitle")}>
          <Field label={t("revenuePeriod")} value={money(overview?.revenueInPeriod)} />
          <Field label={t("aiCostPeriod")} value={money(overview?.aiProviderCostInPeriod)} />
          <Field
            label={t("margin")}
            value={
              <span className={cn("font-semibold", overview && marginTone(overview.grossMarginInPeriod) === "loss" && "text-destructive")}>
                {money(overview?.grossMarginInPeriod)}
              </span>
            }
          />
          <Field label={t("revenueLifetime")} value={money(overview?.revenueLifetime)} />
          {[overview?.revenueInPeriod.note, overview?.aiProviderCostInPeriod.note, overview?.grossMarginInPeriod.note]
            .filter(Boolean)
            .map((note) => (
              <p key={note} className="mt-2 text-[11px] leading-4 text-ink-subtle">
                {note}
              </p>
            ))}
        </Card>

        <Card
          title={t("entitlementsHeading")}
          subtitle={t("entitlementsSubtitle")}
          action={
            subscription ? (
              <Button variant="outline" size="sm" onClick={() => onAction({ id: "entitlements" })}>
                <SlidersHorizontal size={13} />
                {t("editOverrides")}
              </Button>
            ) : null
          }
        >
          {(overview?.entitlements ?? []).map((entitlement) => (
            <Field
              key={entitlement.key}
              label={entitlement.key}
              value={
                <span>
                  {entitlement.value}
                  <span className="ml-1.5 text-[11px] text-ink-subtle">
                    {entitlement.contractOverride !== null ? t("overridden") : entitlement.source}
                  </span>
                </span>
              }
            />
          ))}
          {!overview ? <p className="py-4 text-[13px] text-ink-muted">—</p> : null}
        </Card>
      </div>

      <Card
        title={t("burnHeading")}
        subtitle={t("burnSubtitle")}
        action={
          <Button variant="outline" size="sm" onClick={() => onAction({ id: "adjustCredits" })} disabled={!subscription}>
            <PlusMinus size={13} />
            {t("adjustCredits")}
          </Button>
        }
      >
        <CreditBurnChart points={overview?.burn ?? []} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("recordHeading")}>
          <Field label={t("slug")} value={<span className="font-mono text-xs">{workspace.slug}</span>} />
          <Field
            label={t("owner")}
            value={
              workspace.owner.resolved ? (
                <span>
                  {workspace.owner.fullName}
                  <span className="block text-xs text-ink-muted">{workspace.owner.email}</span>
                </span>
              ) : (
                <span className="text-xs italic text-ink-subtle">{t("ownerUnavailable", { id: workspace.owner.id })}</span>
              )
            }
          />
          <Field label={t("created")} value={formatDateTime(workspace.createdAt)} />
          <Field label={t("lastUpdated")} value={formatDateTime(workspace.updatedAt)} />
          <Field label={t("lastActivity")} value={formatDateTime(workspace.lastActivityAt)} />
          {workspace.deletedAt ? <Field label={t("deleted")} value={formatDateTime(workspace.deletedAt)} /> : null}
          <Field label={t("pendingInvitations")} value={numberFormatter.format(workspace.pendingInvitationCount)} />
          <Field label={t("documents")} value={numberFormatter.format(workspace.documentCount)} />
        </Card>

        <Card title={t("policyHeading")}>
          <Field
            label={t("externalCollaboration")}
            value={workspace.allowExternalCollaboration ? t("allowed") : t("blocked")}
          />
          <Field
            label={t("verifiedDomainRequired")}
            value={workspace.requireVerifiedDomainForInternal ? t("required") : t("notRequired")}
          />
          <Field label={t("verifiedDomains")} value={numberFormatter.format(workspace.verifiedDomainCount)} />
          <p className="mt-3 text-xs leading-5 text-ink-muted">{t("policyNote")}</p>
        </Card>
      </div>
    </div>
  );
}

/**
 * The roster: membership facts only, with the two per-member actions an operator needs — end a
 * member's sessions, or hand them the workspace. The Knowledge tab that used to sit here is gone on
 * purpose: what a workspace has indexed is tenant content, and the admin portal reads a
 * workspace's operational facts, never its content.
 */
function MembersTab({
  workspaceId,
  deleted,
  onAction,
}: {
  workspaceId: string;
  deleted: boolean;
  onAction: (action: OpenWorkspaceAction) => void;
}) {
  const t = useTranslations("adminWorkspaces.detail.members");
  const membersQuery = useAdminWorkspaceMembers(workspaceId);
  const members = membersQuery.data ?? [];
  const candidates = new Set(transferCandidates(members).map((m) => m.userId));

  return (
    <TabState
      isError={membersQuery.isError}
      isPending={membersQuery.isPending}
      isEmpty={members.length === 0}
      errorText={t("errorText")}
      emptyText={t("emptyText")}
      onRetry={() => void membersQuery.refetch()}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">{t("count", { count: members.length })}</p>
        {!deleted ? (
          <Button variant="outline" size="sm" onClick={() => onAction({ id: "signOutAll" })}>
            <SignOut size={13} />
            {t("signOutAll")}
          </Button>
        ) : null}
      </div>
      <ol className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
        {members.map((member: AdminWorkspaceMemberDto) => (
          <li
            key={member.userId}
            className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-[11px] font-semibold uppercase text-ink-muted">
                {(member.fullName ?? "?").slice(0, 2)}
              </span>
              <div className="min-w-0">
                {member.resolved ? (
                  <>
                    <p className="truncate text-[13px] font-medium text-ink">{member.fullName}</p>
                    <p className="truncate text-[11px] text-ink-subtle">{member.email}</p>
                  </>
                ) : (
                  <p className="truncate text-xs italic text-ink-subtle">{t("unavailable", { id: member.userId })}</p>
                )}
              </div>
            </div>
            <div className="w-[110px] shrink-0">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                  member.role.toLowerCase() === "owner"
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-border bg-surface-2 text-ink-muted",
                )}
              >
                {member.role}
              </span>
            </div>
            <div className="w-[100px] shrink-0 text-[12px] capitalize text-ink-muted">{member.membershipType}</div>
            <div className="w-[150px] shrink-0 text-[12px] text-ink-muted md:text-right">
              {t("joined", { date: formatDateTime(member.joinedAt) })}
            </div>
            {!deleted ? (
              <div className="flex shrink-0 gap-1.5 md:ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction({ id: "signOutMember", memberId: member.userId })}
                  title={t("signOut")}
                >
                  <SignOut size={13} />
                  <span className="sr-only md:not-sr-only">{t("signOut")}</span>
                </Button>
                {candidates.has(member.userId) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction({ id: "transferOwnership", memberId: member.userId })}
                    title={t("makeOwner")}
                  >
                    <UserSwitch size={13} />
                    <span className="sr-only md:not-sr-only">{t("makeOwner")}</span>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </TabState>
  );
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Billing-side usage for the last 30 days: totals, a daily bar strip, and the feature split. */
function UsageTab({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("adminWorkspaces.detail.usage");
  const analyticsQuery = useAdminWorkspaceAnalytics(workspaceId);
  const analytics = analyticsQuery.data;
  const maxDaily = Math.max(1, ...(analytics?.consumptionSeries ?? []).map((p) => p.creditsConsumed));

  return (
    <TabState
      isError={analyticsQuery.isError}
      isPending={analyticsQuery.isPending}
      isEmpty={!analytics}
      errorText={t("errorText")}
      emptyText={t("emptyText")}
      onRetry={() => void analyticsQuery.refetch()}
    >
      {analytics ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label={t("creditsConsumed")}
              value={numberFormatter.format(analytics.creditsConsumedInPeriod)}
              hint={t("last30Days")}
            />
            <Stat
              label={t("creditsToppedUp")}
              value={numberFormatter.format(analytics.creditsToppedUpInPeriod)}
              hint={t("last30Days")}
            />
            <Stat
              label={t("meetingsWithBillableUsage")}
              value={numberFormatter.format(analytics.meetingsWithBillableUsage)}
              hint={t("meetingsHint")}
            />
            <Stat
              label={t("membersBilled")}
              value={numberFormatter.format(analytics.distinctUsersBilled)}
              hint={t("membersBilledHint")}
            />
          </div>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
            <h2 className="text-sm font-semibold text-ink">{t("dailyConsumption")}</h2>
            {analytics.consumptionSeries.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">{t("noBillableUsage")}</p>
            ) : (
              <div className="mt-4 flex h-28 items-end gap-[3px]">
                {analytics.consumptionSeries.map((point) => (
                  <div
                    key={point.date}
                    className="group relative flex-1"
                    title={t("tooltip", {
                      date: shortDate.format(new Date(point.date)),
                      credits: numberFormatter.format(point.creditsConsumed),
                      events: point.events,
                    })}
                  >
                    <div
                      className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
                      style={{
                        height: `${Math.max(2, (point.creditsConsumed / maxDaily) * 100)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
            <div className="border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">{t("byService")}</h2>
            </div>
            {analytics.featureBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-xs text-ink-muted">{t("nothingBilled")}</p>
            ) : (
              <ol>
                {analytics.featureBreakdown.map((feature) => (
                  <li
                    key={feature.usageType}
                    className="flex items-center gap-4 border-b border-hairline/60 px-4 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                      {feature.usageType}
                    </span>
                    <span className="w-[90px] shrink-0 text-right text-[12px] tabular-nums text-ink-muted">
                      {t("events", { count: numberFormatter.format(feature.events) })}
                    </span>
                    <span className="w-[110px] shrink-0 text-right text-[13px] font-medium tabular-nums text-ink">
                      {t("credits", { count: numberFormatter.format(feature.creditsConsumed) })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </TabState>
  );
}

/**
 * Credit position and the ledger, with the Adjust Credits door pinned to THIS workspace — and the
 * contract and its invoices, for customers who pay by bank transfer.
 */

/**
 * Credit position and the ledger, with Adjust Credits pinned to THIS workspace — and the contract
 * and its invoices, for customers who pay by bank transfer. Every adjustment appears in the ledger
 * below the moment it is saved, and in the Timeline tab with its reason.
 */
function BillingTab({
  workspace,
  onAction,
}: {
  workspace: AdminWorkspaceDetailDto;
  onAction: (action: OpenWorkspaceAction) => void;
}) {
  const t = useTranslations("adminWorkspaces.detail.billing");
  const workspaceId = workspace.id;
  const analyticsQuery = useAdminWorkspaceAnalytics(workspaceId);
  const [page, setPage] = useState(1);
  const transactionsQuery = useAdminWorkspaceCreditTransactions(workspaceId, page);

  const credits = analyticsQuery.data?.credits;
  const transactions = transactionsQuery.data?.items ?? [];
  const total = transactionsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      {credits && !credits.subscriptionFound ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm">
          <WarningCircle size={18} weight="duotone" className="shrink-0 text-amber-600" />
          {t("noSubscription")}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("creditsRemaining")}
          value={credits?.creditsRemaining == null ? "—" : numberFormatter.format(credits.creditsRemaining)}
        />
        <Stat
          label={t("usedThisCycle")}
          value={credits?.creditsUsedThisCycle == null ? "—" : numberFormatter.format(credits.creditsUsedThisCycle)}
        />
        <Stat label={t("cycleEnds")} value={credits?.currentPeriodEnd ? formatDateTime(credits.currentPeriodEnd) : "—"} />
        <div className="flex items-center justify-center rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          {/* Pinned to this workspace: no picker, no chance of adjusting the wrong tenant. */}
          <Button onClick={() => onAction({ id: "adjustCredits" })} disabled={credits ? !credits.subscriptionFound : false}>
            <PlusMinus size={14} />
            {t("adjustCredits")}
          </Button>
        </div>
      </div>

      <WorkspaceContractBilling
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        ownerId={workspace.owner.id}
      />

      <TabState
        isError={transactionsQuery.isError}
        isPending={transactionsQuery.isPending}
        isEmpty={transactions.length === 0}
        errorText={t("errorText")}
        emptyText={t("emptyText")}
        onRetry={() => void transactionsQuery.refetch()}
      >
        <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
          <div className="border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">{t("ledgerHeading")}</h2>
          </div>
          <ol>
            {transactions.map((tx) => (
              <li key={tx.id} className="flex items-center gap-4 border-b border-hairline/60 px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">
                    <span className="font-medium capitalize">{tx.type}</span>
                    {tx.description ? <span className="ml-2 text-ink-muted">{tx.description}</span> : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-subtle">{formatDateTime(tx.createdAt)}</p>
                </div>
                <span
                  className={cn(
                    "w-[110px] shrink-0 text-right text-[13px] font-medium tabular-nums",
                    tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-ink",
                  )}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {numberFormatter.format(tx.amount)}
                </span>
                <span className="w-[110px] shrink-0 text-right text-[12px] tabular-nums text-ink-muted">
                  {numberFormatter.format(tx.balanceAfter)}
                </span>
              </li>
            ))}
          </ol>
        </section>
        {totalPages > 1 ? (
          <div className="flex items-center justify-between text-[13px] text-ink-muted">
            <span>{t("pageOf", { page, totalPages })}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("previous")}
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {t("next")}
              </Button>
            </div>
          </div>
        ) : null}
      </TabState>
    </div>
  );
}

/** Thirty days back from mount, to the minute — one stable window for the meeting totals. */
function useLast30Days() {
  const [window] = useState(() => {
    const to = new Date();
    to.setSeconds(0, 0);
    const from = new Date(to.getTime() - 30 * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  });
  return window;
}

export default function AdminWorkspaceDetailPage() {
  const t = useTranslations("adminWorkspaces.detail");
  const params = useParams();
  const router = useRouter();
  // WT-560: the URL names the workspace rather than carrying its primary key. It still accepts
  // an id, because the dashboard, the meetings table and the subscriptions table all link here
  // holding a workspaceId and no slug — see `workspace-ref`.
  const workspaceRef =
    typeof params?.workspaceRef === "string" ? params.workspaceRef : undefined;

  const detailQuery = useAdminWorkspaceByRef(workspaceRef);
  const workspace = detailQuery.data;

  // Everything below is addressed by the workspace's own id — never the URL's, which may be a slug.
  const overviewQuery = useAdminWorkspaceBillingOverview(workspace?.id);
  const window30 = useLast30Days();
  const meetingsQuery = useAdminWorkspaceMeetingTotals(workspace?.id, window30);
  const membersQuery = useAdminWorkspaceMembers(workspace?.id);
  const meetingsHeld = meetingsQuery.data?.metrics.find((m) => m.id === "meetingsHeld")?.value ?? null;
  const hoursHeld = meetingsQuery.data?.metrics.find((m) => m.id === "hoursTranslated")?.value ?? null;

  // Lifecycle actions are addressed by id, which is the workspace's own — never the URL's,
  // which may be a slug.
  const suspendMutation = useSuspendAdminWorkspace(workspace?.id ?? "");
  const reactivateMutation = useReactivateAdminWorkspace(workspace?.id ?? "");
  const deleteMutation = useDeleteAdminWorkspace(workspace?.id ?? "");

  // An id link resolves, then hands the address bar the workspace's name. `replace` rather than
  // `push` so Back leaves the portal instead of bouncing through the id form of the same page.
  useEffect(() => {
    if (!workspace) return;
    if (workspaceRefKind(workspaceRef) !== "id") return;
    router.replace(`/admin/workspaces/${workspace.slug}`);
  }, [workspace, workspaceRef, router]);

  const [tab, setTab] = useState("overview");
  const [openAction, setOpenAction] = useState<OpenWorkspaceAction | null>(null);
  const [dialogAction, setDialogAction] = useState<WorkspaceLifecycleAction | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const pending =
    suspendMutation.isPending || reactivateMutation.isPending || deleteMutation.isPending;

  const handleConfirm = async (reason: string) => {
    if (!dialogAction) return;
    setDialogError(null);
    const mutation =
      dialogAction === "suspend"
        ? suspendMutation
        : dialogAction === "delete"
          ? deleteMutation
          : reactivateMutation;
    try {
      await mutation.mutateAsync(reason);
      toast.success(
        dialogAction === "suspend"
          ? t("toasts.suspended")
          : dialogAction === "delete"
            ? t("toasts.deleted")
            : t("toasts.reactivated"),
      );
      setDialogAction(null);
    } catch (error) {
      setDialogError(
        getErrorMessage(
          error,
          dialogAction === "suspend"
            ? t("errors.suspend")
            : dialogAction === "delete"
              ? t("errors.delete")
              : t("errors.reactivate"),
        ),
      );
    }
  };

  const openLifecycle = (action: WorkspaceLifecycleAction) => {
    setDialogError(null);
    setDialogAction(action);
  };

  if (detailQuery.isError) {
    const notFound =
      (detailQuery.error as { response?: { status?: number } })?.response?.status === 404;
    return (
      <div className="min-h-full bg-panel px-6 py-10 text-ink">
        <div className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface-1 p-8 text-center shadow-linear">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <WarningCircle size={22} weight="duotone" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">
            {notFound ? t("notFoundTitle") : t("loadErrorTitle")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {notFound ? t("notFoundDescription") : t("loadErrorDescription")}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/admin/workspaces" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              {t("backToDirectoryButton")}
            </Link>
            {!notFound ? (
              <Button size="sm" onClick={() => void detailQuery.refetch()}>
                {t("tryAgain")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const deleted = workspace?.status === "deleted";
  const subscription = overviewQuery.data?.subscription ?? null;

  return (
    <div className="min-h-full bg-panel text-ink">
      <div className="mx-auto w-full max-w-[1480px] px-5 py-5 lg:px-7">
        <Link
          href="/admin/workspaces"
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} />
          {t("backToDirectory")}
        </Link>

        {detailQuery.isPending || !workspace ? (
          <div className="mt-4 space-y-4">
            <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <header className="mt-3 flex flex-col gap-4 border-b border-hairline pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-3 text-lg font-semibold text-ink">
                  {(workspace.name || "?").trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
                    <WorkspaceStatusBadge status={workspace.status} />
                    {subscription ? (
                      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {subscription.planName}
                        {subscription.isTrial ? ` · ${t("trialBadge")}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
                    <span className="font-mono text-ink-subtle">{workspace.slug}</span>
                    <span>
                      {t("ownerLine", {
                        owner: workspace.owner.resolved
                          ? `${workspace.owner.fullName} (${workspace.owner.email})`
                          : workspace.owner.id,
                      })}
                    </span>
                    <span>{t("createdLine", { date: formatDate(workspace.createdAt) })}</span>
                    <span>{t("activityLine", { date: formatDateTime(workspace.lastActivityAt) })}</span>
                  </div>
                  {workspace.currentSuspension ? (
                    <p className="mt-2 max-w-2xl rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      {t("suspendedNotice", {
                        date: formatDateTime(workspace.currentSuspension.performedAt),
                        reason: workspace.currentSuspension.reason,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void detailQuery.refetch();
                    void overviewQuery.refetch();
                  }}
                  disabled={detailQuery.isFetching}
                >
                  <ArrowsClockwise size={14} className={detailQuery.isFetching ? "animate-spin" : undefined} />
                  {t("refresh")}
                </Button>
                {deleted ? (
                  <span className="text-xs text-ink-subtle">{t("deletedCannotChange")}</span>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="sm" />}>
                    {t("actionsMenu")}
                    <CaretDown size={12} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[240px]">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t("menu.billing")}</DropdownMenuLabel>
                      <DropdownMenuItem disabled={!subscription} onClick={() => setOpenAction({ id: "adjustCredits" })}>
                        <PlusMinus size={14} />
                        {t("menu.adjustCredits")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!subscription} onClick={() => setOpenAction({ id: "changePlan" })}>
                        <Swap size={14} />
                        {t("menu.changePlan")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!subscription?.isTrial} onClick={() => setOpenAction({ id: "extendTrial" })}>
                        <HourglassMedium size={14} />
                        {t("menu.extendTrial")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!subscription || subscription.isTrial}
                        onClick={() => setOpenAction({ id: "compPeriod" })}
                      >
                        <Gift size={14} />
                        {t("menu.compPeriod")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!subscription} onClick={() => setOpenAction({ id: "entitlements" })}>
                        <SlidersHorizontal size={14} />
                        {t("menu.entitlements")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTab("billing")}>
                        <CurrencyCircleDollar size={14} />
                        {t("menu.invoices")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t("menu.account")}</DropdownMenuLabel>
                      <DropdownMenuItem disabled={deleted} onClick={() => setOpenAction({ id: "transferOwnership" })}>
                        <UserSwitch size={14} />
                        {t("menu.transferOwnership")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={deleted} onClick={() => setOpenAction({ id: "signOutAll" })}>
                        <SignOut size={14} />
                        {t("menu.signOutAll")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={deleted} onClick={() => setOpenAction({ id: "sendNotice" })}>
                        <Megaphone size={14} />
                        {t("menu.sendNotice")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t("menu.data")}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setOpenAction({ id: "exportSummary" })}>
                        <DownloadSimple size={14} />
                        {t("menu.exportSummary")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setOpenAction({ id: "addNote" })}>
                        <NotePencil size={14} />
                        {t("menu.addNote")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    {!deleted ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>{t("menu.lifecycle")}</DropdownMenuLabel>
                          {workspace.status === "active" ? (
                            <DropdownMenuItem onClick={() => openLifecycle("suspend")}>
                              <Prohibit size={14} />
                              {t("suspend")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => openLifecycle("reactivate")}>
                              <ShieldCheck size={14} />
                              {t("reactivate")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem variant="destructive" onClick={() => openLifecycle("delete")}>
                            <Trash size={14} />
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <KpiStrip
              workspace={workspace}
              overview={overviewQuery.data}
              meetingsHeld={meetingsHeld}
              hoursHeld={hoursHeld}
            />

            <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="mt-5">
              <TabsList>
                <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
                <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
                <TabsTrigger value="usage">{t("tabs.usage")}</TabsTrigger>
                <TabsTrigger value="billing">{t("tabs.billing")}</TabsTrigger>
                <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <OverviewTab
                  workspace={workspace}
                  overview={overviewQuery.data}
                  overviewError={overviewQuery.isError}
                  onAction={setOpenAction}
                />
              </TabsContent>

              <TabsContent value="members" className="mt-4">
                <MembersTab workspaceId={workspace.id} deleted={deleted} onAction={setOpenAction} />
              </TabsContent>

              <TabsContent value="usage" className="mt-4">
                <UsageTab workspaceId={workspace.id} />
              </TabsContent>

              <TabsContent value="billing" className="mt-4">
                <BillingTab workspace={workspace} onAction={setOpenAction} />
              </TabsContent>

              <TabsContent value="audit" className="mt-4">
                <WorkspaceTimeline workspaceId={workspace.id} onAddNote={() => setOpenAction({ id: "addNote" })} />
              </TabsContent>
            </Tabs>

            <WorkspaceActionDialogs
              action={openAction}
              onClose={() => setOpenAction(null)}
              workspace={workspace}
              overview={overviewQuery.data}
              members={membersQuery.data ?? []}
              meetings={meetingsQuery.data}
            />

            <WorkspaceLifecycleDialog
              open={dialogAction !== null}
              action={dialogAction ?? "suspend"}
              workspaceName={workspace.name}
              pending={pending}
              error={dialogError}
              onOpenChange={(open) => {
                if (!open) {
                  setDialogAction(null);
                  setDialogError(null);
                }
              }}
              onConfirm={handleConfirm}
            />
          </>
        )}
      </div>
    </div>
  );
}
