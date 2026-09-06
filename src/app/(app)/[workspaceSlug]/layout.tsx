"use client";

import { useEffect, useRef } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSelectWorkspace, useWorkspaces } from "@/hooks/use-workspace";
import { Spinner } from "@phosphor-icons/react";
import { normalizeWorkspaceSlug } from "@/lib/workspace/workspace-slug";
import { normalizeWorkspaceRole } from "@/lib/workspace/workspace-role";
import { applySelectedWorkspace } from "@/lib/workspace/apply-selected-workspace";
import { WorkspacePaywall } from "@/components/workspace/workspace-paywall";
import { isWorkspaceActivationPath } from "@/lib/workspace/workspace-routes";
import { UsageWarningBanner } from "@/components/billing/usage-warning-banner";

export default function WorkspaceSlugLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const pathname = usePathname() ?? "";
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

  // `workspaceSlug` is nullable and the effect above redirects when it is null — but the redirect
  // happens after this render, so without the guard the paywall below would be handed an empty
  // slug and judge a workspace that is not the one being opened.
  if (isLoading || isSyncing || !workspaceSlug) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  /**
   * The activation landing is the one route the paywall lets through while a workspace is UNPAID,
   * so it is also the one place the banner's "inside the paywall" reasoning has to be restated by
   * hand. A workspace with no plan has no cycle and no balance: the banner has nothing to say
   * there, and would only poll an endpoint that answers BILLING_SUBSCRIPTION_NOT_FOUND every two
   * minutes for as long as somebody looks at the plan grid.
   */
  const showUsageWarning = !isWorkspaceActivationPath(pathname);

  // WT-515/WT-554 — no plan, no workspace. Wrapped here rather than per page because a paywall
  // with a page-shaped hole in it is not a paywall: /rooms could be gated and /documents
  // forgotten, and the first person to notice would be somebody using the product for free.
  //
  // Billing and Settings stay reachable through it, otherwise this is a workspace nobody can pay
  // for. See lib/billing/workspace-paywall.
  return (
    <WorkspacePaywall workspaceSlug={workspaceSlug}>
      {/* WT-557 — above the page, inside the paywall.
          Inside, because a workspace that has not paid at all is shown the paywall and does not
          also need to be told its credits are low. Above the page rather than on one page,
          because the meeting that stops mid-sentence is the thing this exists to prevent and the
          person it happens to was not on the billing screen at the time. */}
      {showUsageWarning && <UsageWarningBanner workspaceSlug={workspaceSlug} />}
      {children}
    </WorkspacePaywall>
  );
}
