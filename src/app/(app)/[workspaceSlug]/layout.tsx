"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces } from "@/hooks/use-workspace";
import { Spinner } from "@phosphor-icons/react";

export default function WorkspaceSlugLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params.workspaceSlug;

  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  const { data: workspacesData, isLoading, isError } = useWorkspaces(1, 100);
  const [isSyncing, setIsSyncing] = useState(true);

  useEffect(() => {
    if (isLoading) return;

    if (isError || !workspacesData?.items) {
      setIsSyncing(false);
      return;
    }

    // Check if the current URL slug matches the active store slug
    if (activeWorkspaceSlug === workspaceSlug) {
      setIsSyncing(false);
      return;
    }

    // Slug does not match store: find the workspace matching the URL slug
    const targetWorkspace = workspacesData.items.find(
      (w) => w.slug === workspaceSlug
    );

    if (targetWorkspace) {
      // Sync the store with the target workspace
      setActiveWorkspace(
        targetWorkspace.id,
        targetWorkspace.name,
        targetWorkspace.slug,
        targetWorkspace.role || "Member",
        targetWorkspace.membershipType || "Internal"
      );
      setIsSyncing(false);
    } else {
      // Not a member or workspace doesn't exist, redirect to onboarding selection page
      router.replace("/workspace");
    }
  }, [
    workspaceSlug,
    activeWorkspaceSlug,
    workspacesData,
    isLoading,
    isError,
    setActiveWorkspace,
    router,
  ]);

  if (isLoading || isSyncing) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return <>{children}</>;
}
