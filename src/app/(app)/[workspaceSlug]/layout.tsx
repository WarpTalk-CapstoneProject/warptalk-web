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

    const targetWorkspace = workspacesData.items.find(
      (w) => w.slug === workspaceSlug
    );

    if (targetWorkspace) {
      const storedRole = useWorkspaceStore.getState().role;
      const storedId = useWorkspaceStore.getState().activeWorkspaceId;

      if (
        activeWorkspaceSlug !== workspaceSlug ||
        storedId !== targetWorkspace.id ||
        storedRole !== (targetWorkspace.role || "Member")
      ) {
        setActiveWorkspace(
          targetWorkspace.id,
          targetWorkspace.name,
          targetWorkspace.slug,
          targetWorkspace.role || "Member",
          "Internal"
        );
      }
      setIsSyncing(false);
    } else {
      const currentSlug = useWorkspaceStore.getState().activeWorkspaceSlug;
      if (currentSlug === workspaceSlug) {
        useWorkspaceStore.getState().clearActiveWorkspace();
      }
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
