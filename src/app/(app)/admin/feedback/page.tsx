"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsClockwise,
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
import { useAdminFeedbackComments, useAdminFeedbackSummary } from "@/hooks/use-admin-feedback";
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
  AdminFeedbackSummaryDto,
} from "@/types/admin-feedback";

const PAGE_SIZE = 20;
const numberFormatter = new Intl.NumberFormat("en-US");

const RANGE_VALUES = ["7", "30", "90", "365"] as const;

type RangeValue = (typeof RANGE_VALUES)[number];

function isRange(value: string | null): value is RangeValue {
  return (RANGE_VALUES as readonly string[]).includes(value ?? "");
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
  const searchParams = useSearchParams();

  const rangeParam = searchParams.get("range");
  const range: RangeValue = isRange(rangeParam) ? rangeParam : "30";
  // WT-694: latest comments, or the unhappiest first — the ones most worth reading.
  const commentSort: "recent" | "lowest" = searchParams.get("comments") === "lowest" ? "lowest" : "recent";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  // Computed once per range so the two queries ask about exactly the same window — recomputing
  // `now` in each would let the summary and the comments disagree at a midnight boundary.
  const from = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - Number(range));
    return start.toISOString();
  }, [range]);

  const summaryQuery = useAdminFeedbackSummary(useMemo(() => ({ from }), [from]));
  const commentsQuery = useAdminFeedbackComments(
    useMemo(() => ({ from, page, pageSize: PAGE_SIZE, sort: commentSort }), [from, page, commentSort]),
  );

  const summary = summaryQuery.data;
  const comments = commentsQuery.data?.items ?? [];
  const commentTotal = commentsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(commentTotal / PAGE_SIZE));

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/admin/feedback?${queryString}` : "/admin/feedback");
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
        onChange={(value) => updateParams({ range: value, page: undefined })}
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

          <h2 className="mb-2 mt-6 flex items-center gap-2 text-[13px] font-semibold">
            <ChatCircleText size={14} weight="duotone" />
            {t("comments.title")}
            <span className="font-normal text-ink-muted">
              {numberFormatter.format(commentTotal)}
            </span>
          </h2>
          <AdminFilterTabs
            tabs={commentTabs}
            value={commentSort}
            onChange={(value) =>
              updateParams({ comments: value === "recent" ? undefined : value, page: undefined })
            }
            label={t("comments.sortAria")}
          />
          <div className="mt-2" />
          <AdminPanel>
            {commentsQuery.isError ? (
              <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
                {t("comments.error")}
              </p>
            ) : commentsQuery.isPending ? (
              <ul>
                {Array.from({ length: 4 }).map((_, index) => (
                  <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                    <div className="h-3 w-72 animate-pulse rounded bg-surface-2" />
                  </li>
                ))}
              </ul>
            ) : comments.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
                {t("comments.empty")}
              </p>
            ) : (
              <ul>
                {comments.map((comment) => (
                  <li key={`${comment.translationRoomId}-${comment.createdAt}`}>
                    <CommentRow comment={comment} />
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
        </>
      )}
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

function CommentRow({ comment }: { comment: AdminFeedbackCommentDto }) {
  return (
    <div className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-0.5 text-[12px] font-medium tabular-nums">
          {comment.overallRating}
          <Star size={11} weight="fill" className="text-amber-500" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
          {comment.roomTitle}
        </span>
        <span className="shrink-0 text-[11px] text-ink-subtle">
          {formatWhen(comment.createdAt)}
        </span>
      </div>
      {/* whitespace-pre-line: people write feedback in paragraphs, and collapsing them makes a
          considered comment read as a run-on. */}
      <p className="mt-1 whitespace-pre-line text-[13px] text-ink">{comment.comment}</p>
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
