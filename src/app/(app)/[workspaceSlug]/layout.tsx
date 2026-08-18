"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSelectWorkspace, useWorkspaces } from "@/hooks/use-workspace";
import { Spinner } from "@phosphor-icons/react";
import { normalizeWorkspaceSlug } from "@/lib/workspace/workspace-slug";
import { normalizeWorkspaceRole } from "@/lib/workspace/workspace-role";
import { applySelectedWorkspace } from "@/lib/workspace/apply-selected-workspace";

export default function WorkspaceSlugLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = normalizeWorkspaceSlug(params.workspaceSlug);

  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const selectWorkspace = useSelectWorkspace();
  const syncedWorkspaceIdRef = useRef<string | null>(null);

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
      if (selectWorkspace.isPending) {
        return;
      }

      const storedRole = useWorkspaceStore.getState().role;
      const storedId = useWorkspaceStore.getState().activeWorkspaceId;
      const storedMembershipType = useWorkspaceStore.getState().membershipType;
      const expectedRole = normalizeWorkspaceRole(targetWorkspace.role || "Member");
      const expectedMembershipType = targetWorkspace.membershipType || "Internal";
      const shouldSyncSelection =
        syncedWorkspaceIdRef.current !== targetWorkspace.id ||
        activeWorkspaceSlug !== workspaceSlug ||
        storedId !== targetWorkspace.id ||
        storedRole !== expectedRole ||
        storedMembershipType !== expectedMembershipType ||
        useWorkspaceStore.getState().defaultLanguage !== (targetWorkspace.defaultLanguage || "en");

      if (shouldSyncSelection) {
        void (async () => {
          try {
            const selection = await selectWorkspace.mutateAsync(targetWorkspace.id);
            applySelectedWorkspace(selection, setActiveWorkspace);
            syncedWorkspaceIdRef.current = targetWorkspace.id;
          } catch {
            if (useWorkspaceStore.getState().activeWorkspaceSlug === workspaceSlug) {
              useWorkspaceStore.getState().clearActiveWorkspace();
            }
            router.replace("/workspace");
          }
        })();
      }
    } else {
      syncedWorkspaceIdRef.current = null;
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
    selectWorkspace,
    setActiveWorkspace,
    router,
  ]);

  const isSyncing =
    !isError &&
    (!workspacesData?.items ||
      !targetWorkspace ||
      selectWorkspace.isPending ||
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
