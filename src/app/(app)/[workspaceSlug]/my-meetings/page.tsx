"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { useMyMeetings } from "@/hooks/use-my-meetings";
import {
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
import { cn } from "@/lib/utils";
import { formatLanguageRoute } from "@/lib/language/languages";
import { getErrorMessage } from "@/lib/api/errors";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { translationRoomService } from "@/services/translation-room.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { MyMeetingItem } from "@/types/myMeetings";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

/**
 * WT-333 — My Meetings (UC 25).
 *
 * An AGENDA, not a calendar grid. The month grid on the Rooms > Scheduled tab is right for its job:
 * upcoming bookings are sparse, and the question there is "when am I free". This page answers a
 * different question — "what happened, and what is coming" — over a range that reaches back as far
 * as the user has been in the workspace. In a grid, a meeting three weeks ago costs a click per day
 * to find and its artifacts do not fit in a cell. Days with nothing in them are not rendered at all
 * here, which is the whole advantage: the list is exactly as long as the user's history is dense.
 *
 * Past and upcoming share one scroll deliberately. Every row carries an action either way — an
 * upcoming row offers Join, a finished one offers its transcript and summary — so the mixed list
 * has no dead half.
 */

type TimeFilter = "all" | "upcoming" | "past" | "with_outputs";

const timeFilters: Array<{ value: TimeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Attended" },
  { value: "with_outputs", label: "With outputs" },
];

/** Midnight of the given date, for comparing days without comparing times. Mirrors the helper of
 * the same name in the Rooms page — both must agree, or a 23:30 meeting files under a different
 * day on each screen. */
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(iso: string) {
  return String(startOfDay(new Date(iso)));
}

export default function MyMeetingsPage() {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string;
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);

  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TimeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);

  const meetings = useMyMeetings(activeWorkspaceId, monthAnchor, query);

  const visible = useMemo(() => {
    const all = meetings.data?.meetings ?? [];
    return all.filter((meeting) => {
      if (filter === "upcoming") return meeting.timeState !== "past";
      if (filter === "past") return meeting.timeState === "past";
      if (filter === "with_outputs") return meeting.artifacts.length > 0;
      return true;
    });
  }, [filter, meetings.data?.meetings]);

  // Newest first, matching the order the server paged in. Re-sorted rather than trusted because the
  // filter above can leave the array sparse and a later status change can move a row's occursAt.
  const groups = useMemo(() => groupByDay(visible), [visible]);

  const daysWithMeetings = useMemo(
    () => (meetings.data?.meetings ?? []).map((meeting) => new Date(meeting.occursAt)),
    [meetings.data?.meetings],
  );

  const counts = useMemo(() => {
    const all = meetings.data?.meetings ?? [];
    return {
      upcoming: all.filter((meeting) => meeting.timeState !== "past").length,
      past: all.filter((meeting) => meeting.timeState === "past").length,
    };
  }, [meetings.data?.meetings]);

  const selected = visible.find((meeting) => meeting.id === selectedId) ?? visible[0];

  const dayRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollBody = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  // The anchor that makes a two-directional timeline readable: it opens at today, so the past is
  // above and the future below, rather than opening at whichever end the sort happened to produce.
  // Runs once per loaded month — re-anchoring on every render would fight the user's own scrolling.
  const anchoredMonth = useRef<string | null>(null);
  const monthLabel = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;
  useEffect(() => {
    if (meetings.isLoading || anchoredMonth.current === monthLabel) return;
    anchoredMonth.current = monthLabel;
    todayRef.current?.scrollIntoView({ block: "center" });
  }, [meetings.isLoading, monthLabel]);

  function scrollToDay(date: Date) {
    const target = dayRefs.current.get(String(startOfDay(date)));
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // A day the user picked that holds nothing is not a dead end: say so rather than doing nothing,
    // which reads as a broken control.
    toast.info("No meetings on that day.");
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
  const truncated = (meetings.data?.total ?? 0) > (meetings.data?.meetings.length ?? 0);

  return (
    <main className="flex h-full flex-col bg-canvas text-ink">
      <header className="flex flex-col gap-4 border-b border-border px-5 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-ink-muted">
            <CalendarBlank size={14} /> Personal timeline
          </div>
          <h1 className="text-[30px] font-semibold leading-none">My meetings</h1>
          <p className="mt-2 text-[13px] text-ink-muted">
            Meetings you host, joined, or were invited to in this workspace.
          </p>
        </div>
        <div className="relative w-full lg:w-[360px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, code, or description"
            className="h-9 rounded-md bg-surface-1 pl-9 text-[12px] shadow-none"
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[268px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-canvas/30 px-4 py-5 lg:flex">
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setMonthAnchor((current) => addMonths(current, -1))}
                className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <CaretLeft size={13} />
              </button>
              <span className="text-[12px] font-medium">
                {monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setMonthAnchor((current) => addMonths(current, 1))}
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
                // Selecting a day SCROLLS the agenda to it rather than filtering down to it. A
                // filter would leave an empty day looking identical to an empty month, which is the
                // dead end WT-251/WT-232 had to patch around on the grid.
                onSelect={(date) => date && scrollToDay(date)}
                className="w-full"
                modifiers={{ hasMeeting: daysWithMeetings }}
                modifiersClassNames={{
                  hasMeeting:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
                }}
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-surface-1 px-3 py-2">
              <dt className="text-[10px] text-ink-subtle">Upcoming</dt>
              <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{counts.upcoming}</dd>
            </div>
            <div className="rounded-lg border border-border bg-surface-1 px-3 py-2">
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

          {truncated ? (
            <p className="text-[10px] leading-4 text-ink-subtle">
              Showing {meetings.data?.meetings.length} of {meetings.data?.total} meetings this month.
              Narrow the search to see the rest.
            </p>
          ) : null}
        </aside>

        <div ref={scrollBody} className="min-w-0 flex-1 overflow-y-auto">
          {meetings.isLoading ? (
            <LoadingState />
          ) : meetings.isError ? (
            <ErrorState onRetry={() => meetings.refetch()} />
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
                    className="sticky top-0 z-10 -mx-4 bg-canvas/95 px-4 py-2 backdrop-blur"
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

                  <div className="mb-4">
                    {group.meetings.map((meeting) => (
                      <AgendaRow
                        key={meeting.id}
                        meeting={meeting}
                        workspaceSlug={workspaceSlug}
                        viewerUserId={viewerUserId}
                        selected={selected?.id === meeting.id}
                        busyArtifactId={busyArtifactId}
                        onSelect={() => setSelectedId(meeting.id)}
                        onDownload={downloadArtifact}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <MeetingDetail
            meeting={selected}
            workspaceSlug={workspaceSlug}
            busyArtifactId={busyArtifactId}
            onDownload={downloadArtifact}
          />
        ) : null}
      </div>
    </main>
  );
}

function AgendaRow({
  meeting,
  workspaceSlug,
  viewerUserId,
  selected,
  busyArtifactId,
  onSelect,
  onDownload,
}: {
  meeting: MyMeetingItem;
  workspaceSlug: string;
  viewerUserId: string | null;
  selected: boolean;
  busyArtifactId: string | null;
  onSelect: () => void;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-surface-2/55 focus-visible:ring-2 focus-visible:ring-ring/30",
        selected && "bg-surface-2",
      )}
    >
      <div className="w-[52px] shrink-0 pt-0.5 text-right">
        <div className="text-[12px] font-medium tabular-nums text-ink">{formatTime(meeting.occursAt)}</div>
        <div className="mt-0.5 text-[10px] tabular-nums text-ink-subtle">
          {formatDuration(meeting.durationSeconds)}
        </div>
      </div>

      {/* The spine carries the state at a glance, so the row does not need a status word competing
          with the title for the eye. */}
      <span className={cn("mt-1 w-0.5 shrink-0 self-stretch rounded-full", spineClass(meeting))} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
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
          {meeting.timeState === "live" ? (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-primary">
              Live
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-ink-subtle">
          <span className="truncate">{meeting.translationRoomCode}</span>
          <span>·</span>
          <span className="truncate">{meeting.hostName}</span>
          <span>·</span>
          <span className="truncate">
            {formatLanguageRoute(meeting.sourceLanguage, meeting.targetLanguages)}
          </span>
        </div>

        {/* Where an upcoming row shows what it offers, a finished one shows what it left behind.
            Neither half of the timeline gets a row with nothing to act on. */}
        {meeting.timeState === "past" ? (
          meeting.artifacts.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {meeting.artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  disabled={busyArtifactId === artifact.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDownload(artifact);
                  }}
                  className="flex items-center gap-1.5 rounded border border-border bg-surface-1 px-2 py-1 text-[10px] text-ink-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50"
                >
                  <ArtifactIcon artifact={artifact} />
                  {artifactLabel(artifact.type)} · {artifactStatusLabel(artifact)}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-[10px] text-ink-subtle">No outputs retained.</p>
          )
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

function MeetingDetail({
  meeting,
  workspaceSlug,
  busyArtifactId,
  onDownload,
}: {
  meeting: MyMeetingItem;
  workspaceSlug: string;
  busyArtifactId: string | null;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  return (
    <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-border bg-canvas/35 p-5 xl:block">
      <div className="flex items-center gap-2 text-[10px] font-medium uppercase text-ink-subtle">
        <span className={cn("size-1.5 rounded-full", spineClass(meeting))} />
        {meeting.status.replace("_", " ")}
      </div>
      <h2 className="mt-3 text-[18px] font-semibold leading-6">{meeting.title}</h2>
      {meeting.description ? (
        <p className="mt-2 text-[12px] leading-5 text-ink-muted">{meeting.description}</p>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 border-y border-border py-4">
        <Detail icon={CalendarBlank} label="When" value={formatDateTime(meeting.occursAt)} />
        <Detail icon={Clock} label="Duration" value={formatDuration(meeting.durationSeconds)} />
        <Detail icon={Users} label="Participants" value={String(meeting.participantCount)} />
        <Detail
          icon={Translate}
          label="Route"
          value={formatLanguageRoute(meeting.sourceLanguage, meeting.targetLanguages)}
        />
      </dl>

      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold">Outputs</h3>
        <span className="text-[10px] text-ink-subtle">{meeting.artifacts.length}</span>
      </div>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {meeting.artifacts.length ? (
          meeting.artifacts.map((artifact) => (
            <li key={artifact.id} className="py-3">
              <button
                type="button"
                disabled={busyArtifactId === artifact.id || !canDownloadArtifact(artifact)}
                onClick={() => onDownload(artifact)}
                className="group flex w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-1">
                  <ArtifactIcon artifact={artifact} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium">
                    {artifact.title || artifactLabel(artifact.type)}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-ink-subtle">
                    {artifact.format || artifactLabel(artifact.type)} · {artifactStatusLabel(artifact)}
                  </span>
                </span>
                {busyArtifactId === artifact.id ? (
                  <SpinnerGap size={12} className="animate-spin text-ink-subtle" />
                ) : canDownloadArtifact(artifact) ? (
                  <DownloadSimple size={12} className="text-ink-subtle transition-colors group-hover:text-ink" />
                ) : null}
              </button>
            </li>
          ))
        ) : (
          <li className="py-6 text-center text-[11px] text-ink-muted">
            {meeting.timeState === "past"
              ? "No outputs retained for this meeting."
              : "Outputs appear here after the meeting ends."}
          </li>
        )}
      </ul>

      <Link
        href={`/${workspaceSlug}/rooms/${meeting.id}`}
        className="mt-5 flex h-8 w-full items-center justify-center rounded-md border border-border bg-surface-1 text-[11px] font-medium text-ink transition-colors hover:border-ink/30"
      >
        Open meeting
      </Link>
    </aside>
  );
}

/**
 * "3 weeks with no meetings" between two clusters.
 *
 * An agenda hides empty days, which is what makes it short — but it also means a jump from March to
 * May looks identical to a page that failed to load the middle. Naming the gap is what keeps the
 * omission legible as an omission.
 */
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
  icon: React.ElementType;
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
  if (artifact.status === "processing") return <SpinnerGap size={12} className="animate-spin text-ink-muted" />;
  if (["failed", "missing", "expired"].includes(artifact.status)) return <WarningCircle size={12} className="text-ink-muted" />;
  if (artifact.consentRequired) return <DownloadSimple size={12} className="text-ink-muted" />;
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
            : "Meetings you host, join, or are invited to appear here."}
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
      meetings: items.sort(
        (a, b) => Date.parse(a.occursAt) - Date.parse(b.occursAt),
      ),
    }))
    // Days descending — newest first, matching the order the server paged in — but the meetings
    // WITHIN a day ascend, because a day reads as a schedule from morning to evening.
    .sort((a, b) => Number(b.key) - Number(a.key));
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function meetingAudienceLabel(
  meeting: MyMeetingItem,
  viewerUserId: string | null,
) {
  if (meeting.isHost) return "Host";
  if (viewerUserId && meeting.participants.some((participant) => participant.userId === viewerUserId)) {
    return "Going";
  }
  return "Invited";
}

function spineClass(meeting: MyMeetingItem) {
  if (meeting.timeState === "live") return "bg-primary animate-pulse";
  if (meeting.timeState === "upcoming") return "bg-ink-subtle/40";
  if (meeting.status === "cancelled") return "bg-ink-subtle/30";
  return "bg-emerald-500";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
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
  if (seconds === null) return "—";
  if (!seconds) return "0m";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
