"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces } from "@/hooks/use-workspace";
import { Spinner } from "@phosphor-icons/react";

export default function WorkspaceSlugLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params.workspaceSlug;
  const isBillingRoute = pathname.split("/").filter(Boolean)[1] === "billing";

  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  const { data: workspacesData, isLoading, isError } = useWorkspaces(1, 100);
  const targetWorkspace = workspacesData?.items.find(
    (workspace) => workspace.slug === workspaceSlug
  );

  useEffect(() => {
    if (isBillingRoute) return;
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
    isBillingRoute,
    activeWorkspaceSlug,
    workspacesData,
    targetWorkspace,
    isLoading,
    isError,
    setActiveWorkspace,
    router,
  ]);

  const workspaceListReady = !isLoading && !isError && !!workspacesData?.items;
  const workspaceNotAvailable = workspaceListReady && !targetWorkspace;
  const isLoadingWorkspace = !isError && !workspacesData?.items;

  if (isBillingRoute) {
    return <>{children}</>;
  }

  if (workspaceNotAvailable) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-base font-semibold text-ink">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-ink-muted">
            This workspace was not found or your account does not have access to it.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || isLoadingWorkspace) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return <>{children}</>;
}
