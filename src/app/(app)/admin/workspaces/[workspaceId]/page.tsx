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

import { WorkspaceLifecycleDialog } from "@/components/admin/WorkspaceLifecycleDialog";
import { WorkspaceStatusBadge } from "@/components/admin/WorkspaceStatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdminWorkspaceDetail,
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

/**
 * Tabs whose data belongs to APIs that do not exist yet get an explicit placeholder rather
 * than invented numbers, so a reviewer can tell "not built" apart from "empty".
 */
function PendingApiTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-hairline bg-surface-1/60 px-6 py-14 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
          <Info size={20} weight="duotone" />
        </span>
        <p className="mt-3 text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>
      </div>
    </div>
  );
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
                : "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"
            }
          >
            {event.action === "suspend" ? (
              <Prohibit size={14} weight="duotone" />
            ) : (
              <ShieldCheck size={14} weight="duotone" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">
              {event.action === "suspend" ? "Suspended" : "Reactivated"}
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

export default function AdminWorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;

  const detailQuery = useAdminWorkspaceDetail(workspaceId);
  const suspendMutation = useSuspendAdminWorkspace(workspaceId ?? "");
  const reactivateMutation = useReactivateAdminWorkspace(workspaceId ?? "");

  const [dialogAction, setDialogAction] = useState<"suspend" | "reactivate" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const workspace = detailQuery.data;
  const pending = suspendMutation.isPending || reactivateMutation.isPending;

  const handleConfirm = async (reason: string) => {
    if (!dialogAction) return;
    setDialogError(null);
    const mutation = dialogAction === "suspend" ? suspendMutation : reactivateMutation;
    try {
      await mutation.mutateAsync(reason);
      toast.success(
        dialogAction === "suspend" ? "Workspace suspended." : "Workspace reactivated.",
      );
      setDialogAction(null);
    } catch (error) {
      setDialogError(
        getErrorMessage(
          error,
          dialogAction === "suspend"
            ? "Could not suspend the workspace."
            : "Could not reactivate the workspace.",
        ),
      );
    }
  };

  if (detailQuery.isError) {
    const notFound =
      (detailQuery.error as { response?: { status?: number } })?.response?.status === 404;
    return (
      <div className="min-h-full bg-canvas px-6 py-10 text-ink">
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
    <div className="min-h-full bg-canvas text-ink">
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
                    variant="destructive"
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
                <PendingApiTab
                  title="Member roster is not exposed to the admin portal yet"
                  description="Only aggregate counts are available today. The per-member list needs a platform-wide members endpoint; the workspace-scoped one requires the caller to be a member of the tenant."
                />
              </TabsContent>

              <TabsContent value="usage" className="mt-4">
                <PendingApiTab
                  title="Per-workspace usage analytics are not available yet"
                  description="Meeting counts, credit consumption, and AI-service breakdown come from the per-workspace analytics API, which is a separate backend slice."
                />
              </TabsContent>

              <TabsContent value="billing" className="mt-4">
                <PendingApiTab
                  title="Per-workspace billing is not available yet"
                  description="Plan, credit balance, and transaction history come from the billing service's admin endpoints, which are a separate backend slice."
                />
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
