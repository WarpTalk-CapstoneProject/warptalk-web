"use client";

/**
 * The workspace owner's dashboard.
 *
 * WHAT IT WAS, TWICE
 *   First it was four tiles — Credit balance 0, Meetings 9, Documents 2, Team members 6 — over a
 *   chart reading "Failed to load chart data" and a panel reading "No consumption recorded".
 *   Every number true, none of them a reason to open the page, and two thirds of the screen
 *   permanently displaying its own failure.
 *
 *   Then it was a to-do list: what needs approving, what is scheduled, and the counts on one
 *   quiet line. That is a better inbox and a worse dashboard. An owner is the person who pays for
 *   this workspace, and neither version told them the one thing only they can act on — whether
 *   the money holds out.
 *
 * WHAT IT IS
 *   Spend first, because that is the owner's question: how much credit is left, how fast it is
 *   going, and whether it reaches the renewal date — with the pace comparison that makes the
 *   number mean something. Then where the credits went and how the year has trended. Then the
 *   operational half that was worth keeping: what needs a decision, and what is about to run.
 *
 * THE FAILURE STATES ARE THE DESIGN
 *   A workspace with no subscription is not a broken dashboard, and it is the state every new
 *   workspace starts in. Billing reads 404 there — the API used to answer 400 for it, which is
 *   why the old page could only render an error — so each panel that depends on a plan says so
 *   plainly and the panels that do not (usage, meetings, members, documents) carry on working.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  WorkspaceFilterPill,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { WORKSPACE_DOCUMENT_STATUS } from "@/constants/workspace-document";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useWorkspaceDocuments, useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { getErrorStatus } from "@/lib/api/retry-policy";
import { UNFINISHED_ROOM_STATUSES_FILTER } from "@/lib/meeting/meeting-day";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { DashboardHero } from "./components/dashboard-hero";
import { CycleSummary } from "./components/cycle-summary";
import { MemberUsage } from "./components/member-usage";
import { UsageBreakdown } from "./components/usage-breakdown";
import { UsageTrend } from "./components/usage-trend";

/** Below this share of the cycle's credits remaining, the balance needs a decision. */
const LOW_CREDIT_PERCENT = 15;

/** How many rows a "what is coming up" list can carry before it stops being a summary. */
const UPCOMING_LIMIT = 5;

const BREAKDOWN_WINDOWS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

export default function WorkspaceAdminDashboardPage() {
  const t = useTranslations("dashboard");
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const role = useWorkspaceRole();

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  // Read once, at mount. Reading the clock during render is impure — the same render would
  // produce a different projection depending on when React happened to run it — and "coming up"
  // only has to be right for the visit, not tick over while the tab sits open.
  const [now] = useState(() => Date.now());
  const [breakdownDays, setBreakdownDays] = useState<number>(30);
  const year = new Date(now).getFullYear();

  const enabled = Boolean(activeWorkspaceId) && isOwnerOrAdmin;

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
  // `status` is sent rather than left to the server's default, which is the four statuses that
  // existed when it was written. OPEN (WT-612 / WT-621) is not among them, so a meeting the clock
  // had just opened was absent from "up next" — the one row it most belonged in.
  const { data: roomsData, isLoading: isLoadingRooms } = useTranslationRooms({
    pageSize: 100,
    status: UNFINISHED_ROOM_STATUSES_FILTER,
    workspaceId: activeWorkspaceId ?? undefined,
  });

  // WT-413: who is spending it. Same owner/admin `enabled` gate as its neighbours — the
  // endpoint refuses a member outright, so asking would only produce a 403 in the console.
  const memberUsageQuery = useQuery({
    queryKey: ["workspace-usage-by-member", activeWorkspaceId, breakdownDays],
    queryFn: () =>
      billingService.getUsageByMember(activeWorkspaceId!, {
        from: new Date(Date.now() - breakdownDays * 24 * 60 * 60 * 1000).toISOString(),
      }),
    enabled,
  });

  const creditsQuery = useQuery({
    queryKey: ["workspace-credits", activeWorkspaceId],
    queryFn: () => billingService.getWorkspaceCredits(activeWorkspaceId!),
    enabled,
  });
  const subscriptionQuery = useQuery({
    queryKey: ["workspace-subscription", activeWorkspaceId],
    queryFn: () => billingService.getActiveSubscription(activeWorkspaceId!),
    enabled,
  });
  const trendQuery = useQuery({
    queryKey: ["workspace-usage-trend", activeWorkspaceId, year],
    queryFn: () => billingService.getWorkspaceUsageChart(activeWorkspaceId!, year),
    enabled,
  });
  // Reads usage records rather than the subscription, so it answers even before a plan exists.
  const breakdownQuery = useQuery({
    queryKey: ["workspace-usage-breakdown", activeWorkspaceId, breakdownDays],
    queryFn: () => billingService.getWorkspaceUsageBreakdown(activeWorkspaceId!, breakdownDays),
    enabled,
  });

  if (!isOwnerOrAdmin) {
    return (
      <WorkspacePage>
        <WorkspaceBody className="pt-6">
          <WorkspaceEmptyState
            icon={<CreditCard size={28} weight="duotone" />}
            title={t("restricted.title")}
            description={t("restricted.description")}
          />
        </WorkspaceBody>
      </WorkspacePage>
    );
  }

  const billingHref = `/${activeWorkspaceSlug}/settings/billing`;
  const plansHref = `/${activeWorkspaceSlug}/payment/plans`;

  // 404 is the account state "this workspace has no plan", not a fault. Anything else genuinely
  // failed, and saying "no plan" over a 500 would be a lie the owner acts on.
  const noPlan = getErrorStatus(creditsQuery.error) === 404;
  const credits = creditsQuery.data ?? null;
  const subscription = subscriptionQuery.data ?? null;

  const allDocuments = documents?.items ?? [];
  const pendingDocuments = allDocuments.filter((doc) =>
    doc.status?.toLowerCase().includes(WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL),
  );

  const rooms = roomsData?.rooms ?? [];
  const upcoming = rooms
    .filter(
      (room) =>
        room.status === "in_progress" ||
        // WT-612 / WT-621: its slot came round and the door opened by itself. Unlike the
        // `scheduled` clause below it carries no time test — an OPEN room is open NOW, whatever
        // the hour it was booked for says.
        room.status === "open" ||
        room.status === "waiting" ||
        (room.status === "scheduled" &&
          room.scheduledAt &&
          new Date(room.scheduledAt).getTime() >= now),
    )
    .sort((a, b) => {
      // Running or open first — it is happening whether or not it was booked earliest.
      const liveRank = (status: string) =>
        status === "in_progress" || status === "open" ? 0 : 1;
      if (liveRank(a.status) !== liveRank(b.status)) return liveRank(a.status) - liveRank(b.status);
      return new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime();
    })
    .slice(0, UPCOMING_LIMIT);

  const remainingPercent =
    credits && credits.totalCredits > 0
      ? Math.round((Math.max(0, credits.currentCredits) / credits.totalCredits) * 100)
      : null;
  const creditIsLow = remainingPercent !== null && remainingPercent <= LOW_CREDIT_PERCENT;

  const isLoadingAttention = isLoadingDocuments || creditsQuery.isPending;
  const nothingNeedsYou =
    !isLoadingAttention &&
    pendingDocuments.length === 0 &&
    !creditIsLow &&
    !subscription?.cancelAtPeriodEnd;

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        actions={
          <Link
            href={billingHref}
            className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2"
          >
            {t("billing")}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* BLOCK LAYOUT, NOT A FLEX COLUMN — and that is the whole responsive bug.
          WorkspaceBody is `flex-1` inside a `h-full` page, so it has a DEFINITE height and
          scrolls. Making it `flex flex-col` turned every panel into a flex item with the default
          `flex-shrink: 1`, and a flex item whose computed overflow is not `visible` has an
          automatic minimum size of ZERO (CSS Flexbox §4.5) — so instead of the body scrolling,
          the panels were squeezed. Exactly the two children carrying `overflow-hidden` collapsed:
          DashboardHero flattened to a strip of its own gradient, and the chart row to a sliver
          clipping "Credit usage" to "Cre…". Every other panel kept its height, which is why it
          read as one weird overlap rather than a layout that had given up.
          Block children cannot shrink, so the body scrolls the way it was built to. */}
      <WorkspaceBody className="space-y-4">
        {/* The masthead. It carries the page's only colour — see DashboardHero — and its message
            follows the workspace's actual state rather than being a fixed advert, so a workspace
            with a plan is not told to buy one. */}
        <DashboardHero
          messageKey={noPlan ? "no-plan" : "has-plan"}
          title={
            noPlan
              ? t("hero.noPlanTitle")
              : t("hero.hasPlanTitle")
          }
          description={
            noPlan
              ? t("hero.noPlanDescription")
              : t("hero.hasPlanDescription")
          }
          actionLabel={noPlan ? t("hero.choosePlan") : t("hero.openBilling")}
          actionHref={noPlan ? plansHref : billingHref}
          dismissLabel={t("hero.dismiss")}
        />

        {creditsQuery.isPending ? (
          <BlockSpinner height="h-[152px]" />
        ) : creditsQuery.isError && !noPlan ? (
          <PanelNotice
            title={t("creditsError.title")}
            detail={t("creditsError.detail")}
            retryLabel={t("retry")}
            onRetry={() => creditsQuery.refetch()}
          />
        ) : (
          <CycleSummary
            credits={noPlan ? null : credits}
            subscription={subscription}
            now={now}
            billingHref={billingHref}
            plansHref={plansHref}
          />
        )}

        {/* One container, hairline-divided — not two floating cards.
            OpenAI's platform dashboard reads as a single instrument panel because the numbers sit
            in one frame divided by 1px rules; separate bordered cards draw four more boxes inside
            a box and make two related readings look unrelated. `divide-x` handles the seam, so
            neither child carries a border of its own. */}
        <div className="grid divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface-1 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <WorkspaceSection
            title={t("sections.creditUsage")}
            description={t("sections.creditUsageDescription", { year })}
            className="lg:col-span-2 rounded-none border-0 bg-transparent shadow-none"
          >
            {/* "No plan" is an EMPTY chart, not a missing one.
                A workspace without a subscription 404s here, and this used to swap the whole
                panel for one sentence — so the page a new owner sees has a hole where the chart
                is, and the panel jumps to a different height the moment they buy anything.
                UsageTrend already draws axes, grid and a flat baseline for an all-zero series
                and puts the message on top of them; it just was never given the message. A real
                failure (anything that is not a 404) still says so, because drawing an empty chart
                over a broken request would be a lie the owner reads as "nothing used". */}
            {trendQuery.isPending ? (
              <BlockSpinner height="h-[220px]" bare />
            ) : trendQuery.isError && getErrorStatus(trendQuery.error) !== 404 ? (
              <p className="flex h-[220px] items-center justify-center text-center text-[12px] text-ink-muted">
                {t("usageCouldNotLoad")}
              </p>
            ) : (
              <UsageTrend
                year={year}
                monthlyData={trendQuery.data?.monthlyData ?? []}
                emptyMessage={
                  trendQuery.isError
                    ? t("noPlan.usageChartedOncePlan")
                    : undefined
                }
              />
            )}
          </WorkspaceSection>

          <WorkspaceSection
            title={t("sections.whereCreditsGo")}
            className="rounded-none border-0 bg-transparent shadow-none"
            actions={
              <div className="flex items-center gap-1">
                {BREAKDOWN_WINDOWS.map((window) => (
                  <WorkspaceFilterPill
                    key={window.days}
                    label={window.label}
                    selected={breakdownDays === window.days}
                    onClick={() => setBreakdownDays(window.days)}
                  />
                ))}
              </div>
            }
          >
            {/* Same 220px as the chart beside it. A one-line empty state left this column half
                the height of the other and the shared frame looked mis-drawn. */}
            {breakdownQuery.isPending ? (
              <BlockSpinner height="h-[220px]" bare />
            ) : breakdownQuery.isError ? (
              <p className="flex h-[220px] items-center justify-center text-center text-[12px] text-ink-muted">
                {t("usageCouldNotLoad")}
              </p>
            ) : (
              <UsageBreakdown rows={breakdownQuery.data ?? []} />
            )}
          </WorkspaceSection>
        </div>

        <div className="grid gap-4">
          <WorkspaceSection title={t("sections.whoIsSpending")}>
            {memberUsageQuery.isPending ? (
              <BlockSpinner height="h-[220px]" bare />
            ) : memberUsageQuery.isError ? (
              <p className="flex h-[220px] items-center justify-center text-center text-[12px] text-ink-muted">
                {t("memberUsageError")}
              </p>
            ) : (
              <MemberUsage
                rows={memberUsageQuery.data?.members ?? []}
                members={members?.items ?? []}
                total={memberUsageQuery.data?.totalCreditsConsumed ?? 0}
              />
            )}
          </WorkspaceSection>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <WorkspaceSection title={t("sections.needsDecision")}>
            {isLoadingAttention ? (
              <BlockSpinner height="h-[52px]" bare />
            ) : nothingNeedsYou ? (
              <div className="flex items-center gap-2 py-2 text-[13px] text-ink-muted">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                {t("nothingWaiting")}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {pendingDocuments.length > 0 ? (
                  <ActionRow
                    icon={<FileText className="h-4 w-4" />}
                    href={`/${activeWorkspaceSlug}/documents`}
                    title={t("documentsWaitingApproval", { count: pendingDocuments.length })}
                    detail={pendingDocuments
                      .slice(0, 3)
                      .map((doc) => doc.name)
                      .join(" · ")}
                  />
                ) : null}

                {creditIsLow ? (
                  <ActionRow
                    icon={<Warning className="h-4 w-4 text-amber-500" />}
                    href={billingHref}
                    title={t("creditsAtPercent", { percent: remainingPercent })}
                    detail={t("creditsAtPercentDetail", {
                      count: Math.max(0, credits?.currentCredits ?? 0).toLocaleString(),
                    })}
                  />
                ) : null}

                {subscription?.cancelAtPeriodEnd ? (
                  <ActionRow
                    icon={<Warning className="h-4 w-4 text-amber-500" />}
                    href={billingHref}
                    title={t("planCancelling")}
                    detail={t("planEndsOn", {
                      planName: subscription.planName,
                      date: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(subscription.currentPeriodEnd)),
                    })}
                  />
                ) : null}
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection title={t("sections.comingUp")}>
            {isLoadingRooms ? (
              <BlockSpinner height="h-[52px]" bare />
            ) : upcoming.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-muted">{t("noMeetingsScheduled")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcoming.map((room) => (
                  <ActionRow
                    key={room.id}
                    icon={<VideoCamera className="h-4 w-4" />}
                    href={`/${activeWorkspaceSlug}/rooms/${room.id}`}
                    title={room.title || room.translationRoomCode}
                    detail={
                      // Not "Running now" for an OPEN room: it has nobody in it and no translation
                      // session behind it, and saying it is running would send someone in
                      // expecting a meeting already under way (WT-612 / WT-621).
                      room.status === "in_progress"
                        ? t("runningNow")
                        : room.status === "open"
                        ? t("openNow")
                        : room.scheduledAt
                        ? new Intl.DateTimeFormat("en-US", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(room.scheduledAt))
                        : t("noTimeSet")
                    }
                  />
                ))}
              </div>
            )}
          </WorkspaceSection>
        </div>

        {/* The counts, kept because "how big is this workspace" is a fair question — just not the
            one the page opens with. One line, not four tiles. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[14px] border border-border bg-surface-1 px-4 py-3.5 text-[13px]">
          <CountLink
            href={`/${activeWorkspaceSlug}/members`}
            icon={<Users className="h-4 w-4" />}
            isLoading={isLoadingMembers}
            value={members?.total ?? members?.items?.length ?? 0}
            label={t("counts.members")}
          />
          <CountLink
            href={`/${activeWorkspaceSlug}/documents`}
            icon={<FileText className="h-4 w-4" />}
            isLoading={isLoadingDocuments}
            value={documents?.total ?? allDocuments.length}
            label={t("counts.documents")}
          />
          <CountLink
            href={`/${activeWorkspaceSlug}/rooms`}
            icon={<VideoCamera className="h-4 w-4" />}
            isLoading={isLoadingRooms}
            value={roomsData?.total ?? rooms.length}
            label={t("counts.meetings")}
          />
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  );
}

function BlockSpinner({ height, bare = false }: { height: string; bare?: boolean }) {
  return (
    <div
      className={`flex ${height} items-center justify-center gap-2 text-[13px] text-ink-muted ${
        bare ? "" : "rounded-[14px] border border-border bg-surface-1"
      }`}
    >
      <Spinner className="h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}

function PanelNotice({
  title,
  detail,
  retryLabel,
  onRetry,
}: {
  title: string;
  detail: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-surface-1 px-4 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Warning className="h-4 w-4 text-amber-500" />
          {title}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-muted">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-[28px] shrink-0 items-center rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2"
      >
        {retryLabel}
      </button>
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
      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
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
    <Link
      href={href}
      className="flex items-center gap-1.5 text-ink-muted transition-colors hover:text-ink"
    >
      {icon}
      <span className="font-medium tabular-nums text-ink">
        {isLoading ? "—" : value.toLocaleString()}
      </span>
      {label}
    </Link>
  );
}
