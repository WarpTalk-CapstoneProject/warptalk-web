"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  SignIn,
  Spinner,
  EnvelopeSimple,
  ArrowRight,
  CheckCircle,
  Clock,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { useAuthStore } from "@/stores/auth-store";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useAcceptWorkspaceInvitationById,
  usePendingWorkspaceInvitations,
  useWorkspaces,
  useSelectWorkspace,
  useMyJoinRequests,
} from "@/hooks/use-workspace";
import { applySelectedWorkspace } from "@/lib/workspace/apply-selected-workspace";
import { CHECKOUT_PLAN_PARAM, readCheckoutIntent } from "@/lib/billing/checkout-intent";
import type { WorkspaceInvitationDto } from "@/types/workspace";

export default function WorkspaceOnboardingGatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutPlanSlug = readCheckoutIntent(searchParams);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

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
  const selectWorkspace = useSelectWorkspace();
  const acceptInvitation = useAcceptWorkspaceInvitationById();

  // Every sign-in lands here first, and for an account that already has a workspace this
  // page is a waypoint it passes through, not a destination. The redirect that moves it on
  // lives in an effect, and effects run after the browser has painted — so the frame between
  // "the workspace list arrived" and "the navigation committed" used to paint "Set up your
  // workspace" and a Create workspace button at every single sign-in.
  //
  // Answering it during render is the fix. The condition below is the same one the effect
  // acts on, evaluated one phase earlier, so the interstitial is never handed over to the
  // onboarding surface for an account that is on its way somewhere else.
  //
  // Note this is not a blanket "wait a bit". An account with no workspaces and no pending
  // invitations fails this test on the first render after the list resolves, and reaches the
  // create page exactly as promptly as before.
  // Read once, at mount, and not on every render. `activeWorkspaceId` is what the redirect
  // below sets, so a live read would flip this condition false the instant the redirect
  // starts — while router.replace() is still in flight — and simply move the flash from
  // before the navigation to during it. Sampling it at mount answers the question this
  // actually asks, which is why the account came to this page: with nothing selected it is
  // passing through; with a workspace already active it came here to choose another, and
  // then the chooser is the correct thing to show.
  //
  // The (app) layout gates its children behind a mounted flag, so this component's first
  // render is a client render with the persisted workspace store already rehydrated.
  const [arrivedWithoutActiveWorkspace] = useState(() => !activeWorkspaceId);

  const willAutoOpenWorkspace =
    isAuthenticated &&
    arrivedWithoutActiveWorkspace &&
    pendingInvitations.length === 0 &&
    (workspacesData?.items?.length ?? 0) > 0;

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

      if (workspacesData?.items && workspacesData.items.length > 0) {
        const firstWs = workspacesData.items[0];
        void (async () => {
          const selection = await selectWorkspace.mutateAsync(firstWs.id);
          applySelectedWorkspace(selection, setActiveWorkspace);
          router.replace(`/${selection.slug}/home`);
        })();
      }
    }
  }, [isAuthenticated, activeWorkspaceId, workspacesData, workspacesLoading, pendingInvitations, pendingInvitationsLoading, selectWorkspace, setActiveWorkspace, router]);

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
    <main className="flex h-dvh flex-col bg-canvas select-none font-sans antialiased text-ink">
      {/* Top Header info */}
      <header className="flex h-14 items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Image
            src="/assets/logos/warptalk-sidebar-logo.png"
            alt="WarpTalk"
            width={100}
            height={24}
            className="h-6 w-auto object-contain mix-blend-multiply opacity-80"
            priority
          />
        </div>
        {/* Signed in as, and a way back out.
            This screen showed the email as plain text. Someone who signed in with the wrong
            account — or whose domain already belongs to a workspace they cannot create over —
            had no exit from it: no sign-out, no navigation, and every action on the page
            refused them. The only escape was clearing site data. */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-ink-muted">{user?.email}</span>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="rounded-md border border-border px-2 py-1 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Container centered */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-20">
        <div className="w-full max-w-[640px] text-center">
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground text-balance">
            Set up your workspace
          </h1>
          <p className="mt-2 text-[14px] text-ink-muted text-pretty">
            Choose how you want to start working in WarpTalk.
          </p>

          {pendingInvitations.length > 0 && (
            <div className="mt-8 rounded-lg border border-border bg-surface-1 text-left shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                  <EnvelopeSimple size={18} />
                  Pending invitations
                </div>
                <p className="mt-1 text-[12px] text-ink-muted">
                  These invitations match {user?.email}. Accept one to join its workspace.
                </p>
              </div>
              <div className="divide-y divide-border">
                {pendingInvitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-foreground">
                        {invitation.email}
                      </div>
                      <div className="mt-1 text-[12px] text-ink-muted">
                        {invitation.roleName} - {invitation.membershipType} - expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAcceptInvitation(invitation.id)}
                      disabled={acceptInvitation.isPending}
                      className="h-9 shrink-0 rounded-md bg-primary px-3 text-[12px] font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
                    >
                      {acceptInvitation.isPending ? "Accepting..." : "Accept"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {workspacesData?.items && workspacesData.items.length > 0 && (
            <div className="mt-8 rounded-lg border border-border bg-surface-1 text-left shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <div className="text-[15px] font-semibold text-foreground">Your workspaces</div>
                <p className="mt-1 text-[12px] text-ink-muted">Choose a workspace to continue. Pending Join Requests do not block access to these workspaces.</p>
              </div>
              <div className="divide-y divide-border">
                {workspacesData.items.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => handleOpenWorkspace(workspace.id, workspace.slug)}
                    className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-surface-2/60"
                  >
                    <span>
                      <span className="block text-[13px] font-medium text-foreground">{workspace.name}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-muted">{workspace.role} · {workspace.membershipType}</span>
                    </span>
                    <ArrowRight size={15} className="text-ink-muted" />
                  </button>
                ))}
              </div>
            </div>
          )}

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
