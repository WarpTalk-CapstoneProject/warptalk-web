"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Buildings,
  Plus,
  SignIn,
  Spinner,
} from "@phosphor-icons/react/dist/ssr";

import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useSelectWorkspace } from "@/hooks/use-workspace";

export default function WorkspaceOnboardingGatePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  const { data: workspacesData, isLoading: workspacesLoading } = useWorkspaces(1, 100);
  const selectWorkspace = useSelectWorkspace();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && activeWorkspaceId) {
      router.replace("/host/dashboard");
    }
  }, [mounted, activeWorkspaceId, router]);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace("/login");
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    if (mounted && isAuthenticated && !activeWorkspaceId && !workspacesLoading) {
      if (workspacesData?.items && workspacesData.items.length > 0) {
        const firstWs = workspacesData.items[0];
        selectWorkspace.mutate(firstWs.id);
        setActiveWorkspace(
          firstWs.id,
          firstWs.name,
          firstWs.slug,
          firstWs.role || "Member",
          (firstWs as any).membershipType || "Internal"
        );
        router.replace("/host/dashboard");
      }
    }
  }, [mounted, isAuthenticated, activeWorkspaceId, workspacesData, workspacesLoading, selectWorkspace, setActiveWorkspace, router]);

  if (!mounted || !isAuthenticated || activeWorkspaceId || workspacesLoading) {
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
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          <Buildings weight="duotone" size={16} />
          <span className="font-medium">WarpTalk</span>
        </div>
        <div className="text-[12px] text-ink-muted font-medium">
          {user?.email}
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
                  Use an invitation URL or token from your team.
                </span>
              </div>
            </button>

            {/* Create Workspace */}
            <button
              type="button"
              onClick={() => router.push("/workspace/create")}
              className="group flex flex-col justify-between rounded-lg border border-border bg-surface-1 p-5 text-left transition-all hover:bg-surface-2 hover:border-hairline-strong shadow-sm hover:shadow-md cursor-pointer h-[160px]"
            >
              <div className="flex size-9 items-center justify-center rounded-[6px] bg-primary text-primary-foreground">
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
