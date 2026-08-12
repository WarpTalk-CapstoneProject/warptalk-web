"use client";

/**
 * What this workspace needs its owner to do, and what is about to happen in it.
 *
 * WHY IT IS NOT FOUR NUMBERS ANY MORE
 *   It was: Credit balance 0, Meetings 9, Documents 2, Team members 6 — over a chart reading
 *   "Failed to load chart data" and a panel reading "No consumption recorded for this period".
 *   Every one of those is true and none of them is a reason to open the page. "Documents 2" does
 *   not say that one of them has been waiting for approval since the first of August, and that is
 *   the only fact on the page anybody could act on.
 *
 *   So the page answers two questions instead of counting things:
 *     1. What is waiting for me?   — approvals, and a balance about to run out
 *     2. What is coming up?        — the meetings this workspace is about to run
 *
 *   The counts survive as one quiet line at the bottom, because "how big is this workspace" is a
 *   fair question, just not the page's headline. The usage charts are gone with the tiles: a
 *   workspace with no subscription has no consumption to chart, so both panels were permanently
 *   showing their own failure states — which is worse than not being there.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  CheckCircle,
  CreditCard,
  FileText,
  Spinner,
  Users,
  VideoCamera,
  Warning,
} from "@phosphor-icons/react/dist/ssr";

import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { WORKSPACE_DOCUMENT_STATUS } from "@/constants/workspace-document";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useWorkspaceDocuments, useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";

/** Below this, a balance is a thing to act on rather than a thing to know. */
const LOW_CREDIT_PERCENT = 15;

/** How many rows a "what is coming up" list can carry before it stops being a summary. */
const UPCOMING_LIMIT = 5;

export default function WorkspaceAdminDashboardPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const role = useWorkspaceRole();

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  // Read once, at mount. Reading the clock during render is impure — the same render would
  // produce a different list depending on when React happened to run it — and "coming up" only
  // has to be right for the visit, not tick over while the tab sits open.
  const [now] = useState(() => Date.now());

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
    // A workspace with no plan answers this with an error. That is an account state, not a
    // fault, and the section below simply does not draw when there is nothing to draw.
    retry: 1,
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

  const allDocuments = documents?.items ?? [];
  const pendingDocuments = allDocuments.filter((doc) =>
    doc.status?.toLowerCase().includes(WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL),
  );

  const rooms = roomsData?.rooms ?? [];
  const upcoming = rooms
    .filter(
      (room) =>
        room.status === "in_progress" ||
        room.status === "waiting" ||
        (room.status === "scheduled" &&
          room.scheduledAt &&
          new Date(room.scheduledAt).getTime() >= now),
    )
    .sort((a, b) => {
      // Running first — it is happening whether or not it was booked earliest.
      const liveRank = (status: string) => (status === "in_progress" ? 0 : 1);
      if (liveRank(a.status) !== liveRank(b.status)) return liveRank(a.status) - liveRank(b.status);
      return (
        new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()
      );
    })
    .slice(0, UPCOMING_LIMIT);

  const totalCredits = credits?.totalCredits ?? 0;
  const currentCredits = Math.max(0, credits?.currentCredits ?? 0);
  const creditPercent =
    totalCredits > 0 ? Math.round((currentCredits / totalCredits) * 100) : null;
  const creditIsLow = creditPercent !== null && creditPercent <= LOW_CREDIT_PERCENT;

  const isLoadingAttention = isLoadingDocuments || isLoadingCredits;
  const nothingNeedsYou =
    !isLoadingAttention && pendingDocuments.length === 0 && !creditIsLow;

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

      <WorkspaceBody className="flex flex-col gap-5">
        <WorkspaceSection title="Needs you">
          {isLoadingAttention ? (
            <RowSpinner />
          ) : nothingNeedsYou ? (
            <div className="flex items-center gap-2 rounded-[14px] border border-border bg-canvas px-4 py-3.5 text-[13px] text-ink-muted">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              Nothing is waiting on you.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingDocuments.length > 0 ? (
                <ActionRow
                  icon={<FileText className="h-4 w-4" />}
                  href={`/${activeWorkspaceSlug}/documents`}
                  title={`${pendingDocuments.length} document${pendingDocuments.length === 1 ? "" : "s"} waiting for approval`}
                  detail={pendingDocuments
                    .slice(0, 3)
                    .map((doc) => doc.name)
                    .join(" · ")}
                />
              ) : null}

              {creditIsLow ? (
                <ActionRow
                  icon={<Warning className="h-4 w-4 text-destructive" />}
                  href={`/${activeWorkspaceSlug}/billing`}
                  title={`Credits are at ${creditPercent}%`}
                  detail={`${currentCredits.toLocaleString()} of ${totalCredits.toLocaleString()} left — meetings stop translating when this runs out.`}
                />
              ) : null}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="Coming up">
          {isLoadingRooms ? (
            <RowSpinner />
          ) : upcoming.length === 0 ? (
            <div className="rounded-[14px] border border-border bg-canvas px-4 py-3.5 text-[13px] text-ink-muted">
              No meetings scheduled.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((room) => (
                <ActionRow
                  key={room.id}
                  icon={<VideoCamera className="h-4 w-4" />}
                  href={`/${activeWorkspaceSlug}/rooms/${room.id}`}
                  title={room.title || room.translationRoomCode}
                  detail={
                    room.status === "in_progress"
                      ? "Running now"
                      : room.scheduledAt
                        ? new Intl.DateTimeFormat("en-US", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(room.scheduledAt))
                        : "No time set"
                  }
                />
              ))}
            </div>
          )}
        </WorkspaceSection>

        {/* The counts, kept because "how big is this workspace" is a fair question — just not the
            one the page opens with. One line, not four tiles. */}
        <WorkspaceSection title="This workspace">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[14px] border border-border bg-canvas px-4 py-3.5 text-[13px]">
            <CountLink
              href={`/${activeWorkspaceSlug}/members`}
              icon={<Users className="h-4 w-4" />}
              isLoading={isLoadingMembers}
              value={members?.total ?? members?.items?.length ?? 0}
              label="members"
            />
            <CountLink
              href={`/${activeWorkspaceSlug}/documents`}
              icon={<FileText className="h-4 w-4" />}
              isLoading={isLoadingDocuments}
              value={documents?.total ?? allDocuments.length}
              label="documents"
            />
            <CountLink
              href={`/${activeWorkspaceSlug}/rooms`}
              icon={<VideoCamera className="h-4 w-4" />}
              isLoading={isLoadingRooms}
              value={roomsData?.total ?? rooms.length}
              label="meetings"
            />
            {creditPercent !== null ? (
              <CountLink
                href={`/${activeWorkspaceSlug}/billing`}
                icon={<CreditCard className="h-4 w-4" />}
                isLoading={isLoadingCredits}
                value={currentCredits}
                label="credits left"
              />
            ) : null}
          </div>
        </WorkspaceSection>
      </WorkspaceBody>
    </WorkspacePage>
  );
}

function RowSpinner() {
  return (
    <div className="flex items-center gap-2 rounded-[14px] border border-border bg-canvas px-4 py-3.5 text-[13px] text-ink-muted">
      <Spinner className="h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}

/** A thing to do, and the one line that says why. The whole row is the link. */
function ActionRow({
  icon,
  href,
  title,
  detail,
}: {
  icon: ReactNode;
  href: string;
  title: string;
  detail?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[14px] border border-border bg-canvas px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <span className="shrink-0 text-ink-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{title}</span>
        {detail ? (
          <span className="block truncate text-[12px] text-ink-muted">{detail}</span>
        ) : null}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
    </Link>
  );
}

function CountLink({
  href,
  icon,
  isLoading,
  value,
  label,
}: {
  href: string;
  icon: ReactNode;
  isLoading: boolean;
  value: number;
  label: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-1.5 text-ink-muted transition-colors hover:text-ink">
      {icon}
      <span className="font-medium tabular-nums text-ink">
        {isLoading ? "—" : value.toLocaleString()}
      </span>
      {label}
    </Link>
  );
}
