"use client";

import {
  Fragment,
  type ElementType,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { enGB } from "date-fns/locale";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  SpinnerGap,
  Translate,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMyMeetingsInRange } from "@/hooks/use-my-meetings";
import {
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
import { endOfMonth, shiftWeeks, startOfMonth, weekOf } from "@/lib/meeting/meeting-day";
import { resolveMeetingTimeState } from "@/lib/meeting/meeting-time-state";
import { formatLanguageRoute } from "@/lib/language/languages";
import { getErrorMessage } from "@/lib/api/errors";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { cn } from "@/lib/utils";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { translationRoomService } from "@/services/translation-room.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { MeetingTimeState, MyMeetingItem } from "@/types/myMeetings";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

/**
 * WT-538 — exactly three chips, and `missed` is in none of them.
 *
 * `past` was renamed to `joined` rather than merely relabelled: the value now has to mean "the
 * viewer was in this room", and a filter called `past` holding meetings selected by attendance is
 * the kind of name that invites the next person to widen it back.
 *
 * There is no Missed chip, deliberately. A missed meeting is something you have already lost; a
 * standing tab counting them is a scoreboard nobody asked for. They appear under All, in amber, and
 * that is the whole of their presence.
 *
 * The consequence is accepted and is not a bug: All ≠ Upcoming + Joined, because the missed rows
 * are in All and in neither of the others. Do not "fix" the arithmetic by inventing a fourth chip
 * or by folding missed into one of these two.
 */
type TimeFilter = "all" | "upcoming" | "joined";

/** One meeting with its state resolved for this viewer, at this minute. See `timedMeetings`. */
type TimedMeeting = MyMeetingItem & { timeState: MeetingTimeState };

/**
 * Month or week.
 *
 * Two views of the same rows, not two pages: the search box, the filters and the popup all mean
 * the same thing in both, and splitting them would have meant maintaining that twice. A month
 * answers "what does this stretch look like"; a week answers "what am I doing on Thursday", which
 * is the question a scrolling agenda is worst at.
 */
type CalendarView = "month" | "week";

const timeFilters: Array<{ value: TimeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "joined", label: "Joined" },
];
const EMPTY_MEETINGS: TimedMeeting[] = [];
const APP_CALENDAR_LOCALE = "en-GB";

/**
 * The geometry a month cell packs its chips with — NOT a chip limit.
 *
 * There used to be a `MONTH_CELL_CHIP_LIMIT = 3` here, and it was a bug: the grid is `h-full` with
 * stretched rows, so a cell is whatever height the window gives it — 110px on a laptop, 250px on a
 * tall screen — while the constant stayed at three 20px chips. A cell twice as tall as it needed to
 * be still drew three rows and then "+4 more" under half a cell of white space.
 *
 * So the count is measured instead (see `useMeasuredHeight`): these are the sizes the arithmetic
 * needs, and they must stay in step with the classes on `MonthChip` (h-5), the list's `space-y-0.5`
 * and the overflow row (h-4).
 */
const MONTH_CHIP_HEIGHT = 20;
const MONTH_CHIP_GAP = 2;
const MONTH_OVERFLOW_ROW_HEIGHT = 16;

/**
 * What a cell draws before the first measurement lands — server render and the first client paint.
 *
 * Three is the number that fits the 110px minimum cell, so the common case starts correct and the
 * measurement only ever adds rows. Never used once a real height is in hand.
 */
const MONTH_CELL_CHIP_FALLBACK = 3;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(iso: string) {
  return String(startOfDay(new Date(iso)));
}

export default function MyMeetingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params?.workspaceSlug as string;
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  /**
   * WT-538 — who is looking, and what time it is.
   *
   * `timeState` is resolved HERE rather than in the mapper that fills the React Query cache, and
   * that placement is the decision, not an accident of where the code fit:
   *
   *  - The cache key is `["my-meetings", workspaceId, monthKey, search]` and carries no user id.
   *    Baking a viewer-dependent field into the cached rows would make that key a lie. (The cache
   *    is emptied on both sign-in and sign-out — see lib/auth/session-scoped-state — so nothing is
   *    actually served across accounts today; this keeps it that way without depending on it.)
   *  - `missed` decays out of `upcoming` as the clock passes. A value computed inside `queryFn` is
   *    frozen at fetch time, so a tab left open would keep showing a meeting as upcoming for as
   *    long as the query stayed fresh — the very bug this ticket is about, reintroduced one layer
   *    down. `useNowMinute` already ticks for the week view's now-line, so re-deriving is free.
   *
   * It is still ONE rule in ONE place — `resolveMeetingTimeState` — just called instead of stored.
   */
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const now = useNowMinute();

  const [view, setView] = useState<CalendarView>("month");
  // One anchor for both views. Switching from week to month keeps you in the month you were
  // looking at, and switching back puts you in the week you left — a separate anchor per view
  // would silently teleport you to today on every toggle.
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TimeFilter>("all");
  const [dialogMeetingId, setDialogMeetingId] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);
  /**
   * The day whose detail panel is open, as the same `startOfDay` key the cells are grouped by.
   *
   * A key rather than a Date so "is this the selected cell?" is a string compare in the render
   * loop, and so the state cannot hold two different Dates that mean the same day.
   */
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const weekDays = useMemo(() => weekOf(monthAnchor), [monthAnchor]);

  // The visible window. In month view this is exactly one month, so it resolves to the same single
  // request and the same cache entry the agenda always used; in week view it is seven days, which
  // may cost two requests when the week straddles a boundary.
  const [rangeFrom, rangeTo] = useMemo(() => {
    if (view === "week") {
      return [startOfDayDate(weekDays[0]), endOfDayDate(weekDays[6])] as const;
    }
    return [startOfMonth(monthAnchor), endOfMonth(monthAnchor)] as const;
  }, [view, weekDays, monthAnchor]);

  const meetings = useMyMeetingsInRange(activeWorkspaceId, rangeFrom, rangeTo, query);
  const fetched = meetings.data?.meetings ?? EMPTY_MEETINGS;

  // The months are fetched whole, so a week view holds up to two months of rows it must not show.
  const windowed = useMemo(() => {
    if (view === "month") return fetched;
    const from = rangeFrom.getTime();
    const to = rangeTo.getTime();
    return fetched.filter((meeting) => {
      const at = Date.parse(meeting.occursAt);
      return at >= from && at <= to;
    });
  }, [fetched, view, rangeFrom, rangeTo]);

  // One derivation for the whole page, so the chip counts, the colours and the badge can never
  // disagree about the same meeting. `now` is null until after hydration and is passed through as
  // null rather than papered over with `Date.now()`: reading the clock inside a `useMemo` is
  // impure, and the resolver has a defined answer for "no clock yet".
  const allMeetings = useMemo<TimedMeeting[]>(() => {
    const nowMs = now === null ? null : now.getTime();
    return windowed.map((meeting) => ({
      ...meeting,
      timeState: resolveMeetingTimeState(meeting, { viewerUserId, now: nowMs }),
    }));
  }, [windowed, viewerUserId, now]);

  // `missed` is in neither bucket. Upcoming holds what is still ahead (and what is running now);
  // Joined holds what the viewer was actually in. A meeting that is over and was never attended is
  // in neither, which is why the three numbers do not add up — see `TimeFilter`.
  const visible = useMemo(() => {
    return allMeetings.filter((meeting) => {
      if (filter === "upcoming") return isAhead(meeting.timeState);
      if (filter === "joined") return meeting.timeState === "joined";
      return true;
    });
  }, [allMeetings, filter]);

  // Marked from everything fetched rather than from the visible window: in week view the little
  // calendar is how you find the week that holds something, so it must still show the whole month.
  const daysWithMeetings = useMemo(
    () => fetched.map((meeting) => new Date(meeting.occursAt)),
    [fetched],
  );

  const counts = useMemo(() => {
    return {
      all: allMeetings.length,
      upcoming: allMeetings.filter((meeting) => isAhead(meeting.timeState)).length,
      joined: allMeetings.filter((meeting) => meeting.timeState === "joined").length,
    };
  }, [allMeetings]);

  const dialogMeeting = allMeetings.find((meeting) => meeting.id === dialogMeetingId) ?? null;

  const selectedDay = useMemo(
    () => (selectedDayKey === null ? null : new Date(Number(selectedDayKey))),
    [selectedDayKey],
  );

  // The panel lists the day out of the SAME filtered rows the cells are drawn from, keyed the same
  // way, so "3 meetings" in the cell and the panel's list cannot disagree about what a day holds.
  const selectedDayMeetings = useMemo(() => {
    if (selectedDayKey === null) return EMPTY_MEETINGS;
    return visible
      .filter((meeting) => dayKey(meeting.occursAt) === selectedDayKey)
      .sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt));
  }, [visible, selectedDayKey]);

  /**
   * Clicking a day opens its panel; clicking the day that is already open closes it again.
   *
   * The toggle is the third way out, next to the close button and Escape — a selected cell that
   * does nothing when you click it again reads as stuck.
   */
  function toggleDay(date: Date) {
    const key = String(startOfDay(date));
    setSelectedDayKey((current) => (current === key ? null : key));
  }

  /** Picking a day in the sidebar re-anchors the visible calendar range. */
  function goToDay(date: Date) {
    setMonthAnchor(date);
    setSelectedDayKey(null);
  }

  function stepRange(delta: number) {
    setMonthAnchor((current) =>
      view === "week" ? shiftWeeks(current, delta) : addMonths(current, delta),
    );
    // The selected day belonged to the month you just left; keeping it would leave a panel open
    // describing a date that is no longer on the grid behind it.
    setSelectedDayKey(null);
  }

  /**
   * One rule for what a meeting row does, wherever it is drawn.
   *
   * The chip in the cell and the same meeting listed in the day panel go through this single
   * function, so the two cannot drift apart. It asks `hasFinished` — the ROOM's status — not
   * `timeState`: `missed` covers both a room that ended without you (a recap to read) and a slot
   * nobody ever opened (a room still sitting there), and those two want opposite destinations.
   */
  function openMeeting(meeting: TimedMeeting) {
    if (hasFinished(meeting)) setDialogMeetingId(meeting.id);
    else router.push(`/${workspaceSlug}/rooms/${meeting.id}`);
  }

  async function downloadArtifact(artifact: RoomHistoryArtifact) {
    if (!canDownloadArtifact(artifact)) {
      toast.error("This output is not ready to download.");
      return;
    }

    setBusyArtifactId(artifact.id);
    try {
      if (artifact.consentRequired) {
        await translationRoomService.approveArtifactConsent(artifact.id);
      }
      const { data } = await translationRoomService.artifactDownload(artifact.id);
      openArtifactDownload(data);
      if (artifact.consentRequired) await meetings.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not download this output."));
    } finally {
      setBusyArtifactId(null);
    }
  }

  // Compared against everything the months returned, not against the visible week: truncation
  // happens at the month fetch, so that is the number the server's total describes.
  const truncated = (meetings.data?.total ?? 0) > fetched.length;

  // bg-surface-1, the same white Meetings and Members open onto. A workspace page that brings
  // its own wash reads as bolted on from somewhere else.
  return (
    <main className="flex h-full flex-col bg-surface-1 text-ink">
      {/* No eyebrow, no 30px title, no description — the house rule in
          components/workspace/page-chrome. The route name is already in the top bar and the
          sidebar, so "Personal timeline / My meetings / Upcoming meetings you host..." was the
          same word three times with documentation living in the furniture. Meetings and Members
          open straight onto their content and this now does too. */}
      <header className="flex flex-col gap-3 border-b border-border px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <ScheduleMetricTabs counts={counts} filter={filter} onFilterChange={setFilter} />

        <div className="flex w-full items-center gap-2 lg:w-auto">
          {/* See history/page.tsx: one search affordance across the list pages. */}
          <ExpandingSearchDock
            value={query}
            onValueChange={setQuery}
            placeholder="Search title, code, or description"
            expandedWidth={300}
          />

          <div
            className="flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-2/60 p-0.5"
            role="tablist"
            aria-label="Calendar view"
          >
            {(["month", "week"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => {
                  setView(value);
                  // The panel is a month-view affordance; leaving its state set would spring it
                  // back open on the way back from the week.
                  setSelectedDayKey(null);
                }}
                className={cn(
                  "h-8 rounded px-3 text-[12px] font-medium capitalize transition-colors",
                  view === value
                    ? "bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* `relative`, so the day panel can fall back to an overlay INSIDE the calendar area rather
          than over the whole viewport: below xl it is positioned against this box, which leaves the
          workspace's own top bar and rail reachable while a day is open. */}
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden w-[290px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-surface-1 px-3 py-5",
            view === "week" && "lg:flex",
          )}
        >
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <button
                type="button"
                aria-label={view === "week" ? "Previous week" : "Previous month"}
                onClick={() => stepRange(-1)}
                className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <CaretLeft size={13} />
              </button>
              <span className="text-[12px] font-medium">
                {view === "week"
                  ? formatWeekRange(weekDays)
                  : monthAnchor.toLocaleDateString(APP_CALENDAR_LOCALE, { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                aria-label={view === "week" ? "Next week" : "Next month"}
                onClick={() => stepRange(1)}
                className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <CaretRight size={13} />
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface-1 p-1">
              <Calendar
                mode="single"
                month={monthAnchor}
                locale={enGB}
                weekStartsOn={1}
                onMonthChange={setMonthAnchor}
                onSelect={(date) => date && goToDay(date)}
                className="w-full p-0.5 [--cell-size:1.8rem]"
                classNames={{
                  month_caption: "hidden",
                  nav: "hidden",
                }}
                modifiers={{
                  hasMeeting: daysWithMeetings,
                  // In week view the calendar doubles as a position indicator: without this you
                  // cannot tell from it which seven days are on screen.
                  ...(view === "week" ? { inWeek: weekDays } : {}),
                }}
                modifiersClassNames={{
                  hasMeeting:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
                  inWeek: "bg-surface-2 text-ink rounded-none first:rounded-l-md last:rounded-r-md",
                }}
              />
            </div>
          </div>

          {meetings.isPartial ? (
            <p className="text-[10px] leading-4 text-amber-700">
              This week crosses two months and one of them failed to load, so some meetings may be
              missing.
            </p>
          ) : null}

          {truncated ? (
            <p className="text-[10px] leading-4 text-ink-subtle">
              Showing {fetched.length} of {meetings.data?.total} meetings in{" "}
              {view === "week" ? "these weeks' months" : "this month"}. Narrow the search to see the
              rest.
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {meetings.isLoading ? (
            <LoadingState />
          ) : meetings.isError && !meetings.isPartial ? (
            <ErrorState onRetry={() => meetings.refetch()} />
          ) : view === "week" ? (
            <WeekGrid
              days={weekDays}
              now={now}
              meetings={visible}
              workspaceSlug={workspaceSlug}
              onOpenPast={setDialogMeetingId}
              onNavigate={(id) => router.push(`/${workspaceSlug}/rooms/${id}`)}
            />
          ) : (
            <MonthGrid
              monthAnchor={monthAnchor}
              meetings={visible}
              hasQuery={Boolean(query)}
              selectedDayKey={selectedDayKey}
              onSelectDay={toggleDay}
              onOpenMeeting={openMeeting}
            />
          )}
        </div>

        {view === "month" && selectedDay ? (
          <DayDetailPanel
            day={selectedDay}
            meetings={selectedDayMeetings}
            workspaceSlug={workspaceSlug}
            narrowed={filter !== "all" || Boolean(query)}
            // Escape belongs to the topmost thing on screen. While the recap dialog is up it is
            // the dialog's key, and the panel must not close underneath it.
            closeOnEscape={!dialogMeeting}
            onOpenMeeting={openMeeting}
            onClose={() => setSelectedDayKey(null)}
          />
        ) : null}
      </div>

      <PastMeetingDialog
        meeting={dialogMeeting}
        workspaceSlug={workspaceSlug}
        busyArtifactId={busyArtifactId}
        open={Boolean(dialogMeeting)}
        onOpenChange={(open) => {
          if (!open) setDialogMeetingId(null);
        }}
        onDownload={downloadArtifact}
      />
    </main>
  );
}

function ScheduleMetricTabs({
  counts,
  filter,
  onFilterChange,
}: {
  counts: { all: number; upcoming: number; joined: number };
  filter: TimeFilter;
  onFilterChange: (filter: TimeFilter) => void;
}) {
  return (
    <div
      className="grid w-full grid-cols-3 gap-2 rounded-lg border border-border bg-surface-2/40 p-1 sm:max-w-[390px]"
      role="tablist"
      aria-label="Timeline filters"
    >
      {timeFilters.map((item) => {
        const value =
          item.value === "all"
            ? counts.all
            : item.value === "upcoming"
              ? counts.upcoming
              : counts.joined;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            onClick={() => onFilterChange(item.value)}
            className={cn(
              "min-w-0 rounded-md px-3 py-2 text-left transition-colors",
              filter === item.value
                ? "bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-ink-muted hover:bg-surface-1/60 hover:text-ink",
            )}
          >
            <span className="block truncate text-[10px] font-medium">{item.label}</span>
            <span className="mt-0.5 block text-[16px] font-semibold tabular-nums">{value}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The month, as a 7-column calendar grid (Google Calendar style).
 *
 * Renders the full 7-column matrix for the month regardless of whether meetings exist,
 * preserving the calendar grid layout even when 0 meetings are scheduled.
 */
function MonthGrid({
  monthAnchor,
  meetings,
  hasQuery,
  selectedDayKey,
  onSelectDay,
  onOpenMeeting,
}: {
  monthAnchor: Date;
  meetings: TimedMeeting[];
  hasQuery: boolean;
  selectedDayKey: string | null;
  onSelectDay: (day: Date) => void;
  onOpenMeeting: (meeting: TimedMeeting) => void;
}) {
  const monthDays = useMemo(() => {
    const start = startOfMonth(monthAnchor);
    const end = endOfMonth(monthAnchor);
    const startDate = new Date(start);
    const dayOfWeek = startDate.getDay();
    const offset = (dayOfWeek - 1 + 7) % 7;
    startDate.setDate(startDate.getDate() - offset);

    const days: Date[] = [];
    const current = new Date(startDate);
    while (days.length < 35 || (current <= end && days.length < 42)) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [monthAnchor]);

  const byDay = useMemo(() => {
    const map = new Map<string, TimedMeeting[]>();
    for (const meeting of meetings) {
      const key = dayKey(meeting.occursAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(meeting);
      else map.set(key, [meeting]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt));
    }
    return map;
  }, [meetings]);

  const todayKey = String(startOfDay(new Date()));
  const currentMonth = monthAnchor.getMonth();

  /**
   * How many chips fit, from the cell's REAL height.
   *
   * Measured on the first cell's list area and applied to all of them, because every row in this
   * grid is exactly as tall as every other: the rows are auto-sized, the cells all carry the same
   * `min-h-[110px]`, and the list is `flex-1` (`flex: 1 1 0%`) with `min-h-0`, so its content
   * contributes nothing to the row's own height. That last part is what makes the measurement
   * safe rather than circular — drawing more chips cannot make the box we just measured taller,
   * so there is no observe → grow → observe loop and no layout shift, only more of the cell used.
   */
  const [listRef, listHeight] = useMeasuredHeight();
  const chipsIfNoOverflow = fitsInList(listHeight, 0);
  const chipsWithOverflowRow = fitsInList(listHeight, MONTH_OVERFLOW_ROW_HEIGHT + MONTH_CHIP_GAP);

  return (
    <div className="flex h-full flex-col">
      {meetings.length === 0 ? (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-surface-2/30 px-4 py-2 text-center text-[11px] text-ink-muted">
          <FileText size={14} />
          {hasQuery
            ? "No meetings match this search."
            : "Nothing on your timeline this month. Upcoming invites and meetings you joined appear here."}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="grid h-full min-w-[860px] grid-cols-7 border-b border-border">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
            <div
              key={dayName}
              className="sticky top-0 z-10 border-b border-r border-border bg-surface-1/95 px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-ink-subtle backdrop-blur last:border-r-0"
            >
              {dayName}
            </div>
          ))}

          {monthDays.map((day, index) => {
            const key = String(startOfDay(day));
            const dayMeetings = byDay.get(key) ?? EMPTY_MEETINGS;
            const isToday = key === todayKey;
            const isSelected = key === selectedDayKey;
            const isCurrentMonth = day.getMonth() === currentMonth;

            // Everything fits, or it does not and the last row has to be spent on the count.
            const shown =
              dayMeetings.length <= chipsIfNoOverflow ? dayMeetings.length : chipsWithOverflowRow;
            const hiddenCount = dayMeetings.length - shown;

            return (
              <div
                key={key}
                className={cn(
                  "relative flex min-h-[110px] min-w-0 flex-col overflow-hidden border-b border-r border-border p-1.5 transition-colors last:border-r-0",
                  !isCurrentMonth && "bg-surface-2/30 text-ink-subtle",
                  // Selected and today are two different questions and must not answer in the same
                  // colour. Today is the primary ring it has always been; the selected day — the one
                  // the panel on the right is describing — is a heavier NEUTRAL ring, so a selected
                  // Tuesday cannot be misread as "today" from across the room. They are exclusive
                  // rather than stacked: on a day that is both, the filled primary date pill below
                  // still says "today", and one ring per cell keeps the grid lines even.
                  isSelected
                    ? "bg-ink/[0.05] ring-2 ring-inset ring-ink/55 dark:bg-ink/[0.10] dark:ring-ink/45"
                    : isToday
                      ? // Today has to be findable at a glance in a grid of 35 identical boxes, and
                        // the 4% wash it used to carry was invisible in both themes. The weight is
                        // in the inset ring rather than the fill: the ring reads as an outline at
                        // any distance, while the fill stays light enough that the rose/sky/emerald
                        // chips keep their own hue instead of sitting in a violet bath. Inset, so it
                        // draws inside the cell's own box and cannot escape overflow-hidden or
                        // thicken the grid lines it shares with its neighbours.
                        "bg-primary/[0.07] ring-1 ring-inset ring-primary/45 dark:bg-primary/[0.14] dark:ring-primary/55"
                      : null,
                )}
              >
                {/* The whole cell selects the day, as a real button filling it rather than an
                    onClick on the div: the chips above it are buttons too, and a <button> cannot
                    contain one. It sits underneath — the rows that follow are `relative`, so they
                    paint over it — and the content layers are pointer-transparent except for the
                    chips themselves, so a click on bare cell background lands here and a click on a
                    chip opens that meeting without either having to swallow the other's event. */}
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${formatDayHeading(day)}, ${describeCount(dayMeetings.length)}`}
                  onClick={() => onSelectDay(day)}
                  className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                />

                <div className="pointer-events-none relative flex h-5 shrink-0 items-center justify-between px-1">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-[11px] font-medium tabular-nums",
                      isToday
                        ? "bg-primary text-white"
                        : isCurrentMonth
                          ? "text-ink"
                          : "text-ink-subtle",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayMeetings.length > 0 ? (
                    <span className="text-[9px] tabular-nums text-ink-subtle">
                      {dayMeetings.length}
                    </span>
                  ) : null}
                </div>

                <div
                  // Measured on cell 0 only; see `chipsIfNoOverflow` above for why one reading
                  // describes every cell. `min-h-0` + `flex-1` is load-bearing, not decoration.
                  ref={index === 0 ? listRef : undefined}
                  className="pointer-events-none relative mt-1 min-h-0 flex-1 space-y-0.5 overflow-hidden"
                >
                  {dayMeetings.slice(0, shown).map((meeting) => (
                    <MonthChip
                      key={meeting.id}
                      meeting={meeting}
                      onOpen={() => onOpenMeeting(meeting)}
                    />
                  ))}
                  {hiddenCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => onSelectDay(day)}
                      aria-label={`Show all ${dayMeetings.length} meetings on ${formatDayHeading(day)}`}
                      className="pointer-events-auto block h-4 w-full cursor-pointer truncate rounded-sm px-1 text-left text-[9px] font-medium leading-4 text-ink-subtle outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      +{hiddenCount} more
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * One meeting on a month cell.
 *
 * A `<button>` rather than the clickable `<div>` this used to be, so a chip is tabbable and opens
 * on Enter like everything else on the page. `pointer-events-auto` puts it back on top of the
 * cell-wide select-this-day button it sits over — see the cell for why that layering exists.
 *
 * `h-5` is not free styling: `MONTH_CHIP_HEIGHT` is this number, and the cell counts chips with it.
 */
function MonthChip({ meeting, onOpen }: { meeting: TimedMeeting; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={meeting.title}
      className={cn(
        "group pointer-events-auto block h-5 w-full cursor-pointer overflow-hidden rounded-sm border px-1.5 text-left text-[10px] leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
        monthChipToneClass(meeting),
      )}
    >
      <div className="flex h-full min-w-0 items-center gap-1">
        <span
          className={cn(
            "truncate font-medium",
            meeting.status === "cancelled" && "text-ink-muted",
          )}
        >
          {meeting.title}
        </span>
        <span className="ml-auto shrink-0 text-[9px] tabular-nums text-ink-subtle">
          {formatTime(meeting.occursAt)}
        </span>
        {meeting.timeState === "live" && meeting.status !== "cancelled" ? (
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex size-1.5 rounded-full bg-rose-500/80 motion-safe:animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-rose-500" />
          </span>
        ) : null}
      </div>
    </button>
  );
}

/**
 * The selected day, in full, beside the grid — Outlook's day pane, not Google's overflow bubble.
 *
 * What was here before was a popover dropped BELOW the cell it came from, listing the whole day
 * while the cell's own chips stayed visible two centimetres above it: the same three meetings
 * printed twice, side by side, with the second copy floating over the days underneath. This is the
 * same list in a place where repeating the cell is not a repetition — the pane is understood as
 * "the day you selected, in detail", and the grid it details stays whole and untouched to its left.
 *
 * Rows are `WeekCard`s, the same component the week view builds a column out of. A detail pane
 * should say more than the chip it expands — the time, the host, the state badge, a Join button on
 * a live room — and the week view already had that row, so this cannot drift away from it either.
 */
function DayDetailPanel({
  day,
  meetings,
  workspaceSlug,
  narrowed,
  closeOnEscape,
  onOpenMeeting,
  onClose,
}: {
  day: Date;
  meetings: TimedMeeting[];
  workspaceSlug: string;
  /** A search or a filter chip is on, so an empty day may only be empty of MATCHING meetings. */
  narrowed: boolean;
  closeOnEscape: boolean;
  onOpenMeeting: (meeting: TimedMeeting) => void;
  onClose: () => void;
}) {
  const heading = formatDayHeading(day);

  useEffect(() => {
    if (!closeOnEscape) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeOnEscape, onClose]);

  return (
    <>
      {/* Below xl the pane covers part of the grid, so it needs a scrim to say so and to give the
          click-anywhere-out dismissal somewhere to land. At xl the pane is a real column and there
          is nothing to dim. */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 z-20 bg-ink/20 dark:bg-black/45 xl:hidden"
      />

      {/*
        The month grid asks for 860px before it starts scrolling sideways, and this pane costs 340.
        1180 of the two together is why the split becomes a real two-column layout at xl (1280) and
        not at lg (1024): at lg the pane would have taken a fifth of the grid's width away and left
        every month view permanently scrolling horizontally, which is a worse trade than an overlay.
        So below xl it is an overlay pinned to the right of the calendar area — a 380px drawer on a
        tablet, the full width on a phone, where 375px has no room for two things at once.

        It also stays CLOSED until a day is picked, in every size. Nothing is taken from the grid
        until somebody actually asks a question about a day.
      */}
      <aside
        aria-label={`Meetings on ${heading}`}
        className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[380px] flex-col border-l border-border bg-surface-1 shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-150 xl:static xl:z-auto xl:w-[340px] xl:max-w-none xl:shrink-0 xl:shadow-none xl:motion-safe:animate-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold text-ink">{heading}</h2>
            <p className="mt-0.5 text-[11px] text-ink-subtle">{describeCount(meetings.length)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close day details"
            className="-mr-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-ink-subtle outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X size={12} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {meetings.length ? (
            meetings.map((meeting) => (
              <WeekCard
                key={meeting.id}
                meeting={meeting}
                workspaceSlug={workspaceSlug}
                onOpen={() => onOpenMeeting(meeting)}
              />
            ))
          ) : (
            // An empty day still opens, and still says which kind of empty it is. A pane that went
            // blank would read as broken, and "nothing here" is a different fact from "nothing here
            // that matches what you typed".
            <div className="grid h-full place-items-center px-4 text-center">
              <div>
                <CalendarBlank size={20} className="mx-auto text-ink-subtle" />
                <p className="mt-2 text-[11px] font-medium text-ink-muted">
                  {narrowed ? "Nothing on this day matches" : "Nothing on this day"}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-ink-subtle">
                  {narrowed
                    ? "Clear the search or switch back to All to see everything booked here."
                    : "Meetings you host or are invited to will show up here."}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * The height of an element, kept current by a `ResizeObserver`.
 *
 * The first reading is taken synchronously inside the ref callback rather than waiting for the
 * observer: ref callbacks run in the commit phase, before paint, so the cells are drawn at their
 * measured size on the very first frame. The observer that follows is what keeps the count honest
 * when the window is resized, when the month goes from five rows to six, or when the "no meetings"
 * banner above the grid appears and takes a slice of the height away.
 */
function useMeasuredHeight() {
  const [height, setHeight] = useState<number | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setHeight(node.getBoundingClientRect().height);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setHeight(box.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}

/**
 * How many `MONTH_CHIP_HEIGHT` rows fit in `height`, once `reserved` pixels are spoken for.
 *
 * `reserved` is the "+N more" line: a cell that cannot show everything has to keep room for the
 * count, or the count is the thing that gets clipped and the day silently loses meetings again.
 * Returns the fallback while nothing has been measured yet, and never returns a negative.
 */
function fitsInList(height: number | null, reserved: number) {
  if (height === null) return MONTH_CELL_CHIP_FALLBACK;
  const usable = height - reserved + MONTH_CHIP_GAP;
  return Math.max(0, Math.floor(usable / (MONTH_CHIP_HEIGHT + MONTH_CHIP_GAP)));
}

/** "Tuesday, 8 September 2026" — the panel's title and the cells' accessible names. */
function formatDayHeading(day: Date) {
  return new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(day);
}

function describeCount(count: number) {
  if (count === 0) return "no meetings";
  return `${count} ${count === 1 ? "meeting" : "meetings"}`;
}

/**
 * The week, as seven columns.
 *
 * Deliberately NOT an hour-gridded day planner. A WarpTalk meeting is thirty minutes somewhere in
 * an eight-hour span, so a time-scaled grid is nine tenths empty rows and the meetings come out as
 * unreadable slivers. Columns of cards give the same answer — which day is heavy, which is free —
 * at a size you can actually read the title in.
 *
 * The empty columns are the content, not a gap to be hidden: a free Thursday is exactly what
 * somebody switches to this view to find, which is the one thing the scrolling agenda cannot show.
 */
function WeekGrid({
  days,
  now,
  meetings,
  workspaceSlug,
  onOpenPast,
  onNavigate,
}: {
  days: Date[];
  /** The same minute the page resolved `timeState` against — not a second reading of the clock. */
  now: Date | null;
  meetings: TimedMeeting[];
  workspaceSlug: string;
  onOpenPast: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, TimedMeeting[]>();
    for (const meeting of meetings) {
      const key = dayKey(meeting.occursAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(meeting);
      else map.set(key, [meeting]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt));
    }
    return map;
  }, [meetings]);

  const todayKey = String(startOfDay(new Date()));

  return (
    <div className="flex h-full flex-col">
      {/* Horizontal scroll rather than a responsive collapse: seven columns squeezed onto a phone
          stop being a week. Below lg the sidebar is already hidden, which buys most of the width. */}
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="grid h-full min-w-[860px] grid-cols-7">
          {days.map((day) => {
            const key = String(startOfDay(day));
            const dayMeetings = byDay.get(key) ?? EMPTY_MEETINGS;
            const isToday = key === todayKey;
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            // The column is sorted by start time, so "now" has an insertion point even without an
            // hour axis: before the first meeting that has not started. -1 means the whole day has
            // already begun, and the line belongs at the bottom. Null on every day that is not today.
            const nowIndex =
              isToday && now
                ? dayMeetings.findIndex((meeting) => Date.parse(meeting.occursAt) > now.getTime())
                : null;

            return (
              <div
                key={key}
                className={cn(
                  "flex min-w-0 flex-col border-r border-border last:border-r-0",
                  isWeekend && !isToday && "bg-surface-2/30",
                )}
              >
                <div
                  className={cn(
                    "sticky top-0 z-10 border-b border-border bg-surface-1/95 px-2 py-2 text-center backdrop-blur",
                    isToday && "bg-primary/[0.06]",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wide text-ink-subtle">
                    {day.toLocaleDateString(APP_CALENDAR_LOCALE, { weekday: "short" })}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-[15px] font-semibold tabular-nums",
                      isToday
                        ? "mx-auto grid size-6 place-items-center rounded-full bg-primary text-[12px] text-surface-1"
                        : "text-ink",
                    )}
                  >
                    {day.getDate()}
                  </div>
                </div>

                <div className="flex-1 space-y-1.5 p-1.5">
                  {dayMeetings.length === 0 ? (
                    nowIndex !== null && now ? (
                      <NowLine now={now} />
                    ) : (
                      <div className="pt-6 text-center text-[10px] text-ink-subtle/60">—</div>
                    )
                  ) : (
                    <>
                      {dayMeetings.map((meeting, index) => (
                        <Fragment key={meeting.id}>
                          {now && nowIndex === index ? <NowLine now={now} /> : null}
                          <WeekCard
                            meeting={meeting}
                            workspaceSlug={workspaceSlug}
                            onOpen={() =>
                              hasFinished(meeting)
                                ? onOpenPast(meeting.id)
                                : onNavigate(meeting.id)
                            }
                          />
                        </Fragment>
                      ))}
                      {now && nowIndex === -1 ? <NowLine now={now} /> : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {meetings.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-center text-[11px] text-ink-muted">
          Nothing on your timeline this week.
        </p>
      ) : null}
    </div>
  );
}

const MINUTE_MS = 60_000;

function subscribeToMinute(onChange: () => void) {
  const timer = setInterval(onChange, MINUTE_MS);
  return () => clearInterval(timer);
}

/**
 * The wall clock at minute resolution.
 *
 * Null on the server and through hydration, so the markup React checks matches what it rendered;
 * the line appears on the first client pass afterwards. The snapshot is a minute bucket rather than
 * a timestamp, so a tab left open re-renders once a minute instead of on every tick.
 */
function useNowMinute(): Date | null {
  const bucket = useSyncExternalStore(
    subscribeToMinute,
    () => Math.floor(Date.now() / MINUTE_MS),
    () => null,
  );

  return useMemo(() => (bucket === null ? null : new Date(bucket * MINUTE_MS)), [bucket]);
}

/**
 * Google Calendar's red "now" rule, adapted to a column that has no hour axis.
 *
 * It cannot sit at a clock position, because vertical space here is list order rather than time.
 * It sits at the boundary instead: everything above it has started, everything below has not. That
 * is the question the line actually answers on a page of thirty-minute meetings.
 */
function NowLine({ now }: { now: Date }) {
  const label = formatTime(now.toISOString());

  return (
    <div
      role="separator"
      aria-label={`Current time, ${label}`}
      className="flex items-center gap-1 py-0.5"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />
      <span className="h-px flex-1 bg-rose-500" />
      <span className="shrink-0 text-[9px] font-medium tabular-nums text-rose-600 dark:text-rose-400">
        {label}
      </span>
    </div>
  );
}

function WeekCard({
  meeting,
  workspaceSlug,
  onOpen,
}: {
  meeting: TimedMeeting;
  workspaceSlug: string;
  onOpen: () => void;
}) {
  // A cancelled meeting is not live, whatever the clock says about its slot: the pulsing dot and
  // the Join button are affordances for a room that is actually open.
  const isCancelled = meeting.status === "cancelled";
  const isLive = meeting.timeState === "live" && !isCancelled;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      title={meeting.title}
      className={cn(
        "cursor-pointer rounded-lg border px-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
        rowToneClass(meeting),
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium tabular-nums text-ink-muted">
          {formatTime(meeting.occursAt)}
        </span>
        <span
          className={cn(
            "ml-auto rounded px-1 py-0.5 text-[9px] font-medium capitalize",
            stateBadgeClass(meeting),
          )}
        >
          {stateBadgeLabel(meeting)}
        </span>
        {isLive ? (
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex size-1.5 rounded-full bg-rose-500/80 motion-safe:animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-rose-500" />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-ink",
          isCancelled && "text-ink-muted",
        )}
      >
        {meeting.title}
      </p>

      <p className="mt-0.5 truncate text-[9px] text-ink-subtle">{meeting.hostName}</p>

      {isLive ? (
        <Link
          href={`/${workspaceSlug}/rooms/${meeting.id}`}
          onClick={(event) => event.stopPropagation()}
          className="mt-1.5 flex h-6 items-center justify-center rounded border border-rose-500/30 bg-surface-1 text-[10px] font-medium text-rose-700 transition-colors hover:bg-rose-500/10"
        >
          Join
        </Link>
      ) : null}
    </div>
  );
}

function PastMeetingDialog({
  meeting,
  workspaceSlug,
  busyArtifactId,
  open,
  onOpenChange,
  onDownload,
}: {
  meeting: MyMeetingItem | null;
  workspaceSlug: string;
  busyArtifactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  if (!meeting) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px] gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase text-ink-subtle">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Past meeting
          </div>
          <DialogTitle className="mt-2 text-[20px] font-semibold leading-6">{meeting.title}</DialogTitle>
          <DialogDescription className="mt-2 text-[12px] leading-5 text-ink-muted">
            {meeting.description || "Quick access to the room summary and retained artifacts."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border pb-4">
            <Detail icon={CalendarBlank} label="When" value={formatDateTime(meeting.occursAt)} />
            <Detail icon={Clock} label="Duration" value={formatDuration(meeting.durationSeconds)} />
            <Detail icon={Users} label="Participants" value={String(meeting.participantCount)} />
            <Detail
              icon={Translate}
              label="Route"
              value={formatLanguageRoute(meeting.sourceLanguage, meeting.targetLanguages)}
            />
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-ink-subtle">
            <span className="rounded-full border border-border px-2 py-1">{meeting.translationRoomCode}</span>
            <span>Hosted by {meeting.hostName}</span>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold">Artifacts</h3>
            <span className="text-[10px] text-ink-subtle">{meeting.artifacts.length}</span>
          </div>

          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface-1/70">
            {meeting.artifacts.length ? (
              meeting.artifacts.map((artifact) => (
                <li key={artifact.id} className="px-3 py-3">
                  <button
                    type="button"
                    disabled={busyArtifactId === artifact.id || !canDownloadArtifact(artifact)}
                    onClick={() => onDownload(artifact)}
                    className="group flex w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-canvas">
                      <ArtifactIcon artifact={artifact} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">
                        {artifact.title || artifactLabel(artifact.type)}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-ink-subtle">
                        {artifactStatusLabel(artifact)}
                        {artifact.format ? ` · ${artifact.format.toUpperCase()}` : ""}
                        {artifact.createdAt ? ` · ${formatCompactDateTime(artifact.createdAt)}` : ""}
                      </span>
                    </span>
                    {busyArtifactId === artifact.id ? (
                      <SpinnerGap size={12} className="animate-spin text-ink-subtle" />
                    ) : canDownloadArtifact(artifact) ? (
                      <DownloadSimple
                        size={12}
                        className="text-ink-subtle transition-colors group-hover:text-ink"
                      />
                    ) : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-6 text-center text-[11px] text-ink-muted">
                No outputs retained for this meeting.
              </li>
            )}
          </ul>

          <Link
            href={`/${workspaceSlug}/rooms/${meeting.id}`}
            className="mt-4 flex h-9 w-full items-center justify-center rounded-md border border-border bg-canvas text-[11px] font-medium text-ink transition-colors hover:border-ink/30"
          >
            Open meeting
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 py-2 pr-3">
      <dt className="flex items-center gap-1.5 text-[10px] text-ink-subtle">
        <Icon size={12} />
        {label}
      </dt>
      <dd className="mt-1 truncate text-[11px] font-medium text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ArtifactIcon({ artifact }: { artifact: RoomHistoryArtifact }) {
  if (artifact.status === "processing") {
    return <SpinnerGap size={12} className="animate-spin text-ink-muted" />;
  }
  if (["failed", "missing", "expired"].includes(artifact.status)) {
    return <WarningCircle size={12} className="text-ink-muted" />;
  }
  if (artifact.consentRequired) {
    return <DownloadSimple size={12} className="text-ink-muted" />;
  }
  return <CheckCircle size={12} className="text-primary" />;
}

function LoadingState() {
  return (
    <div className="grid min-h-[420px] place-items-center">
      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
        <SpinnerGap size={15} className="animate-spin" />
        Loading your meetings
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[420px] place-items-center text-center">
      <div>
        <WarningCircle size={22} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-[12px] font-medium">Your meetings could not be loaded</p>
        <p className="mt-1 text-[11px] text-ink-muted">Check the translation-room service and try again.</p>
        <Button variant="outline" size="sm" className="mt-4 h-8" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function startOfDayDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Inclusive of the whole day — a range ending at midnight would drop that day's meetings. */
function endOfDayDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** "10 – 16 Aug 2026", or "31 Aug – 6 Sep 2026" when the week straddles two months. */
function formatWeekRange(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();

  const start = new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  }).format(first);
  const end = new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(last);

  return `${start} – ${end}`;
}

/**
 * Whether this meeting is still ahead of the viewer — the Upcoming bucket.
 *
 * `live` is in it because a meeting happening right now is the most "upcoming" thing there is.
 * `missed` is NOT, and that is the entire point of WT-538: this used to be `timeState !== "past"`,
 * which is why a room booked for last Tuesday and never opened was counted here forever.
 */
function isAhead(timeState: MeetingTimeState) {
  return timeState === "upcoming" || timeState === "live";
}

/**
 * Whether the room is over, and therefore has a recap to open instead of a room to enter.
 *
 * Asked of the ROOM's status, not of `timeState`: `missed` covers both a meeting that ended
 * without the viewer and a booked slot that never happened at all, and those two want opposite
 * destinations. The first has artifacts; the second still has a room sitting there unopened.
 */
function hasFinished(meeting: MyMeetingItem) {
  return !["scheduled", "waiting", "in_progress", "paused"].includes(meeting.status);
}

/**
 * WT-538 — amber is `missed`, and it is deliberately nothing like the other four.
 *
 * The palette is the whole signal on this page: rose is happening, sky is coming, emerald is you
 * were there, slate is called off. Amber had to be legible against all four at chip size, and it
 * had to avoid reading as a dimmer emerald or a warmer rose — a missed meeting confused for an
 * attended one is exactly the confusion this ticket exists to remove.
 *
 * And it is colour ONLY. No strike-through, on anything: `line-through` was removed from this file
 * in 8953691 at the user's request, and it does not come back for this state or any other.
 */
function rowToneClass(meeting: TimedMeeting) {
  if (meeting.status === "cancelled") {
    return "border-l-4 border-l-slate-400 border-border bg-surface-2/60 text-ink-muted hover:bg-surface-2";
  }
  if (meeting.timeState === "live") {
    return "border-l-4 border-l-rose-500 border-rose-500/25 bg-rose-500/10 text-rose-950 dark:text-rose-100 hover:bg-rose-500/20";
  }
  if (meeting.timeState === "upcoming") {
    return "border-l-4 border-l-sky-500 border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100 hover:bg-sky-500/20";
  }
  if (meeting.timeState === "missed") {
    return "border-l-4 border-l-amber-500 border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100 hover:bg-amber-500/20";
  }
  return "border-l-4 border-l-emerald-500 border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/20";
}

function monthChipToneClass(meeting: TimedMeeting) {
  if (meeting.status === "cancelled") {
    return "border-border bg-surface-2/60 text-ink-muted hover:bg-surface-2";
  }
  if (meeting.timeState === "live") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-950 dark:text-rose-100 hover:bg-rose-500/20";
  }
  if (meeting.timeState === "upcoming") {
    return "border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100 hover:bg-sky-500/20";
  }
  if (meeting.timeState === "missed") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100 hover:bg-amber-500/20";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/20";
}

/**
 * Cancellation outranks the clock, exactly as it already does in rowToneClass and
 * monthChipToneClass. Without this first branch a cancelled meeting wore a green "Joined" or a
 * blue "Upcoming" pill next to its own greyed-out title on a grey card — three signals, three
 * different answers to "what happened to this meeting?".
 *
 * That branch is also why a cancelled meeting resolving to `missed` changes nothing on screen: it
 * never reaches the state branches below. "Cancelled" is the more specific answer and it wins.
 */
function stateBadgeClass(meeting: TimedMeeting) {
  if (meeting.status === "cancelled") return "bg-surface-3 text-ink-muted";
  if (meeting.timeState === "live") return "bg-rose-500/10 text-rose-700";
  if (meeting.timeState === "upcoming") return "bg-sky-500/10 text-sky-700";
  if (meeting.timeState === "missed") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-emerald-500/10 text-emerald-700";
}

/** The label half of the same decision — kept beside the colour so the two cannot drift apart. */
function stateBadgeLabel(meeting: TimedMeeting) {
  if (meeting.status === "cancelled") return "Cancelled";
  if (meeting.timeState === "live") return "Live";
  if (meeting.timeState === "upcoming") return "Upcoming";
  // "Missed", not "Not attended": the shorter word is the one people use, and the badge has room
  // for one word. It says nothing about fault — a meeting that never happened is missed too.
  if (meeting.timeState === "missed") return "Missed";
  return "Joined";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompactDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  if (!seconds) return "0m";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
