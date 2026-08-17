"use client";

import {
  ArrowLeft,
  ArrowsClockwise,
  ClockCounterClockwise,
  Info,
  Prohibit,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AdjustCreditModal } from "@/components/admin/AdjustCreditModal";
import {
  WorkspaceLifecycleDialog,
  type WorkspaceLifecycleAction,
} from "@/components/admin/WorkspaceLifecycleDialog";
import { WorkspaceStatusBadge } from "@/components/admin/WorkspaceStatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdminWorkspaceAnalytics,
  useAdminWorkspaceCreditTransactions,
  useAdminWorkspaceDetail,
  useAdminWorkspaceMembers,
  useDeleteAdminWorkspace,
  useReactivateAdminWorkspace,
  useSuspendAdminWorkspace,
} from "@/hooks/use-admin-workspaces";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminWorkspaceDetailDto } from "@/types/admin-workspace";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-ink">{value}</p>
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
  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-10 text-sm shadow-linear">
        <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{errorText}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Try again
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

function OverviewTab({ workspace }: { workspace: AdminWorkspaceDetailDto }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Members"
          value={numberFormatter.format(workspace.memberCount)}
          hint={`${workspace.internalMemberCount} internal · ${workspace.externalMemberCount} external`}
        />
        <Stat
          label="Pending invitations"
          value={numberFormatter.format(workspace.pendingInvitationCount)}
          hint="Sent but not yet accepted"
        />
        <Stat
          label="Documents"
          value={numberFormatter.format(workspace.documentCount)}
          hint="Knowledge assets not deleted"
        />
        <Stat
          label="Verified domains"
          value={numberFormatter.format(workspace.verifiedDomainCount)}
          hint="Verified and not revoked"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          <h2 className="text-sm font-semibold text-ink">Workspace record</h2>
          <div className="mt-2">
            <Field label="Slug" value={<span className="font-mono text-xs">{workspace.slug}</span>} />
            <Field
              label="Owner"
              value={
                workspace.owner.resolved ? (
                  <span>
                    {workspace.owner.fullName}
                    <span className="block text-xs text-ink-muted">{workspace.owner.email}</span>
                  </span>
                ) : (
                  <span className="text-xs italic text-ink-subtle">
                    Unavailable ({workspace.owner.id})
                  </span>
                )
              }
            />
            <Field label="Created" value={formatDateTime(workspace.createdAt)} />
            <Field label="Last updated" value={formatDateTime(workspace.updatedAt)} />
            <Field
              label="Last activity"
              value={formatDateTime(workspace.lastActivityAt)}
            />
            {workspace.deletedAt ? (
              <Field label="Deleted" value={formatDateTime(workspace.deletedAt)} />
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          <h2 className="text-sm font-semibold text-ink">Tenancy policy</h2>
          <div className="mt-2">
            <Field
              label="External collaboration"
              value={workspace.allowExternalCollaboration ? "Allowed" : "Blocked"}
            />
            <Field
              label="Verified domain required for internal members"
              value={workspace.requireVerifiedDomainForInternal ? "Required" : "Not required"}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Last activity is the newest signal on the workspace record itself — member joins,
            document uploads, and settings changes. Meeting-level activity arrives with the
            per-workspace analytics API.
          </p>
        </section>
      </div>
    </div>
  );
}

function AuditTab({ workspace }: { workspace: AdminWorkspaceDetailDto }) {
  if (workspace.lifecycleHistory.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-hairline bg-surface-1 px-6 py-14 text-center shadow-linear">
        <div>
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
            <ClockCounterClockwise size={20} weight="duotone" />
          </span>
          <p className="mt-3 text-sm font-medium text-ink">No administrative actions yet</p>
          <p className="mt-1 text-xs text-ink-muted">
            Suspending or reactivating this workspace records an entry here permanently.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
      {workspace.lifecycleHistory.map((event) => (
        <li
          key={event.id}
          className="flex gap-3 border-b border-hairline/60 px-4 py-3 last:border-b-0"
        >
          <span
            className={
              event.action === "suspend"
                ? "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600"
                : event.action === "delete"
                  ? "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"
                  : "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"
            }
          >
            {event.action === "suspend" || event.action === "delete" ? (
              <Prohibit size={14} weight="duotone" />
            ) : (
              <ShieldCheck size={14} weight="duotone" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">
              {event.action === "suspend"
                ? "Suspended"
                : event.action === "delete"
                  ? "Deleted"
                  : "Reactivated"}
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-muted">{event.reason}</p>
            <p className="mt-1 font-mono text-[11px] text-ink-subtle">
              {formatDateTime(event.performedAt)} · admin {event.performedBy}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The roster: membership facts only. The Knowledge tab that used to sit here is gone on
 * purpose — what a workspace has indexed is tenant content, and the admin portal reads a
 * workspace's operational facts, never its content.
 */
function MembersTab({ workspaceId }: { workspaceId: string }) {
  const membersQuery = useAdminWorkspaceMembers(workspaceId);
  const members = membersQuery.data ?? [];

  return (
    <TabState
      isError={membersQuery.isError}
      isPending={membersQuery.isPending}
      isEmpty={members.length === 0}
      errorText="The member roster could not be loaded."
      emptyText="No active members. A deleted workspace keeps no memberships."
      onRetry={() => void membersQuery.refetch()}
    >
      <ol className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
        {members.map((member) => (
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
                  <p className="truncate text-xs italic text-ink-subtle">
                    Unavailable ({member.userId})
                  </p>
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
            <div className="w-[110px] shrink-0 text-[12px] capitalize text-ink-muted">
              {member.membershipType}
            </div>
            <div className="w-[150px] shrink-0 text-[12px] text-ink-muted md:text-right">
              joined {formatDateTime(member.joinedAt)}
            </div>
          </li>
        ))}
      </ol>
    </TabState>
  );
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Billing-side usage for the last 30 days: totals, a daily bar strip, and the feature split. */
function UsageTab({ workspaceId }: { workspaceId: string }) {
  const analyticsQuery = useAdminWorkspaceAnalytics(workspaceId);
  const analytics = analyticsQuery.data;
  const maxDaily = Math.max(1, ...(analytics?.consumptionSeries ?? []).map((p) => p.creditsConsumed));

  return (
    <TabState
      isError={analyticsQuery.isError}
      isPending={analyticsQuery.isPending}
      isEmpty={!analytics}
      errorText="Usage analytics could not be loaded."
      emptyText="No analytics available."
      onRetry={() => void analyticsQuery.refetch()}
    >
      {analytics ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Credits consumed"
              value={numberFormatter.format(analytics.creditsConsumedInPeriod)}
              hint="Last 30 days"
            />
            <Stat
              label="Credits topped up"
              value={numberFormatter.format(analytics.creditsToppedUpInPeriod)}
              hint="Last 30 days"
            />
            <Stat
              label="Meetings with billable usage"
              value={numberFormatter.format(analytics.meetingsWithBillableUsage)}
              hint="Rooms that produced a usage record"
            />
            <Stat
              label="Members billed"
              value={numberFormatter.format(analytics.distinctUsersBilled)}
              hint="Distinct accounts with usage"
            />
          </div>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
            <h2 className="text-sm font-semibold text-ink">Daily consumption</h2>
            {analytics.consumptionSeries.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">No billable usage in this window.</p>
            ) : (
              <div className="mt-4 flex h-28 items-end gap-[3px]">
                {analytics.consumptionSeries.map((point) => (
                  <div
                    key={point.date}
                    className="group relative flex-1"
                    title={`${shortDate.format(new Date(point.date))} · ${numberFormatter.format(point.creditsConsumed)} cr · ${point.events} events`}
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
              <h2 className="text-sm font-semibold text-ink">By service</h2>
            </div>
            {analytics.featureBreakdown.length === 0 ? (
              <p className="px-4 py-6 text-xs text-ink-muted">Nothing billed in this window.</p>
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
                      {numberFormatter.format(feature.events)} events
                    </span>
                    <span className="w-[110px] shrink-0 text-right text-[13px] font-medium tabular-nums text-ink">
                      {numberFormatter.format(feature.creditsConsumed)} cr
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

/** Credit position and the ledger, with the Adjust Credits door pinned to THIS workspace. */
function BillingTab({ workspaceId }: { workspaceId: string }) {
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
          This workspace has no billing subscription — it was never set up for billing.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Credits remaining"
          value={
            credits?.creditsRemaining == null
              ? "—"
              : numberFormatter.format(credits.creditsRemaining)
          }
        />
        <Stat
          label="Used this cycle"
          value={
            credits?.creditsUsedThisCycle == null
              ? "—"
              : numberFormatter.format(credits.creditsUsedThisCycle)
          }
        />
        <Stat
          label="Cycle ends"
          value={credits?.currentPeriodEnd ? formatDateTime(credits.currentPeriodEnd) : "—"}
        />
        <div className="flex items-center justify-center rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          {/* Pinned to this workspace: no picker, no chance of adjusting the wrong tenant. */}
          <AdjustCreditModal workspaceId={workspaceId} />
        </div>
      </div>

      <TabState
        isError={transactionsQuery.isError}
        isPending={transactionsQuery.isPending}
        isEmpty={transactions.length === 0}
        errorText="The credit ledger could not be loaded."
        emptyText="No credit transactions recorded for this workspace."
        onRetry={() => void transactionsQuery.refetch()}
      >
        <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
          <div className="border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Credit ledger</h2>
          </div>
          <ol>
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center gap-4 border-b border-hairline/60 px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">
                    <span className="font-medium capitalize">{tx.type}</span>
                    {tx.description ? (
                      <span className="ml-2 text-ink-muted">{tx.description}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-subtle">
                    {formatDateTime(tx.createdAt)}
                  </p>
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
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </TabState>
    </div>
  );
}

export default function AdminWorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;

  const detailQuery = useAdminWorkspaceDetail(workspaceId);
  const suspendMutation = useSuspendAdminWorkspace(workspaceId ?? "");
  const reactivateMutation = useReactivateAdminWorkspace(workspaceId ?? "");
  const deleteMutation = useDeleteAdminWorkspace(workspaceId ?? "");

  const [dialogAction, setDialogAction] = useState<WorkspaceLifecycleAction | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const workspace = detailQuery.data;
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
          ? "Workspace suspended."
          : dialogAction === "delete"
            ? "Workspace deleted."
            : "Workspace reactivated.",
      );
      setDialogAction(null);
    } catch (error) {
      setDialogError(
        getErrorMessage(
          error,
          dialogAction === "suspend"
            ? "Could not suspend the workspace."
            : dialogAction === "delete"
              ? "Could not delete the workspace."
              : "Could not reactivate the workspace.",
        ),
      );
    }
  };

  if (detailQuery.isError) {
    const notFound =
      (detailQuery.error as { response?: { status?: number } })?.response?.status === 404;
    return (
      <div className="min-h-full bg-surface-1 px-6 py-10 text-ink">
        <div className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface-1 p-8 text-center shadow-linear">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <WarningCircle size={22} weight="duotone" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">
            {notFound ? "Workspace not found" : "Workspace could not be loaded"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {notFound
              ? "It may have been permanently removed, or the link is wrong."
              : "Check the workspace service and that your session still holds the platform admin role."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link
              href="/admin/workspaces"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Back to directory
            </Link>
            {!notFound ? (
              <Button size="sm" onClick={() => void detailQuery.refetch()}>
                Try again
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    // Hand-rolls AdminPage's measure rather than using it — 1480px, but px-5 py-5 lg:px-7 where
    // AdminPage says px-5 py-6 lg:px-8. Left as it is here so this release changes colour and
    // nothing else; the divergence is worth collapsing when this page is rebuilt.
    <div className="min-h-full bg-surface-1 text-ink">
      <div className="mx-auto w-full max-w-[1480px] px-5 py-5 lg:px-7">
        <Link
          href="/admin/workspaces"
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} />
          Workspaces
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
            <header className="mt-3 flex flex-col gap-4 border-b border-hairline pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
                  <WorkspaceStatusBadge status={workspace.status} />
                </div>
                <p className="mt-1 font-mono text-xs text-ink-subtle">{workspace.slug}</p>
                {workspace.currentSuspension ? (
                  <p className="mt-2 max-w-2xl rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                    Suspended {formatDateTime(workspace.currentSuspension.performedAt)} —{" "}
                    {workspace.currentSuspension.reason}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void detailQuery.refetch()}
                  disabled={detailQuery.isFetching}
                >
                  <ArrowsClockwise
                    size={14}
                    className={detailQuery.isFetching ? "animate-spin" : undefined}
                  />
                  Refresh
                </Button>
                {workspace.status === "active" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDialogError(null);
                      setDialogAction("suspend");
                    }}
                  >
                    <Prohibit size={14} />
                    Suspend
                  </Button>
                ) : workspace.status === "suspended" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setDialogError(null);
                      setDialogAction("reactivate");
                    }}
                  >
                    <ShieldCheck size={14} />
                    Reactivate
                  </Button>
                ) : (
                  <span className="text-xs text-ink-subtle">
                    Deleted workspaces cannot change lifecycle state
                  </span>
                )}
                {workspace.status !== "deleted" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDialogError(null);
                      setDialogAction("delete");
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </header>

            <Tabs defaultValue="overview" className="mt-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
                <TabsTrigger value="billing">Billing</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <OverviewTab workspace={workspace} />
              </TabsContent>

              <TabsContent value="members" className="mt-4">
                <MembersTab workspaceId={workspace.id} />
              </TabsContent>

              <TabsContent value="usage" className="mt-4">
                <UsageTab workspaceId={workspace.id} />
              </TabsContent>

              <TabsContent value="billing" className="mt-4">
                <BillingTab workspaceId={workspace.id} />
              </TabsContent>

              <TabsContent value="audit" className="mt-4">
                <AuditTab workspace={workspace} />
              </TabsContent>
            </Tabs>

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
