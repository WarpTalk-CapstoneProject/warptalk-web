"use client";

import {
  Fragment,
  type ElementType,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  VideoCamera,
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
import { AgendaList, type AgendaListHandle } from "@/components/schedules/agenda-list";
import {
  AgendaSidebarCalendar,
  AgendaWeekStrip,
} from "@/components/schedules/agenda-navigator";
import { AgendaRow } from "@/components/schedules/agenda-row";
import { MeetingStateIcon } from "@/components/schedules/meeting-state-icon";
import { useMeetingsInRange } from "@/hooks/use-my-meetings";
import { agendaDayKey, type TimedMeeting } from "@/lib/meeting/agenda-sections";
import {
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
import { endOfMonth, shiftWeeks, startOfMonth, weekOf } from "@/lib/meeting/meeting-day";
import {
  meetingDisplayState,
  meetingStateLabel,
} from "@/lib/meeting/meeting-display-state";
import { resolveMeetingTimeState } from "@/lib/meeting/meeting-time-state";
import { formatLanguageRoute } from "@/lib/language/languages";
import { getErrorMessage } from "@/lib/api/errors";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { UserChip } from "@/components/user/user-chip";
import { cn } from "@/lib/utils";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { readScheduleFocus, schedulesPath } from "@/lib/workspace/workspace-routes";
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

/**
 * Agenda, month or week.
 *
 * Three views of the same rows, not three pages: the search box, the filter chips (and their
 * counts) and the popup all mean the same thing in each, and splitting them would have meant
 * maintaining that three times. The agenda answers "what do I have, and when" — the question most
 * people open a calendar with, so it is the default. A month answers "what does this stretch look
 * like"; a week answers "what am I doing on Thursday", which is the question a scrolling agenda is
 * worst at.
 *
 * The agenda shows exactly what the month does — one month, fetched with the same single request
 * under the same cache key — so switching between the two never costs a request or moves you.
 */
type CalendarView = "agenda" | "month" | "week";

const calendarViews: CalendarView[] = ["agenda", "month", "week"];

const timeFilters: Array<{ value: TimeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "joined", label: "Joined" },
];
const EMPTY_MEETINGS: TimedMeeting[] = [];
const APP_CALENDAR_LOCALE = "en-GB";

/**
 * How a month cell packs its rows — and why there are no pixel numbers here any more.
 *
 * There used to be a `MONTH_CELL_CHIP_LIMIT = 3` here, and it was a bug: the grid is `h-full` with
 * stretched rows, so a cell is whatever height the window gives it — 110px on a laptop, 250px on a
 * tall screen — while the constant stayed at three 20px chips. A cell twice as tall as it needed to
 * be still drew three rows and then "+4 more" under half a cell of white space.
 *
 * Its replacement measured the cell but still did the arithmetic with hard-coded chip, gap and
 * overflow-row heights (20 / 2 / 16) that agreed with `h-5`, `space-y-0.5` and `h-4` only by a
 * comment asking them to "stay in step". They did not always: a root font size other than 16px, a
 * zoom level, sub-pixel rounding — any drift between the constants and what the browser actually
 * laid out, and the list overflowed. The row that falls outside `overflow-hidden` is the LAST one,
 * which is always "+N more": a day whose badge said 10 drew two chips, half of a third, and no count
 * at all — the day silently lost eight meetings, the exact failure the count row exists to prevent.
 *
 * So both sides of the division are now read from the DOM. The list's height as before
 * (`useMeasuredHeight`), and one row's height plus the gap between two rows from a hidden copy of
 * the real `MonthChip` (`MonthRowProbe` / `useMonthRowMetrics`). "+N more" is drawn at exactly that
 * row height, so a cell is a column of identical slots and the count is one division — see
 * `slotsInList`. Nothing here has to be kept in step with a class, and a taller chip design changes
 * the count without anyone touching this block.
 *
 * That promise has now been cashed once: the chip became the Agenda's row at month scale — state
 * icon, time, title — and grew from 20px to 22px by changing this one class. The probe read the new
 * height, "+N more" took it with it, and the count adjusted without a second edit anywhere.
 */
const MONTH_ROW_HEIGHT_CLASS = "h-[22px]";

/**
 * The vertical rhythm of a cell's list. One constant because the probe must stack its two rows
 * exactly the way the real list does — the gap it reports is only true if it is the same class.
 */
const MONTH_ROW_STACK_CLASS = "space-y-0.5";

/**
 * How many slots (chips, or chips plus the "+N more" row) a cell uses before the first measurement
 * lands — server render and the first client paint.
 *
 * Three is what fits the 110px minimum cell at the default sizes, so the common case starts correct
 * and the measurement only ever adds rows. It counts the "+N more" row as a slot, so a busy day
 * paints two chips and the count, never three chips and a count pushed off the bottom. Never used
 * once a real height is in hand.
 */
const MONTH_CELL_SLOT_FALLBACK = 3;

/**
 * Float noise allowed when deciding whether one more slot fits.
 *
 * The readings are `getBoundingClientRect` floats of a layout done in 1/64px units, and once zoom
 * scales them a list that is exactly three rows tall can read as 65.99999 and lose a slot it has
 * room for. The allowance has to be bigger than that noise and SMALLER than one layout unit (1/64px,
 * less at high zoom): a real deficit is always at least one unit, so a thousandth of a pixel can
 * never admit a row that does not fit. A looser, rounder-looking 0.05 is not harmless: checked in a
 * real layout it let a row overhang the list by 0.05px whenever the list was one unit short.
 */
const MONTH_FIT_TOLERANCE_PX = 0.001;

export default function CalendarPage() {
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

  const [view, setView] = useState<CalendarView>("agenda");
  // One anchor for every view. Switching from week to month keeps you in the month you were
  // looking at, and switching back puts you in the week you left — a separate anchor per view
  // would silently teleport you to today on every toggle. The agenda's navigator moves this same
  // anchor, so paging it to October and switching to Month shows October.
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  /**
   * The day at the top of the agenda list, as the list reports it — the navigator marks it.
   *
   * Reported by the list rather than derived here, because only the list knows what it has
   * scrolled to. Left as it is when the view changes: the list reports afresh as soon as it mounts
   * again, and until then the navigator ignores a day outside the month (see `stripAnchor`).
   */
  const [agendaVisibleDay, setAgendaVisibleDay] = useState<Date | null>(null);
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

  /**
   * The agenda list's imperative handle — "scroll to the 18th", "point at this meeting".
   *
   * A callback ref rather than a plain object ref for the one request that can arrive while the
   * list is not mounted: a deep link landing on a failed fetch, where the error state stands in for
   * the list. That request waits here and is handed over the moment the list mounts again. The
   * list queues everything else for itself — a day or a row it has not drawn yet — see
   * `AgendaListHandle`.
   */
  const agendaRef = useRef<AgendaListHandle | null>(null);
  const pendingHighlightId = useRef<string | null>(null);
  const attachAgenda = useCallback((handle: AgendaListHandle | null) => {
    agendaRef.current = handle;
    const id = pendingHighlightId.current;
    if (handle && id) {
      pendingHighlightId.current = null;
      handle.highlightMeeting(id);
    }
  }, []);

  /**
   * "View in calendar" after a booking: `?date=2026-09-18&focus=<roomId>` (see `withScheduleFocus`).
   *
   * Read ONCE per link. The month and the view are adjusted here, during render — the same
   * adjust-state-from-input shape the create dialog uses for its edit fields — so the first frame
   * is already the booked month in the agenda, not today's month for one paint and then a jump.
   * The highlight and the URL cleanup are an effect further down, because both reach outside React.
   *
   * Keyed on the query string, and the key resets when the URL empties, so the same link followed
   * twice (the dialog is reachable from this very page) is honoured twice rather than swallowed as
   * "already applied".
   */
  const searchParams = useSearchParams();
  const focusRequest = useMemo(() => readScheduleFocus(searchParams), [searchParams]);
  const focusKey = focusRequest ? searchParams.toString() : null;
  const [appliedFocusKey, setAppliedFocusKey] = useState<string | null>(null);
  if (focusKey !== appliedFocusKey) {
    setAppliedFocusKey(focusKey);
    if (focusRequest) {
      if (focusRequest.date) setMonthAnchor(focusRequest.date);
      // The agenda whatever view was open: it is the one view that can point at a single row.
      setView("agenda");
      setSelectedDayKey(null);
    }
  }

  const weekDays = useMemo(() => weekOf(monthAnchor), [monthAnchor]);

  // The visible window. In agenda and month view this is exactly one month, so both resolve to the
  // same single request and the same cache entry — switching between them costs nothing. In week
  // view it is seven days, which may cost two requests when the week straddles a boundary.
  const [rangeFrom, rangeTo] = useMemo(() => {
    if (view === "week") {
      return [startOfDayDate(weekDays[0]), endOfDayDate(weekDays[6])] as const;
    }
    return [startOfMonth(monthAnchor), endOfMonth(monthAnchor)] as const;
  }, [view, weekDays, monthAnchor]);

  const meetings = useMeetingsInRange(activeWorkspaceId, rangeFrom, rangeTo, query);
  const fetched = meetings.data?.meetings ?? EMPTY_MEETINGS;

  /**
   * The deep link's second half, once the render above has moved to its month and to the agenda.
   *
   * The list is mounted by now (child refs attach before a parent's effects run), so the highlight
   * normally goes straight to it and the list holds it until the row is drawn. `handledFocusKey`
   * keeps this to one pass per link: `meetings` is a new object every render, and without the
   * guard each of those renders would refetch and re-highlight until the URL finished clearing.
   */
  const handledFocusKey = useRef<string | null>(null);
  useEffect(() => {
    if (focusKey === null) {
      handledFocusKey.current = null;
      return;
    }
    if (!focusRequest || handledFocusKey.current === focusKey) return;
    handledFocusKey.current = focusKey;

    if (focusRequest.roomId) {
      if (agendaRef.current) agendaRef.current.highlightMeeting(focusRequest.roomId);
      else pendingHighlightId.current = focusRequest.roomId;
      // The booking is seconds old, and this month may be in the cache from a visit less than a
      // minute ago — fresh by the query's staleTime, and without the new meeting in it. The create
      // mutations invalidate the meetings LIST's key, not this one, so ask for the month again;
      // the list keeps the highlight waiting until the row arrives.
      if (activeWorkspaceId) void meetings.refetch();
    }
    // Replace, not push: the params were a one-time instruction. A reload or a Back must not land
    // on them again and flash the row a second time. No scroll — the agenda owns its own.
    router.replace(schedulesPath(workspaceSlug), { scroll: false });
  }, [focusKey, focusRequest, activeWorkspaceId, meetings, router, workspaceSlug]);

  // The months are fetched whole, so a week view holds up to two months of rows it must not show.
  // Agenda and month fetch exactly the month they draw, so they take the rows as they come.
  const windowed = useMemo(() => {
    if (view !== "week") return fetched;
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
  // Unfiltered for the agenda's navigator for the same reason — a dot that vanished when Joined
  // was on would hide the very day you went looking for.
  const daysWithMeetings = useMemo(
    () => fetched.map((meeting) => new Date(meeting.occursAt)),
    [fetched],
  );

  // Every day that holds a meeting BEFORE the filter chips, so an agenda day the chip emptied can
  // say "Nothing here matches this filter" instead of "No meetings" — the second would tell you
  // your Tuesday is free when it is not. Keyed with `agendaDayKey`, as the list keys its days.
  const dayKeysWithAnyMeeting = useMemo(
    () => new Set(windowed.map((meeting) => agendaDayKey(meeting.occursAt))),
    [windowed],
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
      .filter((meeting) => agendaDayKey(meeting.occursAt) === selectedDayKey)
      .sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt));
  }, [visible, selectedDayKey]);

  /**
   * Clicking a day opens its panel; clicking the day that is already open closes it again.
   *
   * The toggle is the third way out, next to the close button and Escape — a selected cell that
   * does nothing when you click it again reads as stuck.
   */
  function toggleDay(date: Date) {
    const key = agendaDayKey(date);
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
   * The chip in the cell, the same meeting listed in the day panel and its row in the agenda all
   * go through this single function, so they cannot drift apart. It asks `hasFinished` — the
   * ROOM's status — not `timeState`: `missed` covers both a room that ended without you (a recap
   * to read) and a slot nobody ever opened (a room still sitting there), and those two want
   * opposite destinations.
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

  // The notices the sidebar carries under its calendar, in whichever sidebar is showing: the
  // agenda's navigator renders them as its children, the week sidebar inline. One element, so the
  // two cannot word the same warning differently.
  const rangeNotices = (
    <>
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
    </>
  );

  // Only a failure with nothing to show replaces the content. Checked before the views because the
  // agenda does not unmount for loading (see below), so "loading" can no longer be the first branch
  // for all three.
  const showError = meetings.isError && !meetings.isPartial && !meetings.isLoading;

  // bg-surface-1, the same white Meetings and Members open onto. A workspace page that brings
  // its own wash reads as bolted on from somewhere else.
  return (
    <main className="flex h-full flex-col bg-surface-1 text-ink">
      {/* No eyebrow, no 30px title, no description — the house rule in
          components/workspace/page-chrome. The route name is already in the top bar and the
          sidebar, so "Personal timeline / My meetings / Upcoming meetings you host..." was the
          same word three times with documentation living in the furniture. Meetings and Members
          open straight onto their content and this now does too.

          The header is the same in every view: the chips count and filter the agenda exactly as
          they do the grids. No summary line and no status legend beside them — both were tried in
          the agenda design and rejected, because the chips already say the counts and a second
          place saying them is how two numbers come to disagree. */}
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

          {/* Beside the switch that brings it, so it reads as part of the Month view rather than
              as a page-wide key that vanishes for no reason when you switch away. */}
          {view === "month" ? <MonthRelationLegend /> : null}

          <div
            className="flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-2/60 p-0.5"
            role="tablist"
            aria-label="Calendar view"
          >
            {calendarViews.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => {
                  setView(value);
                  // The panel is a month-view affordance; leaving its state set would spring it
                  // back open on the way back from the agenda or the week.
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

      {/* The agenda's navigator on narrow screens: a week strip between the header and the list,
          because below lg there is no sidebar to hold the month. It hides itself at lg, where the
          sidebar below takes over — the two never show at once. */}
      {view === "agenda" ? (
        <AgendaWeekStrip
          month={monthAnchor}
          daysWithMeetings={daysWithMeetings}
          visibleDay={agendaVisibleDay}
          today={now}
          onMonthChange={setMonthAnchor}
          onPickDay={(day) => agendaRef.current?.scrollToDay(day, { smooth: true })}
        />
      ) : null}

      {/* `relative`, so the day panel can fall back to an overlay INSIDE the calendar area rather
          than over the whole viewport: below xl it is positioned against this box, which leaves the
          workspace's own top bar and rail reachable while a day is open. */}
      <div className="relative flex min-h-0 flex-1">
        {view === "agenda" ? (
          // Picking a day scrolls the list; it moves the month only when the day is in another
          // one, and then the navigator fires `onMonthChange` first — so the scroll request
          // reaches a list that is already switching month, which holds it until the day is drawn.
          <AgendaSidebarCalendar
            month={monthAnchor}
            daysWithMeetings={daysWithMeetings}
            visibleDay={agendaVisibleDay}
            today={now}
            onMonthChange={setMonthAnchor}
            onPickDay={(day) => agendaRef.current?.scrollToDay(day, { smooth: true })}
          >
            {rangeNotices}
          </AgendaSidebarCalendar>
        ) : (
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

            {rangeNotices}
          </aside>
        )}

        {/* ONE scroll container per view. The grids scroll here; the agenda list owns its own
            scroller — its sticky week headers, scroll spy and scroll-to-day all measure against
            it — so in the agenda this box must clip instead, or the two would nest and the outer
            one would steal the wheel. */}
        <div
          className={cn(
            "min-w-0 flex-1",
            view === "agenda" ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {showError ? (
            <ErrorState onRetry={() => meetings.refetch()} />
          ) : view === "agenda" ? (
            // The list stays MOUNTED while a month loads, under the same loading screen the grids
            // show in its place. It has to: picking the 3rd of next month asks it to change month
            // and scroll in one tick, and a deep link asks it to highlight a row the refetch has
            // not brought yet. It holds both until the rows arrive — which it cannot do if the
            // loading state unmounts it and a fresh list mounts on the 1st.
            <div className="relative h-full" aria-busy={meetings.isLoading}>
              <div className="h-full" inert={meetings.isLoading}>
                <AgendaList
                  ref={attachAgenda}
                  month={monthAnchor}
                  meetings={visible}
                  dayKeysWithAnyMeeting={dayKeysWithAnyMeeting}
                  now={now}
                  workspaceSlug={workspaceSlug}
                  onOpenMeeting={openMeeting}
                  onVisibleDayChange={setAgendaVisibleDay}
                />
              </div>
              {meetings.isLoading ? (
                <div className="absolute inset-0 z-20 bg-surface-1">
                  <LoadingState />
                </div>
              ) : null}
            </div>
          ) : meetings.isLoading ? (
            <LoadingState />
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
 * The key to the month chips' fill: filled is a meeting you host, outlined one you were invited to.
 *
 * Month only. A week card spells its relation out in a pill and an agenda row in words ("You host",
 * "Invited by …"), so a legend in either would be a caption for words already on screen; a 22px
 * month row has no room for the word, and the fill is its only mark. The swatches are grey on
 * purpose — the hue belongs to the state palette, and a sky or emerald swatch here would read as
 * "sky means host". Grey says the fill is the point, not the colour. The opacities are the chips'
 * own (a 25% border behind a 10% fill; a 60% outline), in ink.
 *
 * Hidden below md: this row also holds the search, which opens to 300px, and the view switch, and
 * on a phone-to-small-tablet width the three do not fit side by side. The chips' tooltips and
 * accessible names still carry the relation there.
 */
function MonthRelationLegend() {
  return (
    <ul
      aria-label="Chip legend"
      className="mr-1 hidden shrink-0 items-center gap-3 text-[10px] text-ink-subtle md:flex"
    >
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm border border-ink/25 bg-ink/10" />
        You host
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-sm border border-ink/60 bg-transparent" />
        {"You're invited"}
      </li>
    </ul>
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
      const key = agendaDayKey(meeting.occursAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(meeting);
      else map.set(key, [meeting]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt));
    }
    return map;
  }, [meetings]);

  const todayKey = agendaDayKey(new Date());
  const currentMonth = monthAnchor.getMonth();

  /**
   * How much room a cell has for rows, from the cell's REAL height.
   *
   * Measured on the first cell's list area and applied to all of them, because every row in this
   * grid is exactly as tall as every other: the rows are auto-sized, the cells all carry the same
   * `min-h-[110px]`, and the list is `flex-1` (`flex: 1 1 0%`) with `min-h-0`, so its content
   * contributes nothing to the row's own height. That last part is what makes the measurement
   * safe rather than circular — drawing more chips cannot make the box we just measured taller,
   * so there is no observe → grow → observe loop and no layout shift, only more of the cell used.
   */
  const [listRef, listHeight] = useMeasuredHeight();

  /**
   * The other half of the division: one real row and one real gap, from `MonthRowProbe`.
   *
   * The probe is a copy of an actual `MonthChip`, so whatever the chip's classes say — today's 22px
   * agenda-style row, or a taller one later — is what gets counted. It is absolutely positioned
   * inside cell 0's list, so it takes no space from the cell and cannot feed the height it is being
   * divided into: the probe's size depends only on the chip's own styling, the list's only on the
   * grid row. Neither measurement moves the other, so there is still no measure → grow → measure
   * loop.
   *
   * It needs a meeting to render, and any one will do — every chip is the same height whatever its
   * state or relation. With no meetings there is nothing to count and the probe is simply absent.
   */
  const [probeRef, rowMetrics] = useMonthRowMetrics();
  const probeMeeting = meetings[0] ?? null;
  const slots = slotsInList(listHeight, rowMetrics);

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
            const key = agendaDayKey(day);
            const dayMeetings = byDay.get(key) ?? EMPTY_MEETINGS;
            const isToday = key === todayKey;
            const isSelected = key === selectedDayKey;
            const isCurrentMonth = day.getMonth() === currentMonth;

            // Everything fits, or it does not and the last slot is spent on the count. Slots are
            // all one height, so "the count takes a slot" is exact rather than a second estimate.
            // `slots` is never below 1, so a cell with room for one row shows only "+N more".
            const shown = dayMeetings.length <= slots ? dayMeetings.length : slots - 1;
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
                  // Measured on cell 0 only; see `listHeight` above for why one reading
                  // describes every cell. `min-h-0` + `flex-1` is load-bearing, not decoration.
                  ref={index === 0 ? listRef : undefined}
                  className="pointer-events-none relative mt-1 min-h-0 flex-1 overflow-hidden"
                >
                  {index === 0 && probeMeeting ? (
                    <MonthRowProbe ref={probeRef} meeting={probeMeeting} />
                  ) : null}

                  {/* The rows sit in their own stack rather than directly in the measured box, so
                      the probe beside them is not one of the stack's children: `space-y` spaces
                      children by position (`> :not(:last-child)`), and an extra child — even an
                      absolutely positioned one — would change which row counts as the last. */}
                  <div className={MONTH_ROW_STACK_CLASS}>
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
                        // Exactly one chip tall, and that is what makes the count a slot like any
                        // other. The class gives it the chip's height before anything is measured;
                        // once the probe has read the real chip, the inline height pins it to that
                        // reading, so even a chip whose height comes from its content later cannot
                        // leave this row a pixel taller than the slot reserved for it.
                        style={rowMetrics ? { height: rowMetrics.height } : undefined}
                        className={cn(
                          "pointer-events-auto flex w-full cursor-pointer items-center rounded-sm px-1 text-left text-[11px] font-medium text-ink-subtle outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40",
                          MONTH_ROW_HEIGHT_CLASS,
                        )}
                      >
                        <span className="truncate">+{hiddenCount} more</span>
                      </button>
                    ) : null}
                  </div>
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
 * One meeting on a month cell — the Agenda's row, at month scale.
 *
 * Icon · time · title, in the order the agenda reads them, so switching views does not ask the eye
 * to learn a second layout for the same meeting: the state glyph (`MeetingStateIcon`, 12px), the
 * start time in the time column's mono face, then the title taking whatever width is left and
 * truncating. The time moved to the front from the far end, where a long title pushed it out of a
 * 120px cell first — and the time is the half of a month row people actually scan for.
 *
 * What stays the chip's own is its box: filled for "you host", outlined for "you were invited", in
 * the WT-538 hue of its state (`monthChipToneClass`). The agenda row can drop the box because a
 * list has room to say "You host" in words; a 22px cell row has room for nothing but the fill.
 *
 * A `<button>` rather than the clickable `<div>` this used to be, so a chip is tabbable and opens
 * on Enter like everything else on the page. `pointer-events-auto` puts it back on top of the
 * cell-wide select-this-day button it sits over — see the cell for why that layering exists.
 *
 * Its height is free styling: the cell counts chips by measuring a hidden copy of this very
 * component (`MonthRowProbe`), so the move to 22px changed `MONTH_ROW_HEIGHT_CLASS` and nothing
 * else. The icon is decorative here; the state, like the relation, is spoken by the chip's own
 * accessible name, because neither a glyph nor a fill is something a screen reader can announce.
 */
function MonthChip({ meeting, onOpen }: { meeting: TimedMeeting; onOpen: () => void }) {
  const relation = relationLabel(meeting);
  const time = formatTime(meeting.occursAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${meeting.title} · ${relation}`}
      aria-label={`${meeting.title}, ${time}, ${meetingStateLabel(meeting)}, ${relation}`}
      className={cn(
        "group pointer-events-auto flex w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-sm border px-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
        MONTH_ROW_HEIGHT_CLASS,
        monthChipToneClass(meeting),
      )}
    >
      <MeetingStateIcon meeting={meeting} size={12} />
      <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-ink-muted">
        {time}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-[12px] leading-4",
          isHostedByViewer(meeting) ? "font-semibold" : "font-normal",
          meeting.status === "cancelled" && "text-ink-muted",
        )}
      >
        {meeting.title}
      </span>
    </button>
  );
}

/**
 * Two real `MonthChip`s, stacked the way a cell stacks them, that nobody can see or reach.
 *
 * This is the ruler the month grid counts with (see `useMonthRowMetrics`). It renders the actual
 * component rather than a look-alike so it cannot drift from it: any change to the chip's height,
 * border or padding is a change to the probe by construction. Two rows rather than one because the
 * gap is only observable BETWEEN two rows — reading it off the class would be the constant again.
 *
 * `invisible` keeps its layout box (so it can be measured) while painting nothing and taking no
 * clicks; `absolute` keeps it out of the cell's flow; `inert` and `aria-hidden` keep its buttons out
 * of the tab order and out of the accessibility tree, so a screen reader never meets a phantom copy
 * of somebody's meeting.
 */
function MonthRowProbe({ ref, meeting }: { ref: Ref<HTMLDivElement>; meeting: TimedMeeting }) {
  return (
    <div
      ref={ref}
      aria-hidden
      inert
      className={cn("invisible absolute inset-x-0 top-0", MONTH_ROW_STACK_CLASS)}
    >
      <MonthChip meeting={meeting} onOpen={noop} />
      <MonthChip meeting={meeting} onOpen={noop} />
    </div>
  );
}

function noop() {}

/**
 * The selected day, in full, beside the grid — Outlook's day pane, not Google's overflow bubble.
 *
 * What was here before was a popover dropped BELOW the cell it came from, listing the whole day
 * while the cell's own chips stayed visible two centimetres above it: the same three meetings
 * printed twice, side by side, with the second copy floating over the days underneath. This is the
 * same list in a place where repeating the cell is not a repetition — the pane is understood as
 * "the day you selected, in detail", and the grid it details stays whole and untouched to its left.
 *
 * Rows are `AgendaRow`s, the same component the Agenda view lists a day with. A detail pane should
 * say more than the chip it expands — the time, the host, the head count and the route, a Join
 * button on a live room — and the agenda already had that row, so this cannot drift away from it.
 * It was the week view's `WeekCard` until the agenda design: a column of tinted, bordered cards
 * with two pills each is a wall in which nothing stands out, and the pane is a list, not a column.
 * The week keeps its cards; a seven-column grid is where a box per meeting earns its border.
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {meetings.length ? (
            <ul className="space-y-0.5">
              {meetings.map((meeting) => (
                <li key={meeting.id}>
                  <AgendaRow
                    meeting={meeting}
                    workspaceSlug={workspaceSlug}
                    onOpen={() => onOpenMeeting(meeting)}
                  />
                </li>
              ))}
            </ul>
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

/** One month-cell row as the browser actually laid it out: its height, and the space below it. */
type MonthRowMetrics = { height: number; gap: number };

/**
 * The real height of one chip row and the real gap between two, read off `MonthRowProbe`.
 *
 * Border boxes from `getBoundingClientRect`, not the observer's `contentRect`: the chip has a
 * border, and the content box would under-report every row by two pixels — the very kind of drift
 * this replaces. The gap is taken as the distance between the two probe rows rather than from a
 * computed margin, so it stays right however the stack happens to implement its spacing.
 *
 * Same timing as `useMeasuredHeight`: a synchronous first reading in the ref callback, so the
 * first painted frame already uses it, then a `ResizeObserver` for anything that changes the
 * chip's size later — a root font-size change resizes the probe, and the probe reports it. A
 * reading equal to the last one keeps the previous object, so width-only resizes do not re-render
 * the grid.
 */
function useMonthRowMetrics() {
  const [metrics, setMetrics] = useState<MonthRowMetrics | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const read = () => {
      const first = node.children[0];
      const second = node.children[1];
      if (!first || !second) return;
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      const next = { height: a.height, gap: Math.max(0, b.top - a.bottom) };
      setMetrics((current) =>
        current && current.height === next.height && current.gap === next.gap ? current : next,
      );
    };

    read();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, metrics] as const;
}

/**
 * How many equal slots a cell's list holds: `floor((list + gap) / (row + gap))`.
 *
 * A slot is one chip OR the "+N more" row — they are drawn at the same height precisely so this
 * can be one division. n rows take `n·row + (n−1)·gap`, which is where the `+ gap` on top comes
 * from: the last row has no gap after it.
 *
 * Never below 1. A cell squeezed below a single row still owes the reader the count, and "+N more"
 * alone is the honest thing to draw there; zero slots would draw nothing and lose the whole day.
 * Returns the fallback until both the list and a row have been measured.
 */
function slotsInList(listHeight: number | null, row: MonthRowMetrics | null) {
  if (listHeight === null || row === null || row.height <= 0) return MONTH_CELL_SLOT_FALLBACK;
  const slots = Math.floor(
    (listHeight + row.gap + MONTH_FIT_TOLERANCE_PX) / (row.height + row.gap),
  );
  return Math.max(1, slots);
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
      const key = agendaDayKey(meeting.occursAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(meeting);
      else map.set(key, [meeting]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt));
    }
    return map;
  }, [meetings]);

  const todayKey = agendaDayKey(new Date());

  return (
    <div className="flex h-full flex-col">
      {/* Horizontal scroll rather than a responsive collapse: seven columns squeezed onto a phone
          stop being a week. Below lg the sidebar is already hidden, which buys most of the width. */}
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="grid h-full min-w-[860px] grid-cols-7">
          {days.map((day) => {
            const key = agendaDayKey(day);
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
  // the Join button are affordances for a room that is actually open. `meetingDisplayState` is
  // where cancellation outranks the clock, for this card and every other row on the page.
  const displayState = meetingDisplayState(meeting);
  const isCancelled = displayState === "cancelled";
  const isLive = displayState === "live";
  const relation = relationLabel(meeting);

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
      title={`${meeting.title} · ${relation}`}
      className={cn(
        "cursor-pointer rounded-lg border px-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
        rowToneClass(meeting),
      )}
    >
      {/* Both levels wrap. A week column on a laptop is ~120px wide, and time + "You host" +
          "Upcoming" is wider than that; without wrapping the pills would run out past the card's
          border. So the pill group drops under the time when it has to, and splits into its own
          lines when even that is too narrow — always right-aligned, never overflowing. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-[10px] font-medium tabular-nums text-ink-muted">
          {formatTime(meeting.occursAt)}
        </span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-medium",
              relationPillClass(meeting),
            )}
          >
            {relation}
          </span>
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[9px] font-medium capitalize",
              stateBadgeClass(meeting),
            )}
          >
            {meetingStateLabel(meeting)}
          </span>
          {isLive ? (
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inline-flex size-1.5 rounded-full bg-rose-500/80 motion-safe:animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-rose-500" />
            </span>
          ) : null}
        </span>
      </div>

      <p
        className={cn(
          "mt-1 line-clamp-2 text-[11px] leading-snug text-ink",
          isHostedByViewer(meeting) ? "font-semibold" : "font-normal",
          isCancelled && "text-ink-muted",
        )}
      >
        {meeting.title}
      </p>

      {/* The card is itself clickable, so the chip renders a span and swallows the click: opening
          someone's card must not also select the meeting behind it. */}
      <div className="mt-0.5 flex min-w-0 text-[9px] text-ink-subtle">
        <UserChip
          user={{ userId: meeting.hostId, name: meeting.hostName, role: "Host" }}
          variant="text"
          size="sm"
          showAvatar={false}
          className="text-[9px] text-ink-subtle"
        />
      </div>

      {isLive ? (
        <Link
          href={`/${workspaceSlug}/rooms/${meeting.id}`}
          onClick={(event) => event.stopPropagation()}
          className="mt-1.5 flex h-6 items-center justify-center rounded border border-rose-500/30 bg-surface-1 text-[10px] font-medium text-rose-700 transition-colors hover:bg-rose-500/10"
        >
          Join
        </Link>
      ) : null}

      {isGoogleMeetMeeting(meeting) ? (
        <a
          href={meeting.externalMeetingUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="mt-1 inline-flex max-w-full items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-emerald-700"
        >
          <VideoCamera size={10} />
          <span className="truncate">Google Meet</span>
        </a>
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
  /**
   * WT-664 — where focus lands when the dialog opens, now that the body scrolls.
   *
   * Base UI focuses the first tabbable element by default, which here is the "Hosted by"
   * chip in the middle of the body. The browser scrolls a focused element into view, so the
   * dialog opened 319px down its own description — the reader was dropped into the middle of
   * a sentence. Harmless while nothing scrolled; not harmless now.
   *
   * Declared above the `!meeting` guard: a hook below an early return runs a different number
   * of times on the two renders, which is React error #310.
   */
  const bodyRef = useRef<HTMLDivElement>(null);

  if (!meeting) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * WT-664 — three bands, and only the middle one is allowed to grow.
       *
       * `DialogContent` is `fixed top-1/2 -translate-y-1/2` with no height of its own, so it is
       * exactly as tall as whatever is inside it. A meeting description is arbitrary user text
       * (a TipTap field with Markdown enabled — agendas, lists, links), and one long one made
       * this popup 958px tall inside an 800px window: the title overflowed above the top edge,
       * the artifacts below the bottom one, and NEITHER could be reached. The page behind a
       * fixed popup does not scroll, so the only way to read the rest was to zoom the browser
       * out, which is what the reporter had to do.
       *
       * The bound therefore belongs on the dialog (85dvh), and the scroll belongs on the band
       * that holds the unbounded content. The title stays pinned so you always know which
       * meeting you are reading, and "Open meeting" stays pinned so a long description can
       * never push the only action off the bottom.
       */}
      <DialogContent
        initialFocus={bodyRef}
        className="flex max-h-[85dvh] max-w-[620px] flex-col gap-0 p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase text-ink-subtle">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Past meeting
          </div>
          {/* break-words, here and on the description: an unbroken string — a pasted URL, a
              token — has no space to wrap at, and would otherwise widen the popup instead of
              wrapping inside it. */}
          <DialogTitle className="mt-2 break-words text-[20px] font-semibold leading-6">
            {meeting.title}
          </DialogTitle>
        </DialogHeader>

        {/* min-h-0 is what makes flex-1 shrinkable: without it a flex child refuses to go below
            its content height and the scrollbar never appears. */}
        <div
          ref={bodyRef}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 outline-none"
        >
          {/* Moved out of the header and into the scrolling band — it is the part that grows.
              whitespace-pre-wrap keeps the line breaks the author typed; without it an agenda
              written over twenty lines arrives as one wall of text. */}
          <DialogDescription className="whitespace-pre-wrap break-words text-[12px] leading-5 text-ink-muted">
            {meeting.description || "Quick access to the room summary and retained artifacts."}
          </DialogDescription>

          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border pb-4">
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
            <span className="flex items-center gap-1">
              Hosted by{" "}
              <UserChip
                user={{ userId: meeting.hostId, name: meeting.hostName, role: "Host" }}
                variant="text"
                size="sm"
                showAvatar={false}
                className="text-[10px] text-ink-subtle"
              />
            </span>
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
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4">
          <Link
            href={`/${workspaceSlug}/rooms/${meeting.id}`}
            className="flex h-9 w-full items-center justify-center rounded-md border border-border bg-canvas text-[11px] font-medium text-ink transition-colors hover:border-ink/30"
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

function isGoogleMeetMeeting(meeting: MyMeetingItem) {
  return (
    meeting.externalProvider?.toUpperCase() === "GOOGLE_MEET" &&
    Boolean(meeting.externalMeetingUrl)
  );
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
 *
 * The hue answers "what state is this meeting in". Whether the viewer HOSTS it or was merely
 * INVITED is a second question, and it gets a second visual variable rather than a second set of
 * colours: filled for host (the tinted background in the state hue, the title in semibold),
 * outline for invited (a transparent card with its border in the state hue, the title at normal
 * weight). Two variables that vary independently can be read independently — a sky outline is
 * "upcoming, invited" at a glance — whereas five more hues for the relation would have made the
 * palette above unlearnable. Cancelled keeps its slate and still splits the same way, so the one
 * rule holds on every card. The words ("You host" / "Invited") travel with the fill in the card's
 * pill and the chip's accessible name, so none of this is colour-only for a screen reader.
 *
 * Which state a row shows comes from `meetingDisplayState` — cancellation first, then the clock —
 * the one rule the badge, the state icon and both tone functions here all ask, rather than each
 * re-spelling the `status === "cancelled"` branch for itself.
 */
function rowToneClass(meeting: TimedMeeting) {
  const hosted = isHostedByViewer(meeting);
  const state = meetingDisplayState(meeting);
  if (state === "cancelled") {
    return hosted
      ? "border-l-4 border-l-slate-400 border-border bg-surface-2/60 text-ink-muted hover:bg-surface-2"
      : "border-l-4 border-l-slate-400 border-slate-400/60 bg-transparent text-ink-muted hover:bg-surface-2/60";
  }
  if (state === "live") {
    return hosted
      ? "border-l-4 border-l-rose-500 border-rose-500/25 bg-rose-500/10 text-rose-950 dark:text-rose-100 hover:bg-rose-500/20"
      : "border-l-4 border-l-rose-500 border-rose-500/60 bg-transparent text-rose-950 dark:text-rose-100 hover:bg-rose-500/10";
  }
  if (state === "upcoming") {
    return hosted
      ? "border-l-4 border-l-sky-500 border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100 hover:bg-sky-500/20"
      : "border-l-4 border-l-sky-500 border-sky-500/60 bg-transparent text-sky-950 dark:text-sky-100 hover:bg-sky-500/10";
  }
  if (state === "missed") {
    return hosted
      ? "border-l-4 border-l-amber-500 border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100 hover:bg-amber-500/20"
      : "border-l-4 border-l-amber-500 border-amber-500/60 bg-transparent text-amber-950 dark:text-amber-100 hover:bg-amber-500/10";
  }
  return hosted
    ? "border-l-4 border-l-emerald-500 border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/20"
    : "border-l-4 border-l-emerald-500 border-emerald-500/60 bg-transparent text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/10";
}

/**
 * The month chip's half of the same rule — same hues, same fill-versus-outline split as
 * `rowToneClass`, minus the left accent bar a 22px row has no room for. On a chip that small the
 * outline carries more of the load, so the invited border sits at 60% of the hue where the hosted
 * one keeps the quieter 25% it has always had behind its fill.
 */
function monthChipToneClass(meeting: TimedMeeting) {
  const hosted = isHostedByViewer(meeting);
  const state = meetingDisplayState(meeting);
  if (state === "cancelled") {
    return hosted
      ? "border-border bg-surface-2/60 text-ink-muted hover:bg-surface-2"
      : "border-slate-400/60 bg-transparent text-ink-muted hover:bg-surface-2/60";
  }
  if (state === "live") {
    return hosted
      ? "border-rose-500/25 bg-rose-500/10 text-rose-950 dark:text-rose-100 hover:bg-rose-500/20"
      : "border-rose-500/60 bg-transparent text-rose-950 dark:text-rose-100 hover:bg-rose-500/10";
  }
  if (state === "upcoming") {
    return hosted
      ? "border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100 hover:bg-sky-500/20"
      : "border-sky-500/60 bg-transparent text-sky-950 dark:text-sky-100 hover:bg-sky-500/10";
  }
  if (state === "missed") {
    return hosted
      ? "border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100 hover:bg-amber-500/20"
      : "border-amber-500/60 bg-transparent text-amber-950 dark:text-amber-100 hover:bg-amber-500/10";
  }
  return hosted
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/20"
    : "border-emerald-500/60 bg-transparent text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/10";
}

/**
 * Whether the viewer hosts this meeting — the fill half of the tone rule above.
 *
 * `=== true` rather than a bare truthiness check: the mapper already normalises the field, and
 * anything that is not an explicit yes is drawn as an invitation, which is the safer thing to
 * mislabel than a stranger's meeting shown as yours.
 */
function isHostedByViewer(meeting: MyMeetingItem) {
  return meeting.isHost === true;
}

/**
 * The words for the fill — kept beside it, as `meetingStateLabel` sits beside the state rule, so
 * the two cannot drift.
 */
function relationLabel(meeting: MyMeetingItem) {
  return isHostedByViewer(meeting) ? "You host" : "Invited";
}

/**
 * The relation pill beside the state badge on a week card. Neutral, not in the state hue: a second
 * coloured pill would read as a second state. It repeats the card's own encoding in grey instead —
 * filled for host, outlined for invited — so the pill and the card it sits on say the same thing.
 * The outline is an inset ring rather than a border so both pills stay the badge's exact height.
 */
function relationPillClass(meeting: MyMeetingItem) {
  return isHostedByViewer(meeting)
    ? "bg-ink/[0.07] text-ink"
    : "bg-transparent text-ink-muted ring-1 ring-inset ring-ink/25";
}

/**
 * Cancellation outranks the clock, exactly as it does in rowToneClass and monthChipToneClass —
 * all three ask `meetingDisplayState`. Before cancellation came first here, a cancelled meeting
 * wore a green "Joined" or a blue "Upcoming" pill next to its own greyed-out title on a grey card —
 * three signals, three different answers to "what happened to this meeting?".
 *
 * That ordering is also why a cancelled meeting resolving to `missed` changes nothing on screen: it
 * is "cancelled" before the clock is consulted. The more specific answer wins.
 *
 * The badge's WORDS are `meetingStateLabel`, from the same module as the rule, so the label and
 * this colour cannot come to disagree about which state they are naming.
 */
function stateBadgeClass(meeting: TimedMeeting) {
  const state = meetingDisplayState(meeting);
  if (state === "cancelled") return "bg-surface-3 text-ink-muted";
  if (state === "live") return "bg-rose-500/10 text-rose-700";
  if (state === "upcoming") return "bg-sky-500/10 text-sky-700";
  if (state === "missed") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-emerald-500/10 text-emerald-700";
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
