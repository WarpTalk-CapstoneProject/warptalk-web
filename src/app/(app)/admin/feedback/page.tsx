"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsClockwise, ChatCircleText, Star, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { useAdminFeedbackComments, useAdminFeedbackSummary } from "@/hooks/use-admin-feedback";
import {
  dimensionLabel,
  distributionShares,
  formatAverage,
  formatResponseRate,
  isThinSample,
  ratingTone,
} from "@/lib/feedback/admin-feedback-view";
import { cn } from "@/lib/utils";
import type {
  AdminFeedbackCommentDto,
  AdminFeedbackDimensionDto,
} from "@/types/admin-feedback";

const PAGE_SIZE = 20;
const numberFormatter = new Intl.NumberFormat("en-US");

const RANGE_TABS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
] as const;

type RangeValue = (typeof RANGE_TABS)[number]["value"];

function isRange(value: string | null): value is RangeValue {
  return RANGE_TABS.some((tab) => tab.value === value);
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const rangeParam = searchParams.get("range");
  const range: RangeValue = isRange(rangeParam) ? rangeParam : "30";
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
    useMemo(() => ({ from, page, pageSize: PAGE_SIZE }), [from, page]),
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

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Operations"
        eyebrowIcon={<Star size={14} weight="fill" />}
        title="Feedback"
        description="What participants said about the product after a meeting ended. Aggregated, and shown without who said it."
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
            Refresh
          </Button>
        }
      />

      <AdminFilterTabs
        tabs={RANGE_TABS}
        value={range}
        onChange={(value) => updateParams({ range: value, page: undefined })}
        label="Reporting window"
        trailing={
          summaryQuery.isPending
            ? "Loading…"
            : summary
              ? `${numberFormatter.format(summary.responseCount)} response${summary.responseCount === 1 ? "" : "s"}`
              : undefined
        }
      />

      {summaryQuery.isError ? (
        <AdminPanel className="mt-4">
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Feedback could not be loaded.</p>
              <p className="mt-1 text-ink-muted">
                Check the translation-room service and that your session still holds the platform
                admin role.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void summaryQuery.refetch()}
              >
                Try again
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
              <p className="text-[11px] font-medium text-ink-muted">Responses</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums">
                {numberFormatter.format(summary.responseCount)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
              <p className="text-[11px] font-medium text-ink-muted">Meetings rated</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[26px] font-semibold leading-none tabular-nums">
                  {numberFormatter.format(summary.ratedMeetings)}
                </span>
                {/* The denominator is the whole point. Without it, an average rating says nothing
                    about whether anyone was listening. */}
                <span className="text-[12px] text-ink-subtle">
                  of {numberFormatter.format(summary.endedMeetings)} ended
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
              <p className="text-[11px] font-medium text-ink-muted">Response rate</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums">
                {formatResponseRate(summary.responseRate)}
              </p>
            </div>
          </div>

          <h2 className="mb-2 mt-6 text-[13px] font-semibold">Ratings by dimension</h2>
          <AdminPanel>
            {summary.dimensions.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
                No ratings were submitted in this window.
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
            Comments
            <span className="font-normal text-ink-muted">
              {numberFormatter.format(commentTotal)}
            </span>
          </h2>
          <AdminPanel>
            {commentsQuery.isError ? (
              <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
                Comments could not be loaded.
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
                Nobody left a written comment in this window.
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
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

          <p className="mt-4 text-[12px] text-ink-muted">
            Read-only, and anonymous by construction — the API does not send who wrote a comment.
            A rating an administrator could edit or delete would not be worth reading.
          </p>
        </>
      )}
    </AdminPage>
  );
}

function DimensionRow({ dimension }: { dimension: AdminFeedbackDimensionDto }) {
  const shares = distributionShares(dimension);
  const thin = isThinSample(dimension);

  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <div className="w-[170px] shrink-0">
        <p className="text-[13px] font-medium">{dimensionLabel(dimension.dimension)}</p>
        <p className="text-[11px] text-ink-subtle">
          {/* Its OWN respondents. Four of the five dimensions are optional, so this is not the
              report's total and printing the report's total here would inflate every one. */}
          {numberFormatter.format(dimension.responseCount)} rated
          {thin ? <span className="ml-1 text-amber-600">· thin sample</span> : null}
        </p>
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

      {/* The distribution, not just the mean. A 3.0 from all threes and one from half ones and
          half fives are the same number and completely different feedback. */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {shares.map((share, index) => {
          const rating = index + 1;
          const tone = ratingTone(rating);
          return (
            <div
              key={rating}
              className="group relative h-6 flex-1 overflow-hidden rounded bg-surface-2"
              title={`${rating}★ — ${dimension.distribution[index]} response${
                dimension.distribution[index] === 1 ? "" : "s"
              }`}
            >
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
    <Suspense fallback={<div className="min-h-full bg-surface-1" />}>
      <FeedbackReport />
    </Suspense>
  );
}
