"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  extractEmailDomain,
  isPublicEmailDomain,
} from "@/lib/workspace/email-domain";
import {
  useAcceptWorkspaceInvitationById,
  useMyJoinRequests,
  usePendingWorkspaceInvitations,
  useSelectWorkspace,
  useWorkspaces,
} from "@/hooks/use-workspace";
import type { WorkspaceDto, WorkspaceInvitationDto } from "@/types/workspace";

const EMPTY_WORKSPACES: WorkspaceDto[] = [];

export default function WorkspaceOnboardingGatePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const publicDomainLabel = extractEmailDomain(user?.email);
  const cannotCreateWorkspace = isPublicEmailDomain(publicDomainLabel);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  const { data: workspacesData, isLoading: workspacesLoading, refetch: refetchWorkspaces } = useWorkspaces(1, 100);
  const { data: pendingInvitationsData, isLoading: pendingInvitationsLoading } = usePendingWorkspaceInvitations();
  const { data: joinRequestsData, isLoading: joinRequestsLoading, refetch: refetchJoinRequests } = useMyJoinRequests();
  const pendingInvitations = useMemo(() => pendingInvitationsData ?? [], [pendingInvitationsData]);
  const joinRequests = useMemo(() => joinRequestsData ?? [], [joinRequestsData]);
  const workspaces = workspacesData?.items ?? EMPTY_WORKSPACES;
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

  useEffect(() => {
    if (isAuthenticated && !activeWorkspaceId && !workspacesLoading && !pendingInvitationsLoading) {
      if (pendingInvitations.length > 0) {
        return;
      }

      if (workspaces.length > 0) {
        const firstWs = workspaces[0];
        const defaultLanguage =
          "defaultLanguage" in firstWs && typeof firstWs.defaultLanguage === "string"
            ? firstWs.defaultLanguage
            : "en";
        selectWorkspace.mutate(firstWs.id);
        setActiveWorkspace(
          firstWs.id,
          firstWs.name,
          firstWs.slug,
          firstWs.role || "Member",
          firstWs.membershipType || "Internal",
          defaultLanguage,
        );
        router.replace(`/${firstWs.slug}/home`);
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
    const workspace = workspaces.find((item) => item.id === workspaceId);
    await selectWorkspace.mutateAsync(workspaceId);
    setActiveWorkspace(
      workspaceId,
      workspace?.name || "Workspace",
      workspaceSlug,
      workspace?.role || "Member",
      workspace?.membershipType || "Internal",
      workspace?.defaultLanguage || "en",
    );
    await refetchWorkspaces();
    router.push(`/${workspaceSlug}/home`);
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
          width={100}
          height={24}
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
                  Choose your workspace
                </h1>
                <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-muted">
                  Join an existing organization, create a new one, or open a workspace you already belong to.
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
                <span className="block text-[15px] font-semibold text-foreground">Join workspace</span>
                <span className="mt-1 block text-[12px] leading-5 text-ink-muted">
                  Enter a workspace URL, slug, or room invitation.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/workspace/create")}
              disabled={cannotCreateWorkspace}
              aria-describedby={cannotCreateWorkspace ? "create-workspace-reason" : undefined}
              className="group flex min-h-[116px] items-center gap-4 rounded-lg border border-border bg-surface-1 p-4 text-left shadow-sm transition-colors enabled:hover:border-hairline-strong enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={
                  cannotCreateWorkspace
                    ? "flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-ink-muted"
                    : "flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-white"
                }
              >
                <Plus weight="bold" size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">Create workspace</span>
                <span
                  id={cannotCreateWorkspace ? "create-workspace-reason" : undefined}
                  className="mt-1 block text-[12px] leading-5 text-ink-muted"
                >
                  {cannotCreateWorkspace
                    ? `Needs a work email. ${publicDomainLabel} addresses can join by invitation.`
                    : "Start a workspace for your organization."}
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
                      </span>
                    </span>
                    <ArrowRight size={15} className="text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  </button>
                ))}
              </div>
            )}
          </section>
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
