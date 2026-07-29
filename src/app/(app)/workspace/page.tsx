"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  SignIn,
  Spinner,
  EnvelopeSimple,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useAcceptWorkspaceInvitationById,
  usePendingWorkspaceInvitations,
  useWorkspaces,
  useSelectWorkspace,
} from "@/hooks/use-workspace";

export default function WorkspaceOnboardingGatePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const isSystemAdmin = user?.roles?.includes("admin") ?? false;
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  const { data: workspacesData, isLoading: workspacesLoading } = useWorkspaces(1, 100);
  const { data: pendingInvitationsData, isLoading: pendingInvitationsLoading } = usePendingWorkspaceInvitations();
  const pendingInvitations = useMemo(() => pendingInvitationsData ?? [], [pendingInvitationsData]);
  const selectWorkspace = useSelectWorkspace();
  const acceptInvitation = useAcceptWorkspaceInvitationById();

  useEffect(() => {
    if (activeWorkspaceId) {
      router.replace(`/${activeWorkspaceSlug || "workspace"}/home`);
    }
  }, [activeWorkspaceId, activeWorkspaceSlug, router]);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && isSystemAdmin && !activeWorkspaceId) {
      router.replace("/billing");
    }
  }, [activeWorkspaceId, isAuthenticated, isSystemAdmin, router]);

  useEffect(() => {
    if (isAuthenticated && !isSystemAdmin && !activeWorkspaceId && !workspacesLoading && !pendingInvitationsLoading) {
      if (pendingInvitations.length > 0) {
        return;
      }

      if (workspacesData?.items && workspacesData.items.length > 0) {
        const firstWs = workspacesData.items[0];
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
          defaultLanguage
        );
        router.replace(`/${firstWs.slug}/home`);
      }
    }
  }, [isAuthenticated, isSystemAdmin, activeWorkspaceId, workspacesData, workspacesLoading, pendingInvitations, pendingInvitationsLoading, selectWorkspace, setActiveWorkspace, router]);

  async function handleAcceptInvitation(invitationId: string) {
    await acceptInvitation.mutateAsync(invitationId);
  }

  function handleSignOut() {
    logout();
    router.replace("/login");
  }

  if (!isAuthenticated || activeWorkspaceId || isSystemAdmin || workspacesLoading || pendingInvitationsLoading) {
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
        <div className="flex items-center gap-3">
          <div className="text-[12px] text-ink-muted font-medium">
            {user?.email}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="h-8 rounded-md border border-border bg-surface-1 px-3 text-[12px] font-semibold text-ink transition hover:bg-surface-2"
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

            {/* Create Workspace */}
            <button
              type="button"
              onClick={() => router.push("/workspace/create")}
              className="group flex flex-col justify-between rounded-lg border border-border bg-surface-1 p-5 text-left transition-all hover:bg-surface-2 hover:border-hairline-strong shadow-sm hover:shadow-md cursor-pointer h-[160px]"
            >
              <div className="flex size-9 items-center justify-center rounded-[6px] bg-primary text-white">
                <Plus weight="bold" size={18} />
              </div>
              <div>
                <span className="block text-[15px] font-semibold text-foreground">
                  Create workspace
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted text-pretty">
                  Create a new workspace for your organization.
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
