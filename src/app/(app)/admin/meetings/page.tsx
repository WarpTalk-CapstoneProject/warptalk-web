"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsClockwise, VideoCamera, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { useAdminMeetingCounts, useAdminMeetingDirectory } from "@/hooks/use-admin-meetings";
import { cn } from "@/lib/utils";
import type {
  AdminMeetingSort,
  AdminMeetingStatusFilter,
  AdminMeetingSummaryDto,
} from "@/types/admin-meeting";

const PAGE_SIZE = 20;

const STATUS_VALUES = [
  "all",
  "live",
  "SCHEDULED",
  "ENDED",
  "CANCELLED",
  "FAILED",
  "EXPIRED",
] as const;

const SORT_VALUES = ["recent_desc", "recent_asc", "duration_desc"] as const;

const numberFormatter = new Intl.NumberFormat("en-US");

/** IN_PROGRESS and PAUSED both mean the call is up — the same span the API calls "live". */
const LIVE_STATUSES = new Set(["IN_PROGRESS", "PAUSED"]);

function isStatusFilter(value: string | null): value is AdminMeetingStatusFilter {
  return (STATUS_VALUES as readonly string[]).includes(value ?? "");
}

function isSort(value: string | null): value is AdminMeetingSort {
  return (SORT_VALUES as readonly string[]).includes(value ?? "");
}

/**
 * A duration nobody recorded is not a duration of zero.
 *
 * A scheduled meeting that never ran has no duration at all, and "0m" would say it ran and
 * lasted no time — which is what a failed meeting looks like.
 */
function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatWhen(meeting: AdminMeetingSummaryDto): string {
  // The same precedence the server filters and sorts by: when it happened, not when the row was
  // made. Showing createdAt here would disagree with the ordering right next to it.
  const stamp = meeting.startedAt ?? meeting.scheduledAt ?? meeting.createdAt;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(stamp));
}

function MeetingsDirectory() {
  const t = useTranslations("adminMisc.meetings");
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status");
  const sortParam = searchParams.get("sort");
  const status: AdminMeetingStatusFilter = isStatusFilter(statusParam) ? statusParam : "all";
  const sort: AdminMeetingSort = isSort(sortParam) ? sortParam : "recent_desc";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/admin/meetings?${queryString}` : "/admin/meetings");
  };

  const query = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, status, sort }),
    [page, status, sort],
  );

  const directoryQuery = useAdminMeetingDirectory(query);
  const countsQuery = useAdminMeetingCounts();

  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = countsQuery.data;

  const statusTabs = useMemo(
    () => [
      { value: "all" as const, label: t("statusTabs.all") },
      { value: "live" as const, label: t("statusTabs.live") },
      { value: "SCHEDULED" as const, label: t("statusTabs.scheduled") },
      { value: "ENDED" as const, label: t("statusTabs.ended") },
      { value: "CANCELLED" as const, label: t("statusTabs.cancelled") },
      { value: "FAILED" as const, label: t("statusTabs.failed") },
      { value: "EXPIRED" as const, label: t("statusTabs.expired") },
    ],
    [t],
  );

  const sortOptions = useMemo(
    () => [
      { value: "recent_desc" as const, label: t("sort.recentDesc") },
      { value: "recent_asc" as const, label: t("sort.recentAsc") },
      { value: "duration_desc" as const, label: t("sort.durationDesc") },
    ],
    [t],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<VideoCamera size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-3">
            {counts && counts.liveNow > 0 ? (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                {t("liveCount", { count: counts.liveNow })}
              </span>
            ) : null}
            {counts ? (
              <span className="text-[12px] text-ink-muted">
                {t("startedToday", { count: numberFormatter.format(counts.startedToday) })}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void directoryQuery.refetch();
                void countsQuery.refetch();
              }}
              disabled={directoryQuery.isFetching}
            >
              <ArrowsClockwise
                size={14}
                className={cn(directoryQuery.isFetching && "animate-spin")}
              />
              {t("refresh")}
            </Button>
          </div>
        }
      />

      <AdminFilterTabs
        tabs={statusTabs}
        value={status}
        onChange={(value) =>
          updateParams({ status: value === "all" ? undefined : value, page: undefined })
        }
        label={t("meetingStatusAria")}
        trailing={directoryQuery.isPending ? t("loading") : t("meetingCount", { count: total })}
      />

      <div className="mt-4 flex justify-end">
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          {t("sort.label")}
          <select
            value={sort}
            onChange={(event) => updateParams({ sort: event.target.value, page: undefined })}
            className="h-9 rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AdminPanel className="mt-3">
        {directoryQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.description")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void directoryQuery.refetch()}
              >
                {t("error.retry")}
              </Button>
            </div>
          </div>
        ) : directoryQuery.isPending ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li
                key={index}
                className="border-b border-hairline/60 px-4 py-3 last:border-b-0"
              >
                <div className="h-3 w-56 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="grid place-items-center px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                <VideoCamera size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("empty.title")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("empty.description")}</p>
            </div>
          </div>
        ) : (
          <ul>
            {items.map((meeting) => (
              <li key={meeting.id}>
                <MeetingRow meeting={meeting} />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
          <span>{t("pagination.pageOf", { page, totalPages })}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              {t("pagination.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {t("pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[12px] text-ink-muted">{t("footerNote")}</p>
    </AdminPage>
  );
}

function MeetingRow({ meeting }: { meeting: AdminMeetingSummaryDto }) {
  const t = useTranslations("adminMisc.meetings");
  const isLive = LIVE_STATUSES.has(meeting.status);

  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{meeting.title}</p>
        <p className="truncate font-mono text-[11px] text-ink-subtle">
          {meeting.translationRoomCode}
        </p>
      </div>

      <div className="w-[130px] shrink-0">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            isLive
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : meeting.status === "FAILED"
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : meeting.status === "SCHEDULED" || meeting.status === "WAITING"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border bg-surface-2 text-ink-muted",
          )}
        >
          {isLive ? <span className="size-1.5 rounded-full bg-current" /> : null}
          {meeting.status.toLowerCase().replace("_", " ")}
        </span>
      </div>

      {/* Languages come back already parsed from the JSONB column, so the client never has to
          guess a separator. An empty array is a real state — a room whose target list was written
          by an older producer — and renders as a dash rather than an empty cell. */}
      <div className="w-[150px] shrink-0 text-[12px] text-ink-muted">
        {meeting.targetLanguages.length === 0
          ? "—"
          : `${meeting.sourceLanguage} → ${meeting.targetLanguages.join(", ")}`}
      </div>

      <div className="w-[90px] shrink-0 text-[13px] tabular-nums text-ink-muted md:text-right">
        {formatDuration(meeting.durationSeconds)}
      </div>

      {/* Who turned up, not who is connected. A finished meeting has nobody connected, and live
          occupancy would report every past meeting as empty. */}
      <div className="w-[90px] shrink-0 text-[13px] tabular-nums text-ink-muted md:text-right">
        {numberFormatter.format(meeting.attendedCount)}
      </div>

      <div className="w-[140px] shrink-0 text-[12px] text-ink-muted md:text-right">
        {formatWhen(meeting)}
      </div>

      <div className="w-[70px] shrink-0 md:text-right">
        <Link
          href={`/admin/workspaces/${meeting.workspaceId}`}
          className="text-[12px] text-ink-subtle transition-colors hover:text-ink"
        >
          {t("openWorkspace")}
        </Link>
      </div>
    </div>
  );
}

export default function AdminMeetingsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <MeetingsDirectory />
    </Suspense>
  );
}
