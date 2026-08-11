"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarBlank,
  Check,
  Clock,
  Pencil,
  Prohibit,
  Repeat,
  VideoCamera,
  X,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageLabel } from "@/components/language/language-label";
import { useSeries, useUpdateSeries } from "@/hooks/use-series";
import {
  useCancelTranslationRoom,
  useCancelTranslationRoomSeries,
} from "@/hooks/use-translationRooms";
import { useAuthStore } from "@/stores/auth-store";
import { getErrorMessage } from "@/lib/api/errors";
import { meetingLanguageSet } from "@/lib/language/languages";
import { describeRecurrenceWithTime, isSeriesLive } from "@/lib/meeting/recurrence";
import type { TranslationRoomDto } from "@/types/translationRoom";

const OCCURRENCE_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const OCCURRENCE_TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const RANGE_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** A local "yyyy-MM-dd" from the series, formatted without letting the browser shift the day. */
function formatLocalDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return RANGE_DATE.format(new Date(year, month - 1, day));
}

const TERMINAL_STATUSES = new Set(["ended", "cancelled", "expired", "failed", "timeout"]);

function OccurrenceRow({
  room,
  workspaceSlug,
  isCurrent,
  canSkip,
  onSkip,
  isSkipping,
}: {
  room: TranslationRoomDto;
  workspaceSlug: string;
  isCurrent: boolean;
  canSkip: boolean;
  onSkip: () => void;
  isSkipping: boolean;
}) {
  const when = room.scheduledAt ? new Date(room.scheduledAt) : null;
  const isPast = TERMINAL_STATUSES.has(room.status);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        isCurrent
          ? "border-primary/40 bg-primary/5"
          : "border-border/60 bg-surface-1 hover:border-border"
      }`}
    >
      <Link href={`/${workspaceSlug}/rooms/${room.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`w-[104px] shrink-0 text-[12px] font-medium tabular-nums ${isPast ? "text-ink-muted" : "text-ink"}`}>
          {when ? OCCURRENCE_DATE.format(when) : "No date"}
        </span>
        <span className="w-[72px] shrink-0 text-[12px] tabular-nums text-ink-muted">
          {when ? OCCURRENCE_TIME.format(when) : "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{room.title}</span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize ${
            room.status === "cancelled"
              ? "border-border/60 bg-surface-2 text-ink-muted line-through"
              : "border-border/60 bg-surface-2 text-ink-muted"
          }`}
        >
          {room.status.replace(/_/g, " ")}
        </span>
      </Link>

      {isCurrent && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          Next
        </span>
      )}

      {/* Skipping ONE date does not touch the booking: the server's materialisation watermark
          never revisits a date it has passed, so a skipped Tuesday stays skipped and Wednesday
          still arrives. */}
      {canSkip && !isPast && (
        <button
          type="button"
          onClick={onSkip}
          disabled={isSkipping}
          title="Skip this one meeting — the schedule keeps running"
          className="shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <X size={14} weight="bold" />
        </button>
      )}
    </div>
  );
}

/**
 * WT-327: a repeating booking as ONE meeting with many dates.
 *
 * This page is the answer to the complaint that a daily standup looked like fourteen separate
 * meetings. The occurrences are still ordinary rooms underneath — each keeps its own transcript,
 * artifacts and participants, which is what lets "which meeting was that decision in?" have an
 * answer at all — but the thing the user manages, edits, shares and cancels is the booking.
 */
export default function SeriesPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params?.workspaceSlug as string;
  const seriesId = params?.seriesId as string;

  const user = useAuthStore((state) => state.user);
  const seriesQuery = useSeries(seriesId);
  const updateSeries = useUpdateSeries(seriesId);
  const cancelSeries = useCancelTranslationRoomSeries();
  const cancelOccurrence = useCancelTranslationRoom();

  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [skippingId, setSkippingId] = useState<string | null>(null);

  const detail = seriesQuery.data;
  const isHost = Boolean(detail && user?.id === detail.hostId);
  const isLive = Boolean(detail && isSeriesLive(detail.series.status));

  const { upcoming, past } = useMemo(() => {
    const occurrences = detail?.occurrences ?? [];
    return {
      upcoming: occurrences.filter((room) => !TERMINAL_STATUSES.has(room.status)),
      past: occurrences.filter((room) => TERMINAL_STATUSES.has(room.status)),
    };
  }, [detail?.occurrences]);

  if (seriesQuery.isPending) {
    return (
      <div className="flex flex-col gap-3 p-6">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-[64px] animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    );
  }

  if (seriesQuery.isError || !detail) {
    return (
      <div className="flex flex-col items-center gap-3 p-12 text-center">
        <Repeat size={28} weight="duotone" className="text-ink-muted" />
        <p className="text-[14px] font-medium text-ink">This repeating meeting is not available</p>
        <p className="max-w-[420px] text-[13px] text-ink-muted">
          It may have been removed, or you may not be part of any of its meetings.
        </p>
        <Button variant="outline" onClick={() => router.push(`/${workspaceSlug}/rooms`)}>
          Back to meetings
        </Button>
      </div>
    );
  }

  function beginEdit() {
    if (!detail) return;
    setDraftTitle(detail.title);
    setDraftDescription(detail.description ?? "");
    setIsEditing(true);
  }

  async function saveEdit() {
    const title = draftTitle.trim();
    if (!title) {
      toast.error("A meeting needs a title.");
      return;
    }

    try {
      const result = await updateSeries.mutateAsync({
        title,
        description: draftDescription.trim(),
      });
      setIsEditing(false);
      toast.success(
        result.updatedOccurrenceCount > 0
          ? `Updated the schedule and ${result.updatedOccurrenceCount} upcoming meeting${result.updatedOccurrenceCount === 1 ? "" : "s"}.`
          : "Updated the schedule.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update this repeating meeting."));
    }
  }

  async function skipOccurrence(roomId: string) {
    setSkippingId(roomId);
    try {
      await cancelOccurrence.mutateAsync(roomId);
      await seriesQuery.refetch();
      toast.success("That meeting was skipped. The schedule keeps running.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not skip that meeting."));
    } finally {
      setSkippingId(null);
    }
  }

  async function stopSeries() {
    try {
      const result = await cancelSeries.mutateAsync(seriesId);
      await seriesQuery.refetch();
      toast.success(
        `Schedule stopped. ${result.cancelledOccurrenceCount} upcoming meeting${result.cancelledOccurrenceCount === 1 ? " was" : "s were"} cancelled.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not stop this repeating meeting."));
    }
  }

  const languages = meetingLanguageSet(detail.sourceLanguage, detail.targetLanguages);
  const rule = describeRecurrenceWithTime(detail.series);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 p-6">
      <Link
        href={`/${workspaceSlug}/rooms`}
        className="flex w-fit items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} weight="bold" />
        Meetings
      </Link>

      <header className="rounded-[14px] border border-border bg-canvas p-4 shadow-linear">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="series-title" className="text-[12px] text-ink-muted">
                    Title
                  </Label>
                  <Input
                    id="series-title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="h-9 bg-surface-1 text-[14px]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="series-description" className="text-[12px] text-ink-muted">
                    Description
                  </Label>
                  <Input
                    id="series-description"
                    value={draftDescription}
                    onChange={(event) => setDraftDescription(event.target.value)}
                    className="h-9 bg-surface-1 text-[13px]"
                  />
                </div>
                <p className="text-[12px] text-ink-muted">
                  This changes the schedule and every meeting still to come. Meetings that already
                  ran keep what they ran with.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[18px] font-semibold text-ink">{detail.title}</h1>
                  <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    <Repeat size={11} weight="bold" aria-hidden />
                    {rule}
                  </span>
                  {!isLive && (
                    <span className="rounded-md border border-border/60 bg-surface-2 px-1.5 py-0.5 text-[11px] capitalize text-ink-muted">
                      {detail.series.status.toLowerCase()}
                    </span>
                  )}
                </div>
                {detail.description && (
                  <p className="mt-1 text-[13px] text-ink-muted">{detail.description}</p>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  onClick={saveEdit}
                  disabled={updateSeries.isPending}
                  className="h-8 gap-1.5 text-[13px]"
                >
                  <Check size={14} weight="bold" />
                  {updateSeries.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="h-8 text-[13px]"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {detail.currentOccurrenceId && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/${workspaceSlug}/rooms/${detail.currentOccurrenceId}`)}
                    className="h-8 gap-1.5 text-[13px]"
                  >
                    <VideoCamera size={14} weight="bold" />
                    Go to next meeting
                  </Button>
                )}
                {isHost && isLive && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={beginEdit}
                    className="h-8 gap-1.5 text-[13px]"
                  >
                    <Pencil size={14} weight="bold" />
                    Edit
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-3 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Repeats</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink">
              <Clock size={13} weight="regular" aria-hidden />
              {rule}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-muted">From</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink">
              <CalendarBlank size={13} weight="regular" aria-hidden />
              {formatLocalDate(detail.series.startDateLocal)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Until</dt>
            <dd className="mt-0.5 text-[13px] text-ink">
              {formatLocalDate(detail.series.endDateLocal)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Languages</dt>
            <dd className="mt-0.5 flex items-center gap-1">
              {languages.map((language) => (
                <LanguageLabel key={language} value={language} showName={false} />
              ))}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-[12px] text-ink-muted">
          Times are shown in your browser&apos;s zone. The schedule itself is kept as{" "}
          <span className="text-ink">
            {detail.series.startTimeLocal} in {detail.series.timeZone}
          </span>
          , so it stays at that hour there whatever happens to daylight saving.
        </p>
      </header>

      <section className="rounded-[14px] border border-border bg-canvas p-4 shadow-linear">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">
            Upcoming{" "}
            <span className="font-normal text-ink-muted">({upcoming.length})</span>
          </h2>
          {isHost && isLive && (
            <Button
              size="sm"
              variant="outline"
              onClick={stopSeries}
              disabled={cancelSeries.isPending}
              className="h-8 gap-1.5 border-destructive/30 text-[13px] text-destructive hover:bg-destructive/10"
            >
              <Prohibit size={14} weight="bold" />
              {cancelSeries.isPending ? "Stopping…" : "Stop repeating"}
            </Button>
          )}
        </div>

        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-[13px] text-ink-muted">
            No meetings still to come in this schedule.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((room) => (
              <OccurrenceRow
                key={room.id}
                room={room}
                workspaceSlug={workspaceSlug}
                isCurrent={room.id === detail.currentOccurrenceId}
                canSkip={isHost && isLive}
                onSkip={() => skipOccurrence(room.id)}
                isSkipping={skippingId === room.id}
              />
            ))}
          </div>
        )}

        {/* The horizon is the server's, not a paging bug: occurrences are created about two weeks
            ahead and the rest arrive as time passes. Saying so stops "where are the other twenty?"
            being read as data loss. */}
        <p className="mt-3 text-[12px] text-ink-muted">
          Meetings are created a couple of weeks ahead. The rest of the schedule appears as those
          dates come closer.
        </p>
      </section>

      {past.length > 0 && (
        <section className="rounded-[14px] border border-border bg-canvas p-4 shadow-linear">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">
            Past <span className="font-normal text-ink-muted">({past.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {past.map((room) => (
              <OccurrenceRow
                key={room.id}
                room={room}
                workspaceSlug={workspaceSlug}
                isCurrent={false}
                canSkip={false}
                onSkip={() => undefined}
                isSkipping={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
