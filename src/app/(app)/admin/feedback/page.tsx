"use client";

import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsClockwise,
  Buildings,
  ChatCircleText,
  Info,
  Star,
  TrendDown,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  resolveAdminWorkspaces,
  searchAdminWorkspaces,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { useAdminFeedbackComments, useAdminFeedbackSummary } from "@/hooks/use-admin-feedback";
import { entityValues, numberRangeValue, type ListStateConfig } from "@/lib/admin/list-state";
import {
  confidenceOf,
  deltaTone,
  dimensionLabel,
  distributionShares,
  formatAverage,
  formatAverageDelta,
  formatResponseRate,
  formatShare,
  ratingTone,
} from "@/lib/feedback/admin-feedback-view";
import { cn } from "@/lib/utils";
import type {
  AdminFeedbackCommentDto,
  AdminFeedbackDimensionDto,
  AdminFeedbackQuery,
  AdminFeedbackSummaryDto,
} from "@/types/admin-feedback";

const PAGE_SIZE = 20;
const numberFormatter = new Intl.NumberFormat("en-US");

const RANGE_VALUES = ["7", "30", "90", "365"] as const;

type RangeValue = (typeof RANGE_VALUES)[number];

type CommentSort = "recent" | "lowest";

function isRange(value: string | null): value is RangeValue {
  return (RANGE_VALUES as readonly string[]).includes(value ?? "");
}

/**
 * The comments list's view in the URL. The reporting window is NOT part of it: `range=` stays the
 * page-level tabs, because it drives the summary above as well, and a comments-only date filter
 * beside it would let the two halves of one report describe different weeks.
 *
 * The API orders comments two ways and in one direction each (WT-694), so the two orders are two
 * sort fields — `sort=lowest` — rather than one field with a direction the server cannot honour.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "rating", kind: "numberRange" },
    { key: "workspace", kind: "entity" },
  ],
  sortFields: ["recent", "lowest"],
  defaultSort: { field: "recent", direction: "desc" },
  columns: [{ id: "rating" }, { id: "comment" }, { id: "meeting" }, { id: "submitted" }],
};

/** The overall rating is 1..5 inclusive; anything outside that is a 400, not an empty page. */
function ratingBound(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function FeedbackReport() {
  const t = useTranslations("adminMisc.feedback");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;

  const rangeParam = searchParams.get("range");
  const range: RangeValue = isRange(rangeParam) ? rangeParam : "30";
  // WT-694: latest comments, or the unhappiest first — the ones most worth reading.
  const commentSort: CommentSort = state.sort.field === "lowest" ? "lowest" : "recent";
  const rating = numberRangeValue(state.filters, "rating");
  const minRating = ratingBound(rating?.min);
  const maxRating = ratingBound(rating?.max);
  const workspaceId = entityValues(state.filters, "workspace")[0];

  // Computed once per range so the two queries ask about exactly the same window — recomputing
  // `now` in each would let the summary and the comments disagree at a midnight boundary.
  const from = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - Number(range));
    return start.toISOString();
  }, [range]);

  const summaryQuery = useAdminFeedbackSummary(useMemo(() => ({ from }), [from]));
  const commentsQuery = useAdminFeedbackComments(
    useMemo<AdminFeedbackQuery>(
      () => ({
        from,
        page: state.page,
        pageSize: PAGE_SIZE,
        sort: commentSort,
        search: state.search || undefined,
        minRating,
        maxRating,
        workspaceId,
      }),
      [from, state.page, commentSort, state.search, minRating, maxRating, workspaceId],
    ),
  );

  const summary = summaryQuery.data;
  const comments = commentsQuery.data?.items ?? [];
  const commentTotal = commentsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(commentTotal / PAGE_SIZE));

  /** The window is the page's, not the list's: change it here and start the comments over. */
  const setRange = (value: RangeValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const rangeTabs = useMemo(
    () => [
      { value: "7" as const, label: t("rangeTabs.7") },
      { value: "30" as const, label: t("rangeTabs.30") },
      { value: "90" as const, label: t("rangeTabs.90") },
      { value: "365" as const, label: t("rangeTabs.365") },
    ],
    [t],
  );

  const commentTabs = useMemo(
    () => [
      { value: "recent" as const, label: t("comments.sortRecent") },
      { value: "lowest" as const, label: t("comments.sortLowest") },
    ],
    [t],
  );

  const filterFields: AdminFilterField[] = [
    {
      key: "rating",
      label: t("list.filters.rating"),
      icon: <Star size={13} />,
      kind: "numberRange",
      unit: t("list.filters.ratingUnit"),
      step: 1,
      presets: [
        { label: t("list.filters.ratingPresets.unhappy"), min: 1, max: 2 },
        { label: t("list.filters.ratingPresets.neutral"), min: 3, max: 3 },
        { label: t("list.filters.ratingPresets.happy"), min: 4, max: 5 },
      ],
    },
    {
      key: "workspace",
      label: t("list.filters.workspace"),
      icon: <Buildings size={13} />,
      kind: "entity",
      placeholder: t("list.filters.workspacePlaceholder"),
      search: searchAdminWorkspaces,
      resolve: resolveAdminWorkspaces,
    },
  ];

  const columns: AdminColumn<AdminFeedbackCommentDto>[] = [
    {
      id: "rating",
      header: t("list.columns.rating"),
      className: "w-[80px]",
      cell: (comment) => (
        <span className="flex items-center gap-0.5 text-[12px] font-medium tabular-nums">
          {comment.overallRating}
          <Star size={11} weight="fill" className="text-amber-500" />
        </span>
      ),
    },
    {
      id: "comment",
      header: t("list.columns.comment"),
      primary: true,
      // whitespace-pre-line: people write feedback in paragraphs, and collapsing them makes a
      // considered comment read as a run-on.
      cell: (comment) => <p className="whitespace-pre-line text-[13px] text-ink">{comment.comment}</p>,
    },
    {
      id: "meeting",
      header: t("list.columns.meeting"),
      className: "w-[220px]",
      cell: (comment) => <span className="block truncate text-[12px] text-ink-muted">{comment.roomTitle}</span>,
    },
    {
      id: "submitted",
      header: t("list.columns.submitted"),
      align: "right",
      className: "w-[140px]",
      cell: (comment) => <span className="text-[11px] text-ink-subtle">{formatWhen(comment.createdAt)}</span>,
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Star size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void summaryQuery.refetch();
              void commentsQuery.refetch();
            }}
            disabled={summaryQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={cn(summaryQuery.isFetching && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      <AdminFilterTabs
        tabs={rangeTabs}
        value={range}
        onChange={setRange}
        label={t("reportingWindowAria")}
        trailing={
          summaryQuery.isPending
            ? t("loading")
            : summary
              ? t("responseCount", { count: summary.responseCount })
              : undefined
        }
      />

      {summaryQuery.isError ? (
        <AdminPanel className="mt-4">
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.description")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void summaryQuery.refetch()}
              >
                {t("error.retry")}
              </Button>
            </div>
          </div>
        </AdminPanel>
      ) : summaryQuery.isPending ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : !summary ? null : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
              <p className="text-[11px] font-medium text-ink-muted">{t("stats.responses")}</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums">
                {numberFormatter.format(summary.responseCount)}
              </p>
              {summary.previousResponseCount != null ? (
                <p className="mt-1 text-[11px] text-ink-subtle">
                  {t("stats.previous", { value: numberFormatter.format(summary.previousResponseCount) })}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
              <p className="text-[11px] font-medium text-ink-muted">{t("stats.meetingsRated")}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[26px] font-semibold leading-none tabular-nums">
                  {numberFormatter.format(summary.ratedMeetings)}
                </span>
                {/* The denominator is the whole point. Without it, an average rating says nothing
                    about whether anyone was listening. */}
                <span className="text-[12px] text-ink-subtle">
                  {t("stats.ofEnded", { count: numberFormatter.format(summary.endedMeetings) })}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
              <p className="text-[11px] font-medium text-ink-muted">{t("stats.responseRate")}</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums">
                {formatResponseRate(summary.responseRate)}
              </p>
              {summary.previousFrom ? (
                <p className="mt-1 text-[11px] text-ink-subtle">
                  {t("stats.previous", { value: formatResponseRate(summary.previousResponseRate ?? null) })}
                </p>
              ) : null}
            </div>
          </div>

          <FeedbackInsights summary={summary} />

          <h2 className="mb-2 mt-6 text-[13px] font-semibold">{t("dimensions.title")}</h2>
          <AdminPanel>
            {summary.dimensions.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
                {t("dimensions.empty")}
              </p>
            ) : (
              <ul>
                {summary.dimensions.map((dimension) => (
                  <li key={dimension.dimension}>
                    <DimensionRow dimension={dimension} />
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </>
      )}

      {/* The comments list stands on its own: it has its own query, and a summary that failed to
          load is no reason to hide the comments that did. */}
      <h2 className="mb-1 mt-6 flex items-center gap-2 text-[13px] font-semibold">
        <ChatCircleText size={14} weight="duotone" />
        {t("comments.title")}
      </h2>
      <AdminFilterTabs
        tabs={commentTabs}
        value={commentSort}
        onChange={(value) => list.setSort(value, "desc")}
        label={t("comments.sortAria")}
      />
      <AdminListToolbar
        list={list}
        searchPlaceholder={t("list.searchPlaceholder")}
        filters={filterFields}
        count={commentsQuery.isPending ? null : commentTotal}
        countLabel={t("list.commentCount", { count: commentTotal })}
        isFetching={commentsQuery.isFetching && !commentsQuery.isPending}
        display={{
          // Ordering is the tabs above; the Display panel only chooses the columns.
          sortOptions: [],
          columns: columns
            .filter((column) => !column.primary)
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />
      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={comments}
          rowKey={(comment) => `${comment.translationRoomId}-${comment.createdAt}`}
          isPending={commentsQuery.isPending}
          isError={commentsQuery.isError}
          onRetry={() => void commentsQuery.refetch()}
          empty={{ title: t("comments.empty"), icon: <ChatCircleText size={20} weight="duotone" /> }}
          pagination={{ page: state.page, pageCount: totalPages, total: commentTotal, pageSize: PAGE_SIZE }}
          caption={t("comments.title")}
          minWidth={720}
        />
      </AdminPanel>

      <p className="mt-4 text-[12px] text-ink-muted">{t("footerNote")}</p>
    </AdminPage>
  );
}

/**
 * WT-694: what to look at first, computed server-side and never extrapolated — the weakest
 * dimension, whether the whole sample can be trusted, and which dimensions nobody answered.
 */
function FeedbackInsights({ summary }: { summary: AdminFeedbackSummaryDto }) {
  const t = useTranslations("adminMisc.feedback.insights");
  const lowest = summary.lowestDimension
    ? summary.dimensions.find((d) => d.dimension === summary.lowestDimension)
    : undefined;
  const noData = summary.dimensionsWithoutData ?? [];
  const lowSurvey = summary.confidence === "low" || summary.confidence === "none";
  if (!lowest && noData.length === 0 && !lowSurvey) return null;

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {lowest ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
            <TrendDown size={13} weight="bold" />
            {t("lowestTitle")}
          </p>
          <p className="mt-1 text-[15px] font-semibold">
            {dimensionLabel(lowest.dimension)}{" "}
            <span className="tabular-nums">{formatAverage(lowest.averageRating)}</span>
            <span className="text-[11px] font-normal text-ink-subtle">/5</span>
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {t("lowestDetail", { count: numberFormatter.format(lowest.responseCount) })}
            {formatAverageDelta(lowest.averageDelta)
              ? ` · ${t("vsPrevious", { delta: formatAverageDelta(lowest.averageDelta)! })}`
              : ""}
          </p>
          {summary.lowestDimensionNote ? (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{summary.lowestDimensionNote}</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3">
        {lowSurvey ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-[12px]">
            <Info size={14} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">{t("lowConfidenceTitle")}</p>
              <p className="mt-0.5 text-ink-muted">
                {summary.confidenceNote ?? ""}{" "}
                {t("lowConfidenceRule", {
                  min: summary.minResponses ?? 10,
                  rate: formatShare(summary.minRate ?? 0.1),
                })}
              </p>
            </div>
          </div>
        ) : null}
        {noData.length > 0 ? (
          <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-[12px]">
            <p className="font-medium">{t("noDataTitle", { count: noData.length })}</p>
            <p className="mt-0.5 text-ink-muted">
              {t("noDataBody", { names: noData.map(dimensionLabel).join(", ") })}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DimensionRow({ dimension }: { dimension: AdminFeedbackDimensionDto }) {
  const t = useTranslations("adminMisc.feedback");
  const shares = distributionShares(dimension);
  const confidence = confidenceOf(dimension);
  const delta = formatAverageDelta(dimension.averageDelta);
  const tone = deltaTone(dimension.averageDelta);

  if (confidence === "none") {
    // No data is its own state, highlighted — not a row of empty bars that reads like a score.
    return (
      <div className="flex flex-col gap-1 border-b border-hairline/60 bg-surface-2/50 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
        <p className="w-[170px] shrink-0 text-[13px] font-medium">{dimensionLabel(dimension.dimension)}</p>
        <span className="inline-flex w-fit items-center rounded-full border border-border bg-surface-1 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
          {t("dimensions.noData")}
        </span>
        <span className="text-[12px] text-ink-subtle">{t("dimensions.noDataHint")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <div className="w-[170px] shrink-0">
        <p className="text-[13px] font-medium">{dimensionLabel(dimension.dimension)}</p>
        <p className="text-[11px] text-ink-subtle">
          {/* Its OWN respondents. Four of the five dimensions are optional, so this is not the
              report's total and printing the report's total here would inflate every one. */}
          {t("dimensions.ratedCount", { count: numberFormatter.format(dimension.responseCount) })}
          {dimension.responseShare != null
            ? ` · ${t("dimensions.share", { share: formatShare(dimension.responseShare) })}`
            : null}
        </p>
        {confidence === "low" ? (
          <p className="mt-0.5 text-[11px] font-medium text-amber-600" title={dimension.confidenceNote ?? undefined}>
            {t("dimensions.lowConfidence")}
          </p>
        ) : null}
      </div>

      <div className="flex w-[70px] shrink-0 items-baseline gap-1">
        <span
          className={cn(
            "text-[20px] font-semibold tabular-nums",
            dimension.averageRating == null && "text-ink-subtle",
          )}
        >
          {formatAverage(dimension.averageRating)}
        </span>
        {dimension.averageRating != null ? (
          <span className="text-[11px] text-ink-subtle">/5</span>
        ) : null}
      </div>

      {/* Trend vs the previous window of equal length, as the server computed it. */}
      <div className="w-[80px] shrink-0 text-[12px] tabular-nums">
        {delta ? (
          <Tooltip
            content={t("dimensions.previousTooltip", {
              average: formatAverage(dimension.previousAverageRating ?? null),
              count: dimension.previousResponseCount ?? 0,
            })}
          >
            <span
              className={cn(
                "font-medium",
                tone === "good" && "text-emerald-600 dark:text-emerald-400",
                tone === "bad" && "text-destructive",
                tone === "flat" && "text-ink-muted",
              )}
            >
              {delta}
            </span>
          </Tooltip>
        ) : (
          <span className="text-ink-subtle">{t("dimensions.noTrend")}</span>
        )}
      </div>

      {/* The distribution, not just the mean. A 3.0 from all threes and one from half ones and
          half fives are the same number and completely different feedback. */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {shares.map((share, index) => {
          const rating = index + 1;
          const tone = ratingTone(rating);
          return (
            <Tooltip key={rating} content={t("dimensions.ratingTooltip", { rating, count: dimension.distribution[index] })}>
              <div className="group relative h-6 flex-1 overflow-hidden rounded bg-surface-2">
                <div
                  className={cn(
                    "absolute bottom-0 left-0 right-0",
                    tone === "bad"
                      ? "bg-destructive/60"
                      : tone === "neutral"
                        ? "bg-ink/25"
                        : "bg-emerald-500/60",
                  )}
                  style={{ height: `${Math.round(share * 100)}%` }}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminFeedbackPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <FeedbackReport />
    </Suspense>
  );
}
