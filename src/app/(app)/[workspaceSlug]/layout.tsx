"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces } from "@/hooks/use-workspace";
import { Spinner } from "@phosphor-icons/react";
import { normalizeWorkspaceSlug } from "@/lib/workspace/workspace-slug";
import { normalizeWorkspaceRole } from "@/lib/workspace/workspace-role";

export default function WorkspaceSlugLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = normalizeWorkspaceSlug(params.workspaceSlug);

  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  const { data: workspacesData, isLoading, isError } = useWorkspaces(1, 100);
  const targetWorkspace = workspaceSlug && workspacesData?.items
    ? workspacesData.items.find((w) => w.slug === workspaceSlug)
    : undefined;

  useEffect(() => {
    if (!workspaceSlug) {
      useWorkspaceStore.getState().clearActiveWorkspace();
      router.replace("/workspace");
      return;
    }

    if (isLoading) return;

    if (isError || !workspacesData?.items) {
      return;
    }

    if (targetWorkspace) {
      const storedRole = useWorkspaceStore.getState().role;
      const storedId = useWorkspaceStore.getState().activeWorkspaceId;

      if (
        activeWorkspaceSlug !== workspaceSlug ||
        storedId !== targetWorkspace.id ||
        // Both sides must be canonicalised: `storedRole` is normalised on write, while
        // `targetWorkspace.role` still carries the API's capitalisation, so comparing them
        // raw was unconditionally true and re-ran setActiveWorkspace on every pass.
        storedRole !== normalizeWorkspaceRole(targetWorkspace.role || "Member") ||
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
      activeWorkspaceSlug !== workspaceSlug ||
      activeWorkspaceId !== targetWorkspace.id);

  if (isLoading || isSyncing) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return <>{children}</>;
}
