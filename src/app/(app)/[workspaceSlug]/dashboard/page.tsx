"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useWorkspaceMembers, useWorkspaceDocuments } from "@/hooks/use-workspace";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { billingService } from "@/services/billing.service";
import { UsageChart } from "@/components/admin/UsageChart";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Users,
  FileText,
  VideoCamera,
  CreditCard,
  ArrowUpRight,
  Sparkle,
  Spinner
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default function WorkspaceAdminDashboardPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const role = useWorkspaceRole();

  const isOwnerOrAdmin = role === "Owner" || role === "Admin";

  // Fetch metrics and stats (React hooks at the top level)
  const { data: members, isLoading: isLoadingMembers } = useWorkspaceMembers(
    activeWorkspaceId || "",
    1,
    100
  );
  const { data: documents, isLoading: isLoadingDocuments } = useWorkspaceDocuments(
    activeWorkspaceId || "",
    1,
    100
  );
  const { data: roomsData, isLoading: isLoadingRooms } = useTranslationRooms({
    pageSize: 100,
  });

  // Query workspace credit balance
  const { data: credits, isLoading: isLoadingCredits } = useQuery({
    queryKey: ["workspace-credits", activeWorkspaceId],
    queryFn: () => billingService.getWorkspaceCredits(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId && isOwnerOrAdmin),
  });

  if (!isOwnerOrAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-6 bg-canvas text-ink">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Access Denied
          </h1>
          <p className="text-ink-muted text-sm">
            This dashboard is only visible to workspace owners and admins.
          </p>
        </div>
      </div>
    );
  }

  const totalMembers = members?.total ?? members?.items?.length ?? 0;
  const totalDocuments = documents?.total ?? documents?.items?.length ?? 0;
  const totalRooms = roomsData?.rooms?.length ?? roomsData?.total ?? 0;
  const activeRooms = roomsData?.rooms?.filter((r) => r.status === "in_progress").length ?? 0;

  const currentCredits = credits?.currentCredits ?? 0;
  const totalCredits = credits?.totalCredits ?? 1000;
  const creditUsagePercent = Math.min(
    100,
    Math.round(((totalCredits - currentCredits) / totalCredits) * 100) || 0
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10 scrollbar-hide bg-canvas text-ink">
      <div className="max-w-7xl mx-auto space-y-8 w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold tracking-tight text-ink flex items-center gap-2">
              <Sparkle className="text-primary w-7 h-7" weight="duotone" />
              {activeWorkspaceName} Dashboard
            </h1>
            <p className="text-ink-muted text-[13px]">
              Overview of workspace metrics, credit consumption, and resources.
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Credits Balance */}
          <Card className="border-border/60 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[13px] font-medium text-ink-muted">Credit Balance</CardTitle>
              <CreditCard className="w-4 h-4 text-ink-muted" />
            </CardHeader>
            <CardContent>
              {isLoadingCredits ? (
                <div className="flex h-9 items-center"><Spinner className="w-5 h-5 animate-spin text-ink-muted" /></div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tracking-tight text-ink">{currentCredits.toLocaleString()}</span>
                    <span className="text-[11px] text-ink-muted">/ {totalCredits.toLocaleString()} credits</span>
                  </div>
                  <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${100 - creditUsagePercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    {100 - creditUsagePercent}% of monthly credits remaining.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Meetings */}
          <Card className="border-border/60 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[13px] font-medium text-ink-muted">Meetings</CardTitle>
              <VideoCamera className="w-4 h-4 text-ink-muted" />
            </CardHeader>
            <CardContent>
              {isLoadingRooms ? (
                <div className="flex h-9 items-center"><Spinner className="w-5 h-5 animate-spin text-ink-muted" /></div>
              ) : (
                <div className="space-y-2">
                  <div className="text-2xl font-bold tracking-tight text-ink">{totalRooms}</div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-ink-muted">{activeRooms} currently in progress</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Documents */}
          <Card className="border-border/60 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[13px] font-medium text-ink-muted">Documents</CardTitle>
              <FileText className="w-4 h-4 text-ink-muted" />
            </CardHeader>
            <CardContent>
              {isLoadingDocuments ? (
                <div className="flex h-9 items-center"><Spinner className="w-5 h-5 animate-spin text-ink-muted" /></div>
              ) : (
                <div className="space-y-2">
                  <div className="text-2xl font-bold tracking-tight text-ink">{totalDocuments}</div>
                  <p className="text-[11px] text-ink-muted">
                    Reference materials and files in knowledge base.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workspace Members */}
          <Card className="border-border/60 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[13px] font-medium text-ink-muted">Team Members</CardTitle>
              <Users className="w-4 h-4 text-ink-muted" />
            </CardHeader>
            <CardContent>
              {isLoadingMembers ? (
                <div className="flex h-9 items-center"><Spinner className="w-5 h-5 animate-spin text-ink-muted" /></div>
              ) : (
                <div className="space-y-2">
                  <div className="text-2xl font-bold tracking-tight text-ink">{totalMembers}</div>
                  <p className="text-[11px] text-ink-muted">
                    Active accounts inside this workspace.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Usage Chart (Span 2) */}
          <div className="md:col-span-2">
            <Card className="border-border/60 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span>Usage Statistics</span>
                  <Link
                    href={`/${activeWorkspaceSlug}/billing`}
                    className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    View details
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </CardTitle>
                <CardDescription className="text-xs text-ink-muted">
                  Credits consumed vs top-up volume over the current year.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {activeWorkspaceId && <UsageChart workspaceId={activeWorkspaceId} />}
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Chart (Span 1) */}
          <div>
            <Card className="border-border/60 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl h-full">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Features Allocation</CardTitle>
                <CardDescription className="text-xs text-ink-muted">
                  Credit distribution by system feature.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 flex flex-col justify-center min-h-[300px]">
                {activeWorkspaceId && <FeatureBreakdownChart workspaceId={activeWorkspaceId} />}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
