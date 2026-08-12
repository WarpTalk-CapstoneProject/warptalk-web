"use client";

/**
 * Workspace overview: what this workspace is spending and holding.
 *
 * Rebuilt on the workspace chrome. It used to open with a 28px bold title, a duotone sparkle and
 * a sentence explaining what a dashboard is — three pieces of furniture above four numbers, on a
 * page whose name is already in the sidebar. The numbers are the page.
 *
 * The tiles are one shape, not four variations of shadcn's Card with different inner spacing:
 * label, value, and one line of context. Anything that cannot fill all three does not get a tile.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  CreditCard,
  FileText,
  Spinner,
  Users,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";

import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { UsageChart } from "@/components/admin/UsageChart";
import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useWorkspaceDocuments, useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";

/** One number, one label, one line of context. The same box four times. */
function StatTile({
  label,
  icon,
  isLoading,
  value,
  children,
}: {
  label: string;
  icon: ReactNode;
  isLoading: boolean;
  value: ReactNode;
  /** The context line under the value. */
  children: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-canvas p-4 shadow-linear">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-muted">{label}</span>
        <span className="text-ink-muted">{icon}</span>
      </div>
      {isLoading ? (
        <div className="mt-3 flex h-[44px] items-center">
          <Spinner className="h-4 w-4 animate-spin text-ink-muted" />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="text-[24px] font-semibold leading-none tracking-tight text-ink">
            {value}
          </div>
          <div className="text-[12px] text-ink-muted">{children}</div>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceAdminDashboardPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const role = useWorkspaceRole();

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const { data: members, isLoading: isLoadingMembers } = useWorkspaceMembers(
    activeWorkspaceId || "",
    1,
    100,
  );
  const { data: documents, isLoading: isLoadingDocuments } = useWorkspaceDocuments(
    activeWorkspaceId || "",
    1,
    100,
  );
  // Same reason as the Meetings list: without workspaceId the server cannot widen this to a
  // workspace Owner/Admin, and the Meetings tile read 0 for an Admin while the Owner saw 3.
  const { data: roomsData, isLoading: isLoadingRooms } = useTranslationRooms({
    pageSize: 100,
    workspaceId: activeWorkspaceId ?? undefined,
  });

  const { data: credits, isLoading: isLoadingCredits } = useQuery({
    queryKey: ["workspace-credits", activeWorkspaceId],
    queryFn: () => billingService.getWorkspaceCredits(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId && isOwnerOrAdmin),
  });

  if (!isOwnerOrAdmin) {
    return (
      <WorkspacePage>
        <WorkspaceBody className="pt-6">
          <WorkspaceEmptyState
            icon={<CreditCard size={28} weight="duotone" />}
            title="Only an Owner or Admin can see this dashboard"
            description="It reports workspace-wide spend and resources, so it is limited to the people who manage them."
          />
        </WorkspaceBody>
      </WorkspacePage>
    );
  }

  const totalMembers = members?.total ?? members?.items?.length ?? 0;
  const totalDocuments = documents?.total ?? documents?.items?.length ?? 0;
  const totalRooms = roomsData?.rooms?.length ?? roomsData?.total ?? 0;
  const activeRooms =
    roomsData?.rooms?.filter((r) => r.status === "in_progress").length ?? 0;

  const currentCredits = credits?.currentCredits ?? 0;
  const totalCredits = credits?.totalCredits ?? 1000;
  const creditUsagePercent = Math.min(
    100,
    Math.round(((totalCredits - currentCredits) / totalCredits) * 100) || 0,
  );

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        actions={
          <Link
            href={`/${activeWorkspaceSlug}/billing`}
            className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2"
          >
            Billing
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <WorkspaceBody className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Credit balance"
            icon={<CreditCard className="h-4 w-4" />}
            isLoading={isLoadingCredits}
            value={currentCredits.toLocaleString()}
          >
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${100 - creditUsagePercent}%` }}
                />
              </div>
              <span>
                {100 - creditUsagePercent}% of {totalCredits.toLocaleString()} remaining
              </span>
            </div>
          </StatTile>

          <StatTile
            label="Meetings"
            icon={<VideoCamera className="h-4 w-4" />}
            isLoading={isLoadingRooms}
            value={totalRooms}
          >
            <span className="flex items-center gap-1.5">
              {activeRooms > 0 ? (
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              ) : null}
              {activeRooms} currently in progress
            </span>
          </StatTile>

          <StatTile
            label="Documents"
            icon={<FileText className="h-4 w-4" />}
            isLoading={isLoadingDocuments}
            value={totalDocuments}
          >
            Reference material in the knowledge base
          </StatTile>

          <StatTile
            label="Team members"
            icon={<Users className="h-4 w-4" />}
            isLoading={isLoadingMembers}
            value={totalMembers}
          >
            Active accounts in this workspace
          </StatTile>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <WorkspaceSection
            className="xl:col-span-2"
            title="Usage"
            description="Credits consumed against top-ups over the current year."
            actions={
              <Link
                href={`/${activeWorkspaceSlug}/billing`}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
              >
                View details
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {activeWorkspaceId && <UsageChart workspaceId={activeWorkspaceId} />}
          </WorkspaceSection>

          <WorkspaceSection
            title="By feature"
            description="Where the credits went."
          >
            <div className="flex min-h-[280px] flex-col justify-center">
              {activeWorkspaceId && <FeatureBreakdownChart workspaceId={activeWorkspaceId} />}
            </div>
          </WorkspaceSection>
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  );
}
