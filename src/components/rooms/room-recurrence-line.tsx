"use client";

/**
 * WT-327: what a recurring meeting says about itself, on the meeting.
 *
 * There is no booking page. A repeating meeting has one room code and one next date, and both
 * belong to the meeting the user is already looking at — a second page listing thirty occurrences
 * was the thing that made one standup read as thirty meetings in the first place.
 *
 * Host-only "Stop repeating" lives here because the page it used to live on is gone, and removing
 * a page must not remove the only way to stop a schedule.
 */

import { useState } from "react";
import { Repeat } from "lucide-react";
import { toast } from "sonner";

import { useSeries } from "@/hooks/use-series";
import { useCancelTranslationRoomSeries } from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { describeRecurrenceWithTime, isSeriesLive } from "@/lib/meeting/recurrence";

const NEXT_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function RoomRecurrenceLine({
  seriesId,
  occurrenceId,
  isHost,
}: {
  seriesId: string;
  /**
   * The occurrence this page is showing. WT-548: it is the one occurrence "Stop repeating" must
   * leave alone — it has not started, so without naming it the server counts it among the future
   * occurrences it cancels, and the host watches the meeting they were looking at disappear.
   */
  occurrenceId: string;
  isHost: boolean;
}) {
  const seriesQuery = useSeries(seriesId);
  const cancelSeries = useCancelTranslationRoomSeries();
  const [isStopping, setIsStopping] = useState(false);
  // Captured once, not read during render: reading the clock while rendering makes the component
  // impure and lets "which occurrence is next?" change under a re-render with no input change.
  const [now] = useState(() => Date.now());

  const detail = seriesQuery.data;

  // Nothing rendered while it loads, and nothing rendered if it fails: a line that says
  // "Repeats …" with no rule in it is worse than the page not mentioning the rule at all.
  if (!detail) return null;

  const live = isSeriesLive(detail.series.status);
  const rule = describeRecurrenceWithTime(detail.series);

  // The next occurrence AFTER this one, so the line answers "when does this happen again?".
  const next = detail.occurrences
    .filter((room) => room.status === "scheduled" && room.scheduledAt)
    .map((room) => new Date(room.scheduledAt as string))
    .filter((when) => when.getTime() >= now)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  async function stopRepeating() {
    setIsStopping(true);
    try {
      const result = await cancelSeries.mutateAsync({ seriesId, keepOccurrenceId: occurrenceId });
      // Says what survived, not only what was cancelled. The old wording named a number of
      // cancelled meetings and then navigated away from this one, which read as "it deleted my
      // meeting" — and until the fix above, it had.
      toast.success(
        `Schedule stopped. This meeting still goes ahead; ${result.cancelledOccurrenceCount} later ${
          result.cancelledOccurrenceCount === 1 ? "meeting was" : "meetings were"
        } cancelled.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not stop this repeating meeting."));
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <div className="flex w-fit flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary">
        <Repeat size={12} aria-hidden />
        {live ? rule : `${rule} · stopped`}
      </span>

      {next ? (
        <span className="text-[12px] text-muted-foreground">
          Next {NEXT_DATE.format(next)}
        </span>
      ) : null}

      {isHost && live ? (
        <button
          type="button"
          onClick={stopRepeating}
          disabled={isStopping || cancelSeries.isPending}
          className="inline-flex h-[24px] items-center rounded-full border border-destructive/30 px-2.5 text-[12px] font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
        >
          {isStopping ? "Stopping…" : "Stop repeating"}
        </button>
      ) : null}
    </div>
  );
}
