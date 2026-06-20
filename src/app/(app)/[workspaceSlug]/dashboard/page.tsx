"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Robot,
  CalendarDots,
  Coins,
  CreditCard,
  Users,
  VideoCamera,
  Lock
} from "@phosphor-icons/react";

import { useWorkspace, useWorkspaceMembers, useWorkspaceInvitations, useWorkspaceSettings } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Badge } from "@/components/ui/badge";
import { aiCreditUsage, workspaceRooms } from "@/lib/workspace-preview";

export default function WorkspaceDashboardPage() {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);
  const membershipType = useWorkspaceStore((s) => s.membershipType);

  // Queries
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const membersQuery = useWorkspaceMembers(activeWorkspaceId || "", 1, 1);
  const invitationsQuery = useWorkspaceInvitations(activeWorkspaceId || "", 1, 1);

  // If no workspace is active
  if (!activeWorkspaceId) {
    return null; // Will be handled by layout redirect guard
  }

  const isOwner = role === "Owner";
  const isAdmin = role === "Admin";
  const isOwnerOrAdmin = isOwner || isAdmin;

  // RBAC boundaries: Only Owners and Admins have access to the workspace dashboard
  if (!isOwnerOrAdmin) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="max-w-md border border-hairline bg-surface-1/40 p-6 text-center rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Access Denied</h2>
            <p className="text-xs text-ink-muted">
              Only workspace Owners and Administrators have access to the workspace dashboard.
            </p>
          </div>
          <div className="flex flex-col gap-4 mt-4">
            <p className="text-xs text-ink-muted">
              If you require operational statistics or room history, please request authorization from the workspace Administrator.
            </p>
            <button
              onClick={() => router.push("/workspace")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary text-xs font-semibold text-white transition hover:bg-primary-hover cursor-pointer"
            >
              Switch Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Derive counts
  const activeMembersCount = membersQuery.data?.total ?? 0;
  const pendingInvitesCount = invitationsQuery.data?.total ?? 0;
  const maxRooms = settingsQuery.data?.maxActiveRooms ?? 0;
  const retentionDays = settingsQuery.data?.artifactRetentionDays ?? 0;
  const totalSeats = 160;
  const availableSeats = Math.max(0, totalSeats - activeMembersCount);

  // Chart configuration
  const maxUsage = Math.max(...aiCreditUsage.map((item) => item.value));
  const points = aiCreditUsage
    .map((item, index) => `${index * 100},${104 - (item.value / maxUsage) * 82}`)
    .join(" ");

  const metrics = [
    {
      label: "AI credits remaining",
      value: "32,480",
      detail: "68% of monthly quota",
      icon: Coins,
      emphasized: true,
    },
    {
      label: "Active members",
      value: `${activeMembersCount} Users`,
      detail: `${pendingInvitesCount} pending invites`,
      icon: Users,
      emphasized: false,
    },
    {
      label: "Concurrent room limit",
      value: `${maxRooms || "No limit"}`,
      detail: `Max active meetings allowed`,
      icon: VideoCamera,
      emphasized: false,
    },
    {
      label: "Artifact retention policy",
      value: `${retentionDays ? `${retentionDays} days` : "Indefinite"}`,
      detail: `Retention before auto-deletion`,
      icon: CalendarDots,
      emphasized: false,
    },
  ];

  const billingRows = [
    { item: "Enterprise platform", amount: "$8,400", status: "Fixed" },
    { item: "Realtime translation", amount: "$6,218", status: "Usage" },
    { item: "AI summary & analysis", amount: "$2,062", status: "Usage" },
  ];

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink">

      {/* Metrics Grid - Sleek Linear UI style */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={`rounded-lg p-4 flex flex-col gap-3 transition-colors ${
              metric.emphasized 
                ? "bg-primary text-white shadow-[0_0_20px_rgba(94,106,210,0.15)]" 
                : "bg-surface-1/40 hover:bg-surface-1/60 text-ink border border-hairline/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-md ${
                  metric.emphasized ? "bg-white/20 text-white" : "bg-surface-2/80 text-ink-muted border border-hairline/40"
                }`}
              >
                <metric.icon className="h-4 w-4" />
              </div>
              <ArrowUpRight
                className={`h-3.5 w-3.5 ${metric.emphasized ? "text-white/60" : "text-ink-muted"}`}
              />
            </div>
            <div>
              <p className={`text-[11px] font-medium tracking-tight ${metric.emphasized ? "text-white/80" : "text-ink-muted"}`}>
                {metric.label}
              </p>
              <p className="text-lg font-bold tracking-tight mt-0.5">{metric.value}</p>
              <p className={`text-[10px] mt-0.5 ${metric.emphasized ? "text-white/70" : "text-ink-muted"}`}>
                {metric.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Main & Sidebar Panel */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {/* AI Usage Chart - Borderless with translucent background */}
          <div className="border border-hairline/30 bg-surface-1/40 rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-hairline/20">
              <div>
                <h3 className="text-sm font-semibold text-foreground">AI credit usage</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Realtime translation, summaries, and workspace AI chat.
                </p>
              </div>
              <Badge variant="outline" className="rounded-md border-hairline bg-surface-2 text-[10px] py-0.5 px-2">
                Last 7 days
              </Badge>
            </div>
            <div>
              <div className="grid gap-6 md:grid-cols-[1fr_200px]">
                <div className="min-w-0">
                  <svg viewBox="0 0 600 120" className="h-44 w-full overflow-visible" role="img" aria-label="AI credit usage chart">
                    {[22, 49, 76, 103].map((y) => (
                      <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--hairline)" strokeDasharray="4 5" opacity="0.4" />
                    ))}
                    <defs>
                      <linearGradient id="creditArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity=".2" />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon points={`0,110 ${points} 600,110`} fill="url(#creditArea)" />
                    <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {aiCreditUsage.map((item, index) => (
                      <circle key={item.label} cx={index * 100} cy={104 - (item.value / maxUsage) * 82} r="3.5" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
                    ))}
                  </svg>
                  <div className="grid grid-cols-7 text-center text-[10px] text-ink-muted mt-2 font-mono">
                    {aiCreditUsage.map((item) => <span key={item.label}>{item.label.replace("Jun ", "")}</span>)}
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-lg bg-surface-2/50 border border-hairline/30 p-4 text-ink gap-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Robot className="h-5 w-5" />
                    <span className="text-xs font-semibold text-ink">AI Agent State</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-ink-muted">Credits consumed</p>
                    <p className="text-2xl font-bold">17,520</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3/60">
                    <div className="h-full w-[35%] rounded-full bg-primary" />
                  </div>
                  <p className="text-[10px] text-ink-muted leading-normal">
                    Current forecast stays within the 50,000-credit Enterprise allowance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Meeting activity - Sleek Dark List */}
          <div className="border border-hairline/30 bg-surface-1/40 rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-hairline/20">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Meeting activity</h3>
                <p className="text-xs text-ink-muted mt-0.5">Live and upcoming workspace sessions.</p>
              </div>
              <Link
                href="rooms"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium border border-hairline bg-surface-1 hover:bg-surface-2 transition duration-150"
              >
                All rooms <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {workspaceRooms.slice(0, 3).map((room) => (
                <div
                  key={room.id}
                  className="rounded-md border border-hairline/30 bg-surface-2/40 p-3 flex flex-col gap-2 hover:border-hairline-strong/60 transition duration-150"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[9px] font-mono border-hairline bg-surface-3/40 px-1 py-0.5 text-ink-muted">
                      {room.status}
                    </Badge>
                    <span className="text-[10px] text-ink-muted font-mono">{room.participants}</span>
                  </div>
                  <p className="truncate text-xs font-semibold text-ink">{room.name}</p>
                  <p className="flex items-center gap-1 text-[10px] text-ink-muted">
                    <CalendarDots className="h-3 w-3" />
                    {room.startsAt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Rail: Billing snapshot & Seats usage */}
        <div className="flex flex-col gap-4">
          {/* Billing Snapshot Panel */}
          <div className="border border-hairline/30 bg-surface-1/40 rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-hairline/20">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Billing Snapshot</h3>
                <p className="text-xs text-ink-muted mt-0.5">Current billing period charges.</p>
              </div>
              <CreditCard className="h-4.5 w-4.5 text-ink-muted" />
            </div>
            <div className="flex flex-col gap-2.5">
              {billingRows.map((row) => (
                <div key={row.item} className="flex items-center justify-between rounded-md border border-hairline/30 bg-surface-2/40 p-2.5">
                  <div>
                    <p className="text-xs font-semibold text-ink">{row.item}</p>
                    <p className="text-[10px] text-ink-muted mt-0.5">{row.status}</p>
                  </div>
                  <p className="text-xs font-bold text-ink">{row.amount}</p>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-hairline/40 pt-3 mt-1">
                <span className="text-xs text-ink-muted">Estimated June invoice</span>
                <span className="text-sm font-bold text-foreground">$16,680</span>
              </div>
            </div>
          </div>

          {/* Enterprise Seats */}
          <div className="border border-hairline/30 bg-surface-1/40 rounded-lg p-4 flex items-center justify-between gap-4 text-ink">
            <div>
              <p className="text-[10px] text-ink-muted">Enterprise seats</p>
              <p className="mt-1 text-lg font-bold">{availableSeats} available</p>
              <p className="text-[10px] text-ink-muted mt-0.5">{activeMembersCount} of {totalSeats} assigned</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2/60 border border-hairline/30 text-primary">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
