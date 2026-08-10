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
import { useMyMeetings } from "@/hooks/use-my-meetings";
import {
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
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

  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TimeFilter>("all");
  const [dialogMeetingId, setDialogMeetingId] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);

  const meetings = useMyMeetings(activeWorkspaceId, monthAnchor, query);
  const allMeetings = meetings.data?.meetings ?? EMPTY_MEETINGS;

  const visible = useMemo(() => {
    return allMeetings.filter((meeting) => {
      if (filter === "upcoming") return meeting.timeState !== "past";
      if (filter === "past") return meeting.timeState === "past";
      if (filter === "with_outputs") return meeting.artifacts.length > 0;
      return true;
    });
  }, [allMeetings, filter]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  const daysWithMeetings = useMemo(
    () => allMeetings.map((meeting) => new Date(meeting.occursAt)),
    [allMeetings],
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
  const truncated = (meetings.data?.total ?? 0) > allMeetings.length;

  return (
    <main className="flex h-full flex-col bg-canvas text-ink">
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
                onSelect={(date) => date && scrollToDay(date)}
                className="w-full"
                modifiers={{ hasMeeting: daysWithMeetings }}
                modifiersClassNames={{
                  hasMeeting:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
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

          {truncated ? (
            <p className="text-[10px] leading-4 text-ink-subtle">
              Showing {allMeetings.length} of {meetings.data?.total} meetings this month. Narrow the
              search to see the rest.
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto">
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
    return "border-sky-500/15 bg-sky-500/[0.04] hover:border-sky-500/30 hover:bg-sky-500/[0.08]";
  }
  return "border-emerald-500/15 bg-emerald-500/[0.04] hover:border-emerald-500/30 hover:bg-emerald-500/[0.08]";
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
