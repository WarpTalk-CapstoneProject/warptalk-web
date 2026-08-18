"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  EnvelopeSimple,
  MagnifyingGlass,
  Plus,
  SignIn,
  Spinner,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { useAuthStore } from "@/stores/auth-store";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  extractEmailDomain,
  isPublicEmailDomain,
} from "@/lib/workspace/email-domain";
import {
  getPrimaryInternalWorkspace,
  isInternalWorkspaceMembership,
} from "@/lib/workspace/workspace-membership";
import {
  useAcceptWorkspaceInvitationById,
  useMyJoinRequests,
  usePendingWorkspaceInvitations,
  useSelectWorkspace,
  useWorkspaces,
} from "@/hooks/use-workspace";
import { applySelectedWorkspace } from "@/lib/workspace/apply-selected-workspace";
import { CHECKOUT_PLAN_PARAM, readCheckoutIntent } from "@/lib/billing/checkout-intent";
import type { WorkspaceDto, WorkspaceInvitationDto } from "@/types/workspace";

const EMPTY_WORKSPACES: WorkspaceDto[] = [];

export default function WorkspaceOnboardingGatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutPlanSlug = readCheckoutIntent(searchParams);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const publicDomainLabel = extractEmailDomain(user?.email);
  const hasPublicEmailDomain = isPublicEmailDomain(publicDomainLabel);
  // WT-417: a public email domain no longer blocks creating a workspace, so this screen has
  // nothing left to disable. What a public domain still cannot do is have itself system-
  // VERIFIED — verifying gmail.com would make every Gmail address Internal to that workspace —
  // and the server enforces that separately, on the surface where it is actually decided.
  const isSystemAdmin = useIsSystemAdmin();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  const { data: workspacesData, isLoading: workspacesLoading, refetch: refetchWorkspaces } = useWorkspaces(1, 100);
  const { data: pendingInvitationsData, isLoading: pendingInvitationsLoading } = usePendingWorkspaceInvitations();
  const { data: joinRequestsData, isLoading: joinRequestsLoading, refetch: refetchJoinRequests } = useMyJoinRequests();
  const pendingInvitations = useMemo(() => pendingInvitationsData ?? [], [pendingInvitationsData]);
  const joinRequests = useMemo(() => joinRequestsData ?? [], [joinRequestsData]);
  const workspaces = workspacesData?.items ?? EMPTY_WORKSPACES;
  const primaryInternalWorkspace = getPrimaryInternalWorkspace(workspaces);
  const hasPrimaryInternalWorkspace = Boolean(primaryInternalWorkspace);
  const isCreateWorkspaceLocked = hasPrimaryInternalWorkspace;
  const createWorkspaceReason = hasPrimaryInternalWorkspace
    ? `You already have one internal workspace membership in ${primaryInternalWorkspace?.name || "a workspace"}. Open it, or join another workspace by request or invitation.`
    : "Start a workspace for your organization.";
  const createWorkspaceTitle = hasPrimaryInternalWorkspace
    ? "Workspace creation locked"
    : "Create workspace";
  const joinWorkspaceTitle = hasPrimaryInternalWorkspace
    ? "Join another workspace"
    : "Join workspace";
  const selectWorkspace = useSelectWorkspace();
  const acceptInvitation = useAcceptWorkspaceInvitationById();
  const [workspaceSearch, setWorkspaceSearch] = useState("");

  const filteredWorkspaces = useMemo(() => {
    const query = workspaceSearch.trim().toLowerCase();
    if (!query) return workspaces;

    return workspaces.filter((workspace) =>
      [workspace.name, workspace.slug, workspace.role, workspace.membershipType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [workspaceSearch, workspaces]);

  const [arrivedWithoutActiveWorkspace] = useState(() => !activeWorkspaceId);

  const willAutoOpenWorkspace =
    isAuthenticated &&
    arrivedWithoutActiveWorkspace &&
    pendingInvitations.length === 0 &&
    workspaces.length > 0;

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  /**
   * A platform admin does not belong on this screen at all. WT-417.
   *
   * This page is the onboarding gate: "you have no workspace, join or create one". A system
   * admin administers the platform the workspaces live in — they have no workspace of their own
   * and need none — so landing here told the master account it had signed up by mistake, and
   * the only way onward was to create a workspace nobody wanted.
   *
   * (app)/layout.tsx already sends them to /admin for this exact reason, but it hands
   * /workspace straight through as an `isOnboardingRoute` before that branch can run, so this
   * screen was the one place the rule did not reach. Same destination, same reasoning, applied
   * where the gap was.
   */
  useEffect(() => {
    if (isAuthenticated && isSystemAdmin) router.replace("/admin");
  }, [isAuthenticated, isSystemAdmin, router]);

  /**
   * Somebody who clicked a plan on the landing page does not stop here. WT-491.
   *
   * The landing page sends a guest to `/login?callbackUrl=/workspace?planSlug=...`, so a buyer
   * with no workspace yet arrives on this screen carrying their choice. Since creating now
   * begins at the plan grid, leaving them here would show them a DISABLED Create card and a
   * button asking them to choose a plan they had already chosen — the same intent dropped that
   * WT-491 existed to stop, one screen further along.
   *
   * The grid rather than the create form, because the landing page names a plan but no billing
   * cycle, and nobody should be charged for a year they never picked. Their plan arrives
   * marked, so the trip through the grid is a confirmation and not a re-decision.
   *
   * Only when there is no workspace to open: an account that already has one is on its way
   * somewhere, and the effect below owns that.
   */
  useEffect(() => {
    if (!isAuthenticated || workspacesLoading || pendingInvitationsLoading) return;
    if (!checkoutPlanSlug) return;
    if (pendingInvitations.length > 0) return;
    if ((workspacesData?.items?.length ?? 0) > 0) return;

    router.replace(`/workspace/plans?${CHECKOUT_PLAN_PARAM}=${encodeURIComponent(checkoutPlanSlug)}`);
  }, [
    isAuthenticated,
    workspacesLoading,
    pendingInvitationsLoading,
    checkoutPlanSlug,
    pendingInvitations,
    workspacesData,
    router,
  ]);

  useEffect(() => {
    if (selectWorkspace.isPending) {
      return;
    }

    if (isAuthenticated && !activeWorkspaceId && !workspacesLoading && !pendingInvitationsLoading) {
      if (pendingInvitations.length > 0) {
        return;
      }

      if (workspaces.length > 0) {
        const firstWs = workspaces[0];
        // Hydrated from the SELECT RESPONSE, not from the list row: the list's shape varies by
        // endpoint, and the select call is the one authority on this user's role and language
        // in this workspace. The slug to navigate to comes from the same response.
        void (async () => {
          const selection = await selectWorkspace.mutateAsync(firstWs.id);
          applySelectedWorkspace(selection, setActiveWorkspace);
          router.replace(`/${selection.slug}/home`);
        })();
      }
    }
  }, [
    isAuthenticated,
    activeWorkspaceId,
    workspaces,
    workspacesLoading,
    pendingInvitations,
    pendingInvitationsLoading,
    selectWorkspace,
    setActiveWorkspace,
    router,
  ]);

  async function handleAcceptInvitation(invitationId: string) {
    await acceptInvitation.mutateAsync(invitationId);
  }

  async function handleOpenWorkspace(workspaceId: string, workspaceSlug?: string | null) {
    if (!workspaceSlug) return;
    const selection = await selectWorkspace.mutateAsync(workspaceId);
    applySelectedWorkspace(selection, setActiveWorkspace);
    await refetchWorkspaces();
    router.push(`/${selection.slug}/home`);
  }

  if (
    !isAuthenticated ||
    workspacesLoading ||
    pendingInvitationsLoading ||
    joinRequestsLoading ||
    willAutoOpenWorkspace
  ) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-canvas font-sans text-ink antialiased">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-5">
        <Image
          src="/assets/logos/warptalk-sidebar-logo.png"
          alt="WarpTalk"
          width={806}
          height={200}
          className="object-contain opacity-80"
          style={{ width: "auto", height: 24 }}
          priority
        />
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden max-w-[260px] truncate text-[12px] font-medium text-ink-muted sm:block">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="h-8 rounded-full border border-border px-3 text-[12px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 justify-center px-4 py-5">
        <div className="flex min-h-0 w-full max-w-[920px] flex-col gap-4">
          <section className="shrink-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-ink-subtle">
              WarpTalk Workspace
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
                  {hasPrimaryInternalWorkspace ? "Continue to your workspace" : "Choose your workspace"}
                </h1>
                <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-muted">
                  {hasPrimaryInternalWorkspace
                    ? "Your account can hold one internal workspace membership. Open your current workspace, or join another workspace by request or invitation."
                    : "Join an existing organization, create a new one, or open a workspace you already belong to."}
                </p>
              </div>
              {workspaces.length > 0 ? (
                <span className="w-fit rounded-full border border-border bg-surface-1 px-3 py-1 text-[12px] font-medium text-ink-muted">
                  {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </section>

          <section className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => router.push("/workspace/join")}
              className="group flex min-h-[116px] items-center gap-4 rounded-lg border border-border bg-surface-1 p-4 text-left shadow-sm transition-colors hover:border-hairline-strong hover:bg-surface-2"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-ink transition-colors group-hover:bg-surface-3">
                <SignIn weight="duotone" size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">{joinWorkspaceTitle}</span>
                <span className="mt-1 block text-[12px] leading-5 text-ink-muted">
                  {hasPrimaryInternalWorkspace
                    ? "Use an invitation, workspace URL, slug, or room link."
                    : "Enter a workspace URL, slug, or room invitation."}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/workspace/create")}
              disabled={isCreateWorkspaceLocked}
              aria-describedby={isCreateWorkspaceLocked ? "create-workspace-reason" : undefined}
              className="group flex min-h-[116px] items-center gap-4 rounded-lg border border-border bg-surface-1 p-4 text-left shadow-sm transition-colors enabled:hover:border-hairline-strong enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={
                  isCreateWorkspaceLocked
                    ? "flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-ink-muted"
                    : "flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-white"
                }
              >
                <Plus weight="bold" size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">{createWorkspaceTitle}</span>
                <span
                  id={isCreateWorkspaceLocked ? "create-workspace-reason" : undefined}
                  className="mt-1 block text-[12px] leading-5 text-ink-muted"
                >
                  {createWorkspaceReason}
                </span>
              </span>
            </button>
          </section>

          {(pendingInvitations.length > 0 || joinRequests.length > 0) && (
            <section className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
              {pendingInvitations.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-sm">
                  <div className="border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                      <EnvelopeSimple size={16} />
                      Pending invitations
                    </div>
                    <p className="mt-1 truncate text-[11px] text-ink-muted">
                      Invitations for {user?.email}
                    </p>
                  </div>
                  <div className="max-h-[176px] overflow-y-auto divide-y divide-border">
                    {pendingInvitations.map((invitation) => (
                      <div key={invitation.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-foreground">
                            {invitation.email}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-ink-muted">
                            {invitation.roleName} - {invitation.membershipType} - expires{" "}
                            {new Date(invitation.expiresAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAcceptInvitation(invitation.id)}
                          disabled={acceptInvitation.isPending}
                          className="h-8 shrink-0 rounded-full bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
                        >
                          {acceptInvitation.isPending ? "Accepting..." : "Accept"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {joinRequests.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                        <Clock size={16} />
                        Join requests
                      </div>
                      <p className="mt-1 text-[11px] text-ink-muted">Tracked independently.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => refetchJoinRequests()}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="max-h-[176px] overflow-y-auto divide-y divide-border">
                    {joinRequests.map((request: WorkspaceInvitationDto) => {
                      const status = request.status.toUpperCase();
                      const isApproved = status === "ACCEPTED";
                      const isRejected = status === "REJECTED";
                      return (
                        <div key={request.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            {isApproved ? (
                              <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                            ) : isRejected ? (
                              <XCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
                            ) : (
                              <Clock size={16} className="mt-0.5 shrink-0 text-amber-600" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-medium text-foreground">
                                {request.workspaceName || request.workspaceSlug || "Workspace"}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-ink-muted">
                                {isApproved ? "Approved" : isRejected ? "Rejected" : "Waiting for approval"} -{" "}
                                {request.membershipType} provisional
                              </div>
                            </div>
                          </div>
                          {isApproved && (
                            <button
                              type="button"
                              onClick={() => handleOpenWorkspace(request.workspaceId, request.workspaceSlug)}
                              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-[11px] font-semibold text-white hover:bg-primary-hover"
                            >
                              Open <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-1 text-left shadow-sm">
            <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[14px] font-semibold text-foreground">Your workspaces</div>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  Select a workspace to continue. The list scrolls safely when it grows.
                </p>
              </div>
              <label className="flex h-8 w-full items-center gap-2 rounded-full border border-border bg-surface-2 px-3 text-[12px] text-ink-muted sm:w-[260px]">
                <MagnifyingGlass size={14} />
                <input
                  value={workspaceSearch}
                  onChange={(event) => setWorkspaceSearch(event.target.value)}
                  placeholder="Search workspaces"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-muted"
                />
              </label>
            </div>

            {workspaces.length === 0 ? (
              <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center px-6 text-center">
                <p className="text-[14px] font-semibold text-foreground">No workspaces yet</p>
                <p className="mt-1 max-w-sm text-[12px] leading-5 text-ink-muted">
                  Join an existing workspace or create one with a business email.
                </p>
              </div>
            ) : filteredWorkspaces.length === 0 ? (
              <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center px-6 text-center">
                <p className="text-[14px] font-semibold text-foreground">No matching workspaces</p>
                <p className="mt-1 text-[12px] text-ink-muted">Try another workspace name, slug, role, or type.</p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filteredWorkspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => handleOpenWorkspace(workspace.id, workspace.slug)}
                    className="group grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
                  >
                    <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                      {getWorkspaceInitials(workspace.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-foreground">
                        {workspace.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                        /{workspace.slug} - {workspace.role || "Member"} - {workspace.membershipType || "Internal"}
                        {isInternalWorkspaceMembership(workspace) ? " - Primary membership" : ""}
                      </span>
                    </span>
                    <ArrowRight size={15} className="text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {joinRequests.length > 0 && (
            <div className="mt-8 rounded-lg border border-border bg-surface-1 text-left shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                    <Clock size={18} />
                    Join requests
                  </div>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    Each request is tracked independently. Your active workspace stays available while another request is reviewed.
                  </p>
                </div>
                <button type="button" onClick={() => refetchJoinRequests()} className="text-[11px] font-semibold text-primary hover:underline">
                  Refresh
                </button>
              </div>
              <div className="divide-y divide-border">
                {joinRequests.map((request: WorkspaceInvitationDto) => {
                  const status = request.status.toUpperCase();
                  const isApproved = status === "ACCEPTED";
                  const isRejected = status === "REJECTED";
                  return (
                    <div key={request.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="flex min-w-0 items-start gap-3">
                        {isApproved ? <CheckCircle size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : isRejected ? <XCircle size={18} className="mt-0.5 shrink-0 text-destructive" /> : <Clock size={18} className="mt-0.5 shrink-0 text-amber-600" />}
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-foreground">{request.workspaceName || request.workspaceSlug || "Workspace"}</div>
                          <div className="mt-1 text-[12px] text-ink-muted">
                            {isApproved ? "Approved" : isRejected ? "Rejected" : "Waiting for Owner/Admin approval"} · {request.membershipType} provisional
                          </div>
                        </div>
                      </div>
                      {isApproved && (
                        <button
                          type="button"
                          onClick={() => handleOpenWorkspace(request.workspaceId, request.workspaceSlug)}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-semibold text-white hover:bg-primary-hover"
                        >
                          Open workspace <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Join Workspace */}
            <button
              type="button"
              onClick={() => router.push("/workspace/join")}
              className="group flex flex-col justify-between rounded-lg border border-border bg-surface-1 p-5 text-left transition-all hover:bg-surface-2 hover:border-hairline-strong shadow-sm hover:shadow-md cursor-pointer h-[160px]"
            >
              <div className="flex size-9 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-ink group-hover:bg-surface-3 transition-colors">
                <SignIn weight="duotone" size={18} />
              </div>
              <div>
                <span className="block text-[15px] font-semibold text-foreground">
                  Join workspace
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted text-pretty">
                  Enter a workspace URL or slug.
                </span>
              </div>
            </button>

            {/*
              Create Workspace — not a door of its own any more.

              A workspace runs on a plan, and until today the product could not say so: the
              create form ran first and the plan grid was offered afterwards, from INSIDE the
              workspace that had already been founded without one. Somebody could therefore
              have a workspace and never buy anything, which is the state production is in.

              The card stays visible and stays disabled. Removing it would leave the screen
              with one option and no explanation of where creating went; disabled with the
              reason on it says the thing that is actually true — you may create a workspace,
              once it has a plan to run on — and the button below is the way to do that.

              Stated here rather than enforced here. The server still owns every rule about
              who may found a workspace (WorkspaceService.CreateWorkspaceAsync refuses a
              public email domain outright); this is the reason shown to the reader.
            */}
            <div
              aria-disabled="true"
              className="flex h-[160px] cursor-not-allowed flex-col justify-between rounded-lg border border-border bg-surface-1 p-5 text-left opacity-60 shadow-sm"
            >
              <div className="flex size-9 items-center justify-center rounded-[6px] bg-primary text-white">
                <Plus weight="bold" size={18} />
              </div>
              <div>
                <span className="block text-[15px] font-semibold text-foreground">
                  Create workspace
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted text-pretty">
                  Choose a plan first — a workspace opens once its plan is paid for.
                </span>
              </div>
            </div>
          </div>

          {/*
            The way creating a workspace actually happens now.

            Deliberately BELOW the two cards and deliberately the only primary action on the
            screen: joining is unchanged and needs no plan, so it keeps its card, while
            creating has one route and it starts at the price.
          */}
          <button
            type="button"
            onClick={() => router.push("/workspace/plans")}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-[13px] font-semibold text-white transition hover:bg-primary-hover cursor-pointer"
          >
            <Plus weight="bold" size={16} />
            Choose a plan and create a workspace
          </button>
        </div>
      </div>
    </main>
  );
}

function getWorkspaceInitials(name: string | null | undefined) {
  const words = (name || "Workspace").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "W";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
