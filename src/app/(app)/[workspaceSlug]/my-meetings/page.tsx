"use client";

import { type ElementType, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  MagnifyingGlass,
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
import { Input } from "@/components/ui/input";
import { useMyMeetingsInRange } from "@/hooks/use-my-meetings";
import {
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
import { endOfMonth, shiftWeeks, startOfMonth, weekOf } from "@/lib/meeting/meeting-day";
import { formatLanguageRoute } from "@/lib/language/languages";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { translationRoomService } from "@/services/translation-room.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { MyMeetingItem } from "@/types/myMeetings";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

type TimeFilter = "all" | "upcoming" | "past" | "with_outputs";

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
  { value: "with_outputs", label: "With outputs" },
];
const EMPTY_MEETINGS: MyMeetingItem[] = [];

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
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);

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
      if (filter === "with_outputs") return meeting.artifacts.length > 0;
      return true;
    });
  }, [allMeetings, filter]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  // Marked from everything fetched rather than from the visible window: in week view the little
  // calendar is how you find the week that holds something, so it must still show the whole month.
  const daysWithMeetings = useMemo(
    () => fetched.map((meeting) => new Date(meeting.occursAt)),
    [fetched],
  );

  const counts = useMemo(() => {
    return {
      upcoming: allMeetings.filter((meeting) => meeting.timeState !== "past").length,
      past: allMeetings.filter((meeting) => meeting.timeState === "past").length,
    };
  }, [allMeetings]);

  const dialogMeeting = allMeetings.find((meeting) => meeting.id === dialogMeetingId) ?? null;

  const dayRefs = useRef(new Map<string, HTMLDivElement>());
  const todayRef = useRef<HTMLDivElement>(null);

  const anchoredMonth = useRef<string | null>(null);
  const monthLabel = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;
  useEffect(() => {
    // Week view is seven columns with nothing to scroll to, so the agenda's jump-to-today does not
    // apply — and running it there would scroll the page out from under a grid that fits.
    if (view !== "month" || meetings.isLoading || anchoredMonth.current === monthLabel) return;
    anchoredMonth.current = monthLabel;
    todayRef.current?.scrollIntoView({ block: "center" });
  }, [view, meetings.isLoading, monthLabel]);

  /** Picking a day in the sidebar means "take me there" — which is a different move per view. */
  function goToDay(date: Date) {
    if (view === "week") {
      setMonthAnchor(date);
      return;
    }

    const target = dayRefs.current.get(String(startOfDay(date)));
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    toast.info("No meetings on that day.");
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

  const todayKey = String(startOfDay(new Date()));
  // Compared against everything the months returned, not against the visible week: truncation
  // happens at the month fetch, so that is the number the server's total describes.
  const truncated = (meetings.data?.total ?? 0) > fetched.length;

  // bg-surface-1, the same white Meetings and Members open onto. A workspace page that brings
  // its own wash reads as bolted on from somewhere else.
  return (
    <main className="flex h-full flex-col bg-surface-1 text-ink">
      <header className="flex flex-col gap-4 border-b border-border px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-ink-muted">
            <CalendarBlank size={14} /> Personal timeline
          </div>
          <h1 className="text-[30px] font-semibold leading-none">My meetings</h1>
          <p className="mt-2 text-[13px] text-ink-muted">
            Upcoming meetings you host or are invited to, plus past meetings you actually joined.
          </p>
        </div>

        <div className="flex w-full items-center gap-2 lg:w-auto">
          <div className="relative min-w-0 flex-1 lg:w-[300px] lg:flex-none">
            <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, code, or description"
              className="h-9 rounded-md bg-surface-1 pl-9 text-[12px] shadow-none"
            />
          </div>

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
        <aside className="hidden w-[268px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-surface-1 px-4 py-5 lg:flex">
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
                  : monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
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

            <div className="rounded-xl border border-border bg-surface-1 p-1">
              <Calendar
                mode="single"
                month={monthAnchor}
                onMonthChange={setMonthAnchor}
                onSelect={(date) => date && goToDay(date)}
                className="w-full"
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

          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.05] px-3 py-2">
              <dt className="text-[10px] text-ink-subtle">Upcoming</dt>
              <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{counts.upcoming}</dd>
            </div>
            <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2">
              <dt className="text-[10px] text-ink-subtle">Attended</dt>
              <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{counts.past}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Timeline filters">
            {timeFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={cn(
                  "h-7 rounded-md px-3 text-[11px] font-medium transition-colors",
                  filter === item.value
                    ? "bg-ink text-surface-1"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {item.label}
              </button>
            ))}
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
          ) : groups.length === 0 ? (
            <EmptyState hasQuery={Boolean(query)} />
          ) : (
            <div className="mx-auto w-full max-w-[900px] px-4 py-5">
              {groups.map((group, index) => (
                <div
                  key={group.key}
                  ref={(node) => {
                    if (node) dayRefs.current.set(group.key, node);
                    else dayRefs.current.delete(group.key);
                  }}
                >
                  <GapNotice previous={groups[index - 1]?.key} current={group.key} />

                  <div
                    ref={group.key === todayKey ? todayRef : undefined}
                    className="sticky top-0 z-10 -mx-4 bg-surface-1/95 px-4 py-2 backdrop-blur"
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "text-[12px] font-semibold",
                          group.key === todayKey ? "text-primary" : "text-ink",
                        )}
                      >
                        {group.key === todayKey ? "Today" : formatDayHeading(group.date)}
                      </span>
                      <span className="text-[10px] text-ink-subtle">
                        {group.date.toLocaleDateString(undefined, { weekday: "long" })}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-ink-subtle">
                        {group.meetings.length}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 space-y-2">
                    {group.meetings.map((meeting) => (
                      <AgendaRow
                        key={meeting.id}
                        meeting={meeting}
                        workspaceSlug={workspaceSlug}
                        viewerUserId={viewerUserId}
                        onOpenPast={() => setDialogMeetingId(meeting.id)}
                        onNavigate={() => router.push(`/${workspaceSlug}/rooms/${meeting.id}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
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
        <span className={cn("h-3 w-0.5 shrink-0 rounded-full", spineClass(meeting))} />
        <span className="text-[10px] font-medium tabular-nums text-ink-muted">
          {formatTime(meeting.occursAt)}
        </span>
        {meeting.timeState === "live" ? (
          <span className="relative ml-auto flex size-1.5 shrink-0">
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

function AgendaRow({
  meeting,
  workspaceSlug,
  viewerUserId,
  onOpenPast,
  onNavigate,
}: {
  meeting: MyMeetingItem;
  workspaceSlug: string;
  viewerUserId: string | null;
  onOpenPast: () => void;
  onNavigate: () => void;
}) {
  const isPast = meeting.timeState === "past";
  const stateLabel =
    meeting.timeState === "live"
      ? "Live now"
      : meeting.timeState === "upcoming"
        ? "Upcoming"
        : "Past";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (isPast) onOpenPast();
        else onNavigate();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (isPast) onOpenPast();
          else onNavigate();
        }
      }}
      className={cn(
        "flex cursor-pointer gap-3 rounded-xl border px-3 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
        rowToneClass(meeting),
      )}
    >
      <div className="w-[52px] shrink-0 pt-0.5 text-right">
        <div className="text-[12px] font-medium tabular-nums text-ink">{formatTime(meeting.occursAt)}</div>
        <div className="mt-0.5 text-[10px] tabular-nums text-ink-subtle">
          {formatDuration(meeting.durationSeconds)}
        </div>
      </div>

      <span className={cn("mt-1 w-0.5 shrink-0 self-stretch rounded-full", spineClass(meeting))} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              "truncate text-[13px] font-medium text-ink",
              meeting.status === "cancelled" && "text-ink-muted line-through",
            )}
          >
            {meeting.title}
          </span>

          {meeting.isHost ? (
            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase text-ink-muted">
              Host
            </span>
          ) : null}

          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
              stateBadgeClass(meeting),
            )}
          >
            {meeting.timeState === "live" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-2 rounded-full bg-rose-500/80 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                </span>
                {stateLabel}
              </span>
            ) : (
              stateLabel
            )}
          </span>
        </div>

        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-ink-subtle">
          <span className="truncate">{meeting.translationRoomCode}</span>
          <span>&middot;</span>
          <span className="truncate">{meeting.hostName}</span>
          <span>&middot;</span>
          <span className="truncate">
            {formatLanguageRoute(meeting.sourceLanguage, meeting.targetLanguages)}
          </span>
        </div>

        {isPast ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded border border-emerald-500/15 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-emerald-700">
              {meeting.artifacts.length ? `${meeting.artifacts.length} artifacts` : "No artifacts"}
            </span>
            <span className="text-[10px] text-ink-subtle">Open popup for room info and outputs.</span>
            {meeting.artifacts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {meeting.artifacts.slice(0, 2).map((artifact) => (
                  <span
                    key={artifact.id}
                    className="flex items-center gap-1.5 rounded border border-border bg-surface-1 px-2 py-1 text-[10px] text-ink-muted"
                  >
                    <ArtifactIcon artifact={artifact} />
                    {artifactLabel(artifact.type)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase text-ink-muted">
              {meetingAudienceLabel(meeting, viewerUserId)}
            </span>

            <Link
              href={`/${workspaceSlug}/rooms/${meeting.id}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-1 px-2 py-1 text-[10px] font-medium text-ink transition-colors hover:border-ink/30"
            >
              {meeting.timeState === "live" ? "Join" : "Open"}
              <ArrowRight size={11} />
            </Link>
          </div>
        )}
      </div>

      <div className="hidden shrink-0 items-start gap-1 pt-1 text-[10px] tabular-nums text-ink-subtle sm:flex">
        <Users size={12} />
        {meeting.participantCount}
      </div>
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

function GapNotice({ previous, current }: { previous?: string; current: string }) {
  if (!previous) return null;

  const days = Math.round(Math.abs(Number(previous) - Number(current)) / 86_400_000);
  if (days < 8) return null;

  const weeks = Math.floor(days / 7);
  return (
    <div className="my-3 flex items-center gap-3 px-1 text-[10px] text-ink-subtle">
      <span className="h-px flex-1 bg-border" />
      {weeks === 1 ? "1 week with no meetings" : `${weeks} weeks with no meetings`}
      <span className="h-px flex-1 bg-border" />
    </div>
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

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="grid min-h-[420px] place-items-center text-center">
      <div>
        <FileText size={22} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-[12px] font-medium">
          {hasQuery ? "No meetings match this search" : "Nothing on your timeline this month"}
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          {hasQuery
            ? "Try a different title, code, or description."
            : "Upcoming invites and attended meetings appear here."}
        </p>
      </div>
    </div>
  );
}

type DayGroup = { key: string; date: Date; meetings: MyMeetingItem[] };

function groupByDay(meetings: MyMeetingItem[]): DayGroup[] {
  const byDay = new Map<string, MyMeetingItem[]>();

  for (const meeting of meetings) {
    const key = dayKey(meeting.occursAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(meeting);
    else byDay.set(key, [meeting]);
  }

  return [...byDay.entries()]
    .map(([key, items]) => ({
      key,
      date: new Date(Number(key)),
      meetings: items.sort((a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt)),
    }))
    .sort((a, b) => Number(b.key) - Number(a.key));
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

  const start = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  }).format(first);
  const end = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(last);

  return `${start} – ${end}`;
}

function meetingAudienceLabel(meeting: MyMeetingItem, viewerUserId: string | null) {
  if (meeting.isHost) return "Host";
  if (viewerUserId && meeting.participants.some((participant) => participant.userId === viewerUserId)) {
    return "Going";
  }
  return "Invited";
}

function spineClass(meeting: MyMeetingItem) {
  if (meeting.timeState === "live") return "bg-rose-500 motion-safe:animate-pulse";
  if (meeting.timeState === "upcoming") return "bg-sky-500/70";
  if (meeting.status === "cancelled") return "bg-ink-subtle/30";
  return "bg-emerald-500";
}

function rowToneClass(meeting: MyMeetingItem) {
  if (meeting.timeState === "live") {
    return "border-rose-500/20 bg-rose-500/[0.06] hover:border-rose-500/35 hover:bg-rose-500/[0.1]";
  }
  if (meeting.timeState === "upcoming") {
    // The state is already carried by the accent bar and the badge. Tinting the whole row as
    // well turned the content area into a green-and-blue wash, which is what stopped this page
    // reading as white — the one thing every other workspace page does.
    return "border-border bg-surface-1 hover:border-sky-500/30 hover:bg-sky-500/[0.04]";
  }
  return "border-border bg-surface-1 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]";
}

function stateBadgeClass(meeting: MyMeetingItem) {
  if (meeting.timeState === "live") return "bg-rose-500/10 text-rose-700";
  if (meeting.timeState === "upcoming") return "bg-sky-500/10 text-sky-700";
  return "bg-emerald-500/10 text-emerald-700";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompactDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDayHeading(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  if (!seconds) return "0m";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
