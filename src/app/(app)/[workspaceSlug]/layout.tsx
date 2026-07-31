"use client";

import { useEffect } from "react";
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
  const targetWorkspace = workspacesData?.items.find(
    (workspace) => workspace.slug === workspaceSlug
  );

  useEffect(() => {
    if (isLoading) return;

    if (isError || !workspacesData?.items) return;

    if (targetWorkspace) {
      const storedRole = useWorkspaceStore.getState().role;
      const storedId = useWorkspaceStore.getState().activeWorkspaceId;

      if (
        activeWorkspaceSlug !== workspaceSlug ||
        storedId !== targetWorkspace.id ||
        storedRole !== (targetWorkspace.role || "Member") ||
        useWorkspaceStore.getState().defaultLanguage !== (targetWorkspace.defaultLanguage || "en")
      ) {
        setActiveWorkspace(
          targetWorkspace.id,
          targetWorkspace.name,
          targetWorkspace.slug,
          targetWorkspace.role || "Member",
          "Internal",
          targetWorkspace.defaultLanguage || "en"
        );
      }
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
    targetWorkspace,
    isLoading,
    isError,
    setActiveWorkspace,
    router,
  ]);

  const isSyncing =
    !isError &&
    (!workspacesData?.items ||
      !targetWorkspace ||
      activeWorkspaceSlug !== workspaceSlug);

  if (isLoading || isSyncing) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return <>{children}</>;
}
