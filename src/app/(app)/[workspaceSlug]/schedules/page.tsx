"use client";

import { type ElementType, useMemo, useState } from "react";
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
import { formatLanguageRoute } from "@/lib/language/languages";
import { getErrorMessage } from "@/lib/api/errors";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { cn } from "@/lib/utils";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { translationRoomService } from "@/services/translation-room.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { MyMeetingItem } from "@/types/myMeetings";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

type TimeFilter = "all" | "upcoming" | "past";

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
  { value: "past", label: "Attended" },
];
const EMPTY_MEETINGS: MyMeetingItem[] = [];
const APP_CALENDAR_LOCALE = "en-GB";

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

  const [view, setView] = useState<CalendarView>("month");
  // One anchor for both views. Switching from week to month keeps you in the month you were
  // looking at, and switching back puts you in the week you left — a separate anchor per view
  // would silently teleport you to today on every toggle.
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TimeFilter>("all");
  const [dialogMeetingId, setDialogMeetingId] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);

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
  const allMeetings = useMemo(() => {
    if (view === "month") return fetched;
    const from = rangeFrom.getTime();
    const to = rangeTo.getTime();
    return fetched.filter((meeting) => {
      const at = Date.parse(meeting.occursAt);
      return at >= from && at <= to;
    });
  }, [fetched, view, rangeFrom, rangeTo]);

  const visible = useMemo(() => {
    return allMeetings.filter((meeting) => {
      if (filter === "upcoming") return meeting.timeState !== "past";
      if (filter === "past") return meeting.timeState === "past";
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
      upcoming: allMeetings.filter((meeting) => meeting.timeState !== "past").length,
      past: allMeetings.filter((meeting) => meeting.timeState === "past").length,
    };
  }, [allMeetings]);

  const dialogMeeting = allMeetings.find((meeting) => meeting.id === dialogMeetingId) ?? null;

  /** Picking a day in the sidebar re-anchors the visible calendar range. */
  function goToDay(date: Date) {
    setMonthAnchor(date);
  }

  function stepRange(delta: number) {
    setMonthAnchor((current) =>
      view === "week" ? shiftWeeks(current, delta) : addMonths(current, delta),
    );
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
                onClick={() => setView(value)}
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

      <div className="flex min-h-0 flex-1">
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
              onOpenPast={setDialogMeetingId}
              onNavigate={(id) => router.push(`/${workspaceSlug}/rooms/${id}`)}
            />
          )}
        </div>
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
  counts: { all: number; upcoming: number; past: number };
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
              : counts.past;
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
  onOpenPast,
  onNavigate,
}: {
  monthAnchor: Date;
  meetings: MyMeetingItem[];
  hasQuery: boolean;
  onOpenPast: (id: string) => void;
  onNavigate: (id: string) => void;
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
    const map = new Map<string, MyMeetingItem[]>();
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

  return (
    <div className="flex h-full flex-col">
      {meetings.length === 0 ? (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-surface-2/30 px-4 py-2 text-center text-[11px] text-ink-muted">
          <FileText size={14} />
          {hasQuery
            ? "No meetings match this search."
            : "Nothing on your timeline this month. Upcoming invites and attended meetings appear here."}
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

          {monthDays.map((day) => {
            const key = String(startOfDay(day));
            const dayMeetings = byDay.get(key) ?? EMPTY_MEETINGS;
            const isToday = key === todayKey;
            const isCurrentMonth = day.getMonth() === currentMonth;

            return (
              <div
                key={key}
                className={cn(
                  "flex min-h-[110px] min-w-0 flex-col overflow-hidden border-b border-r border-border p-1.5 transition-colors last:border-r-0",
                  !isCurrentMonth && "bg-surface-2/30 text-ink-subtle",
                  isToday && "bg-primary/[0.04]",
                )}
              >
                <div className="flex h-5 shrink-0 items-center justify-between px-1">
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

                <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-hidden">
                  {dayMeetings.slice(0, 3).map((meeting) => (
                    <div
                      key={meeting.id}
                      onClick={() =>
                        meeting.timeState === "past"
                          ? onOpenPast(meeting.id)
                          : onNavigate(meeting.id)
                      }
                      title={meeting.title}
                      className={cn(
                        "group h-5 cursor-pointer overflow-hidden rounded-sm border px-1.5 text-[10px] leading-5 transition-colors",
                        monthChipToneClass(meeting),
                      )}
                    >
                      <div className="flex h-full min-w-0 items-center gap-1">
                        <span className={cn("truncate font-medium", meeting.status === "cancelled" && "line-through text-ink-muted")}>
                          {meeting.title}
                        </span>
                        <span className="ml-auto shrink-0 text-[9px] tabular-nums text-ink-subtle">
                          {formatTime(meeting.occursAt)}
                        </span>
                        {meeting.timeState === "live" ? (
                          <span className="relative flex size-1.5 shrink-0">
                            <span className="absolute inline-flex size-1.5 rounded-full bg-rose-500/80 motion-safe:animate-ping" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-rose-500" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {dayMeetings.length > 3 ? (
                    <div className="h-4 truncate px-1 text-[9px] font-medium leading-4 text-ink-subtle">
                      +{dayMeetings.length - 3} more
                    </div>
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
  meetings,
  workspaceSlug,
  onOpenPast,
  onNavigate,
}: {
  days: Date[];
  meetings: MyMeetingItem[];
  workspaceSlug: string;
  onOpenPast: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, MyMeetingItem[]>();
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
                    <div className="pt-6 text-center text-[10px] text-ink-subtle/60">—</div>
                  ) : (
                    dayMeetings.map((meeting) => (
                      <WeekCard
                        key={meeting.id}
                        meeting={meeting}
                        workspaceSlug={workspaceSlug}
                        onOpen={() =>
                          meeting.timeState === "past"
                            ? onOpenPast(meeting.id)
                            : onNavigate(meeting.id)
                        }
                      />
                    ))
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

function WeekCard({
  meeting,
  workspaceSlug,
  onOpen,
}: {
  meeting: MyMeetingItem;
  workspaceSlug: string;
  onOpen: () => void;
}) {
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
          {meeting.timeState === "live"
            ? "Live"
            : meeting.timeState === "upcoming"
            ? "Upcoming"
            : "Attended"}
        </span>
        {meeting.timeState === "live" ? (
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex size-1.5 rounded-full bg-rose-500/80 motion-safe:animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-rose-500" />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-ink",
          meeting.status === "cancelled" && "text-ink-muted line-through",
        )}
      >
        {meeting.title}
      </p>

      <p className="mt-0.5 truncate text-[9px] text-ink-subtle">{meeting.hostName}</p>

      {meeting.timeState === "live" ? (
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

function rowToneClass(meeting: MyMeetingItem) {
  if (meeting.status === "cancelled") {
    return "border-l-4 border-l-slate-400 border-border bg-surface-2/60 text-ink-muted hover:bg-surface-2";
  }
  if (meeting.timeState === "live") {
    return "border-l-4 border-l-rose-500 border-rose-500/25 bg-rose-500/10 text-rose-950 dark:text-rose-100 hover:bg-rose-500/20";
  }
  if (meeting.timeState === "upcoming") {
    return "border-l-4 border-l-sky-500 border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100 hover:bg-sky-500/20";
  }
  return "border-l-4 border-l-emerald-500 border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/20";
}

function monthChipToneClass(meeting: MyMeetingItem) {
  if (meeting.status === "cancelled") {
    return "border-border bg-surface-2/60 text-ink-muted hover:bg-surface-2";
  }
  if (meeting.timeState === "live") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-950 dark:text-rose-100 hover:bg-rose-500/20";
  }
  if (meeting.timeState === "upcoming") {
    return "border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100 hover:bg-sky-500/20";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/20";
}

function stateBadgeClass(meeting: MyMeetingItem) {
  if (meeting.timeState === "live") return "bg-rose-500/10 text-rose-700";
  if (meeting.timeState === "upcoming") return "bg-sky-500/10 text-sky-700";
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
