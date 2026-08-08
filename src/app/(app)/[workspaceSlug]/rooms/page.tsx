"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoomOccupancy } from "@/hooks/use-room-occupancy";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { resolveRoomHost } from "@/lib/room-host";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { TranslationRoomDto } from "@/types/translationRoom";
import { LanguageLabel } from "@/components/language/language-label";
import type { WorkspaceMemberDto } from "@/types/workspace";
import {
  Calendar as CalendarIcon,
  CaretDown,
  CaretRight,
  CheckCircle,
  Circle,
  Copy,
  Funnel,
  Keyboard,
  Plus,
  Repeat,
  SlidersHorizontal,
  Users,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusPanel } from "./StatusPanel";

function formatTimeShort(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

/** Midnight of the given date as a timestamp, for comparing days without comparing times. */
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Whether this room was booked for the given calendar day.
 *
 * Status is deliberately not part of the question (WT-247): a meeting that has started, or
 * already ended, still belongs on the day it was scheduled for. Rooms with no scheduledAt are
 * instant meetings and belong to no day at all.
 */
function isScheduledOn(room: TranslationRoomDto, day: Date) {
  if (!room.scheduledAt) return false;
  return new Date(room.scheduledAt).toDateString() === day.toDateString();
}

/**
 * WT-327: marks a room that is one occurrence of a recurring booking.
 *
 * A series is NOT grouped or collapsed in this list, deliberately. Every occurrence is a real,
 * separate meeting — its own code, its own transcript, its own artifacts, its own billing — and
 * a collapsed "1 series" row would hide exactly the thing the host came here to check: whether
 * tomorrow's 8am actually exists. The day timeline could not collapse it at all, since each
 * occurrence belongs to a different day. So they look like N meetings, because they ARE N
 * meetings; this badge is the only thing that says they share a rule.
 */
function RepeatBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      data-testid="recurring-room-badge"
      title="Part of a daily repeating schedule"
      className={
        compact
          ? "shrink-0 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[8px] font-medium text-primary border border-primary/20"
          : "shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary border border-primary/20"
      }
    >
      <Repeat weight="bold" size={compact ? 8 : 10} aria-hidden />
      Daily
      <span className="sr-only">This meeting repeats daily</span>
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "in_progress")
    return (
      <div className="w-3 h-3 rounded-full border-[1.5px] border-status-in-progress bg-status-in-progress/20 shadow-[0_0_8px_var(--color-status-in-progress)]/30" />
    );
  if (status === "waiting")
    return (
      <div className="w-3 h-3 rounded-full border-[1.5px] border-status-waiting bg-status-waiting/20" />
    );
  if (status === "scheduled")
    return (
      <div className="w-3 h-3 rounded-full border-[1.5px] border-status-scheduled bg-status-scheduled/20" />
    );
  if (status === "ended")
    return (
      <CheckCircle size={13} weight="fill" className="text-status-ended" />
    );
  if (["cancelled", "failed", "expired"].includes(status))
    return (
      <div className="w-3 h-3 rounded-full border-[1.5px] border-status-error bg-status-error/20" />
    );
  return (
    <Circle size={13} weight="light" className="text-muted-foreground/40" />
  );
}

function LinearRow({
  room,
  members,
}: {
  room: TranslationRoomDto;
  members: WorkspaceMemberDto[];
}) {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string;
  const user = useAuthStore((state) => state.user);
  const isCurrentUserHost = room.hostId === user?.id || Boolean(room.isHost);
  // WT-274: same hook the room detail page reads, so a row and the page it links to cannot
  // report different occupancy. The list has no per-room roster, so for every room except the
  // one the viewer is currently in this resolves to the server's aggregate — see the PR's
  // BACKEND note: that aggregate is `TranslationRoomParticipants.Count`, not the seat rule.
  const occupancy = useRoomOccupancy(room);
  const { name: hostName, avatarUrl: hostAvatar } = resolveRoomHost(
    room,
    members,
    user,
  );

  return (
    <Link
      href={`/${workspaceSlug}/rooms/${room.id}`}
      className="flex items-center min-h-[44px] py-1 text-[13px] hover:bg-accent/50 border-b border-border/40 px-4 group cursor-pointer transition-colors"
    >
      <div className="flex items-center w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground">
        {isCurrentUserHost && (
          <button
            onClick={(e) => {
              e.preventDefault();
              const inviteLink = `${window.location.origin}/join?code=${room.translationRoomCode}`;
              navigator.clipboard.writeText(inviteLink);
              toast.success("Invite link copied");
            }}
            className="hover:text-foreground transition-colors p-1"
            title="Copy invite link"
          >
            <Copy size={14} weight="bold" />
          </button>
        )}
      </div>

      <div className="flex items-center w-8 shrink-0">
        <StatusIcon status={room.status} />
      </div>

      <div className="w-[80px] shrink-0 font-mono text-[11px] text-muted-foreground tracking-tight">
        {room.translationRoomCode}
      </div>
      <div className="flex-1 min-w-0 pr-4 flex items-center gap-2">
        <span className="text-foreground font-medium truncate block">
          {room.title}
        </span>
        {room.seriesId && <RepeatBadge />}
        {user?.id && room.hostId !== user.id && (
          <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-500/20">
            Invited
          </span>
        )}
      </div>

      {/* WT-321(4): every cell in this trailing group is a fixed-width column. It used to be a
          row of shrink-wrapped pills, so each one started wherever the pill before it happened
          to end — a longer host name or a third target language shifted the occupancy and date
          columns sideways, and no two rows lined up. Widths here, not content-derived widths. */}
      <div className="flex items-center gap-2.5 shrink-0 text-muted-foreground text-[11px]">
        <div className="flex w-[104px] shrink-0 items-center">
          <StatusPanel status={room.status} />
        </div>

        <div className="flex h-[26px] w-[164px] shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-surface-1 border border-border/60 px-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <Avatar className="size-5 shrink-0 rounded-full">
            <AvatarImage src={hostAvatar} alt={hostName} />
            <AvatarFallback className="text-[9px] font-medium bg-primary/10 text-primary">
              {hostName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-ink-muted pr-1.5">{hostName}</span>
        </div>

        <div className="flex h-[26px] w-[176px] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full bg-surface-1 border border-border/60 px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          {/* Reads "English → 🇻🇳 · 🇯🇵". It used to read "English ; 🇺🇸 ; 🇻🇳 ;" — three
              separate faults in one chip. The separator was a semicolon, so the two branches
              of this same control punctuated the same relationship differently (the
              single-target branch below has always used an arrow). There was a trailing
              separator before the "+", punctuating a gap. And the source language was listed
              again among its own targets, because create sends `targetLanguages = languages`
              with the source still in the set — so a room appeared to translate English into
              English. Only the display is corrected here; what gets sent to the API is
              unchanged, since the backend may well want the source in that list. */}
          <LanguageLabel value={room.sourceLanguage || "en-US"} />
          {(() => {
            const source = room.sourceLanguage || "en-US";
            const targets = room.targetLanguages.filter((t) => t !== source);

            // Everything the room translates into is the source itself — there is no second
            // language to point an arrow at, so the source chip alone is the honest answer.
            if (targets.length === 0) return null;

            if (targets.length === 1) {
              return (
                <>
                  <span className="text-border mx-0.5 font-bold">→</span>
                  <LanguageLabel value={targets[0]} />
                </>
              );
            }

            return (
              <>
                <span className="text-border mx-0.5 font-bold">→</span>
                <div className="flex items-center">
                  {targets.map((t, i) => (
                    <div key={t} className="flex items-center">
                      {i > 0 && (
                        <span className="text-muted-foreground/40 px-1 text-[13px] font-bold">
                          ·
                        </span>
                      )}
                      <LanguageLabel value={t} showName={false} />
                    </div>
                  ))}
                  <div className="flex items-center justify-center px-1">
                    <Plus weight="bold" size={12} className="text-ink-muted" />
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* WT-321(3): the bare "0/100" was read as an error code, a progress bar, anything but
            what it is. It is unchanged in meaning — `useRoomOccupancy` still returns
            seats-taken over the meeting type's seat cap (WT-274) — it just says so now. A
            people icon and a title are the whole fix; the number itself was never wrong. */}
        <div
          className="flex h-[26px] w-[84px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface-1 border border-border/60 px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          title={`${occupancy.seatCount} in the room of ${occupancy.capacity} seats`}
        >
          <Users size={13} weight="regular" aria-hidden />
          <span className="tabular-nums">{occupancy.label}</span>
          <span className="sr-only">
            participants in the room, out of {occupancy.capacity} seats
          </span>
        </div>

        <div className="flex h-[26px] w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface-1 border border-border/60 px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <CalendarIcon size={13} weight="regular" />
          <span className="tabular-nums">
            {formatTimeShort(room.scheduledAt ?? room.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function DailyTimeline({
  date,
  rooms,
}: {
  date: Date;
  rooms: TranslationRoomDto[];
}) {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string;
  const scrollRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);
  const startHour = 0;
  const endHour = 24;
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => i + startHour,
  );
  const hourHeight = 64; // pixels per hour
  const minuteHeight = hourHeight / 60; // pixels per minute

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Scroll to current time on initial load
  useEffect(() => {
    if (scrollRef.current) {
      const isToday = date.toDateString() === new Date().toDateString();
      if (isToday) {
        const currentTop =
          (currentTime.getHours() * 60 + currentTime.getMinutes()) *
          minuteHeight;
        scrollRef.current.scrollTop = Math.max(0, currentTop - 200);
      } else {
        scrollRef.current.scrollTop = 8 * hourHeight; // default 8 AM
      }
    }
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date.toDateString() === new Date().toDateString();
  const currentTop =
    (currentTime.getHours() * 60 + currentTime.getMinutes()) * minuteHeight;

  return (
    <div
      className="flex-1 overflow-y-auto relative bg-surface-1"
      ref={scrollRef}
    >
      <div
        className="flex relative"
        style={{ minHeight: `${24 * hourHeight}px` }}
      >
        {/* Time column */}
        <div className="w-16 shrink-0 border-r border-border/50 flex flex-col relative z-10 bg-surface-1">
          {hours.map((hour) => (
            <div
              key={hour}
              className="relative w-full"
              style={{ height: hourHeight }}
            >
              <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground tabular-nums select-none font-medium">
                {hour === 0
                  ? "12 AM"
                  : hour < 12
                    ? `${hour} AM`
                    : hour === 12
                      ? "12 PM"
                      : `${hour - 12} PM`}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline grid */}
        <div className="flex-1 relative">
          {/* Horizontal lines */}
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute w-full border-t border-border/40 pointer-events-none"
              style={{ top: hour * hourHeight, height: hourHeight }}
            />
          ))}

          {/* Current time indicator */}
          {isToday && (
            <div
              className="absolute w-full border-t-[1.5px] border-red-500 z-20 pointer-events-none flex items-center"
              style={{ top: currentTop }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-[5px] absolute shadow-sm" />
            </div>
          )}

          {/* Events */}
          <div className="absolute inset-0 right-4">
            {(() => {
              const validRooms = rooms.filter((r) => r.scheduledAt);
              // Sort by start time
              validRooms.sort(
                (a, b) =>
                  new Date(a.scheduledAt!).getTime() -
                  new Date(b.scheduledAt!).getTime(),
              );

              // Calculate columns for overlapping events
              const columns: TranslationRoomDto[][] = [];
              const layouts = new Map<string, { column: number }>();

              validRooms.forEach((room) => {
                const start = new Date(room.scheduledAt!).getTime();

                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                  const col = columns[i];
                  const lastEvent = col[col.length - 1];
                  const lastEnd =
                    new Date(lastEvent.scheduledAt!).getTime() +
                    (lastEvent.durationSeconds ?? 3600) * 1000;
                  if (lastEnd <= start) {
                    col.push(room);
                    layouts.set(room.id, { column: i });
                    placed = true;
                    break;
                  }
                }
                if (!placed) {
                  columns.push([room]);
                  layouts.set(room.id, { column: columns.length - 1 });
                }
              });

              const totalColumns = Math.max(1, columns.length);

              return validRooms.map((room) => {
                const scheduledDate = new Date(room.scheduledAt!);
                const eventHour = scheduledDate.getHours();
                const eventMinute = scheduledDate.getMinutes();
                const durationMinutes = (room.durationSeconds ?? 3600) / 60;

                const top = (eventHour * 60 + eventMinute) * minuteHeight;
                const height = Math.max(durationMinutes * minuteHeight, 24); // Minimum height

                const colIndex = layouts.get(room.id)?.column || 0;
                const leftPercent = (colIndex / totalColumns) * 100;
                const widthPercent = 100 / totalColumns;

                return (
                  <Link
                    key={room.id}
                    href={`/${workspaceSlug}/rooms/${room.id}`}
                    className="absolute rounded-[12px] border border-primary/20 bg-primary/10 hover:bg-primary/20 transition-all p-2 overflow-hidden flex flex-col group shadow-sm hover:shadow-md z-10"
                    style={{
                      top,
                      height,
                      left: `calc(0.5rem + ${leftPercent}%)`,
                      width: `calc(${widthPercent}% - 0.5rem)`,
                    }}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-semibold text-primary text-[12px] leading-tight truncate">
                          {room.title}
                        </span>
                        {room.seriesId && <RepeatBadge compact />}
                        {user?.id && room.hostId !== user.id && (
                          <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[8px] font-medium text-amber-600 border border-amber-500/20">
                            Invited
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-primary/70 font-medium shrink-0">
                        {scheduledDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        -
                        {new Date(
                          scheduledDate.getTime() + durationMinutes * 60000,
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {height >= 40 && (
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-primary/80 truncate">
                        <span className="inline-flex items-center gap-1">
                          <LanguageLabel value={room.sourceLanguage} />
                          {room.targetLanguages.length > 1 ? ";" : "→"}
                          {room.targetLanguages.map((target, index) => (
                            <span key={target} className="inline-flex items-center gap-1">
                              {index > 0 ? "," : null}
                              <LanguageLabel value={target} />
                            </span>
                          ))}
                        </span>
                        <span>•</span>
                        <span className="font-mono">
                          {room.translationRoomCode}
                        </span>
                      </div>
                    )}
                  </Link>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useUIStore } from "@/stores/ui-store";

export default function MeetingsPageLinear() {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const membersQuery = useWorkspaceMembers(
    activeWorkspaceId ?? undefined,
    1,
    100,
  );
  const members = membersQuery.data?.items ?? [];
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    setJoinModalOpen(false);
    router.push(`/join?code=${encodeURIComponent(trimmed)}`);
  }
  const [isGroupOpen, setIsGroupOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "active" | "scheduled" | "history" | "all"
  >("active");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // workspaceId is what lets the server answer this question for a workspace Owner/Admin at all:
  // without it the list falls back to host-or-participant-or-invitee and an Admin sees an empty
  // page for a workspace that has meetings in it. It also stops this workspace-scoped screen from
  // listing another workspace's rooms.
  const roomList = useTranslationRooms({
    pageSize: 100,
    status: "SCHEDULED,WAITING,IN_PROGRESS,PAUSED,ENDED,CANCELLED,TIMEOUT",
    workspaceId: activeWorkspaceId ?? undefined,
  });
  const setCreateRoomModalOpen = useUIStore(
    (state) => state.setCreateRoomModalOpen,
  );

  const rooms = useMemo(() => {
    return roomList.data?.rooms ?? [];
  }, [roomList.data?.rooms]);

  // WT-251/WT-232: the calendar gave no hint which days hold anything, and it opens on today,
  // so a meeting booked for any other day was invisible in this tab — findable only under
  // "All". Marking the days that have meetings is what makes the tab navigable at all.
  const daysWithMeetings = useMemo(
    () =>
      rooms
        .filter((room) => room.scheduledAt)
        .map((room) => new Date(room.scheduledAt as string))
        .sort((a, b) => a.getTime() - b.getTime()),
    [rooms],
  );

  // The next day after the one being viewed that actually holds something, so an empty day can
  // point somewhere instead of being a dead end.
  //
  // Measured against the selected day rather than against the clock: reading the current time
  // during render is impure, and "next after where you are" is the more useful answer anyway —
  // it works the same whether the user has paged backwards or forwards.
  const selectedDayKey = startOfDay(selectedDate);
  const nextUpcoming = daysWithMeetings.find(
    (date) => startOfDay(date) > selectedDayKey,
  );

  const filteredRooms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = (room: TranslationRoomDto) => {
      if (!normalizedQuery) return true;

      return [
        room.title,
        room.description,
        room.translationRoomCode,
        room.status,
        room.sourceLanguage,
        ...(room.targetLanguages ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    };

    if (activeTab === "active") {
      const now = new Date();
      const fifteenMinsFromNow = new Date(now.getTime() + 15 * 60000);
      return rooms.filter(
        (r) =>
          matchesSearch(r) &&
          (r.status === "in_progress" ||
            r.status === "waiting" ||
            (r.status === "scheduled" &&
              (!r.scheduledAt ||
                new Date(r.scheduledAt) <= fifteenMinsFromNow))),
      );
    }
    if (activeTab === "scheduled") {
      // WT-247: keyed off the day a room was scheduled for, not off its current status. The
      // old filter also required status === "scheduled", so a meeting vanished from its own
      // day in the calendar the moment it started. What belongs on a day is what was booked
      // for it; the row already renders whatever state it has now.
      return rooms.filter(
        (r) => matchesSearch(r) && isScheduledOn(r, selectedDate),
      );
    }
    if (activeTab === "history")
      return rooms.filter(
        (r) =>
          matchesSearch(r) &&
          (r.status === "ended" ||
            r.status === "cancelled" ||
            r.status === "timeout"),
      );
    return rooms.filter(matchesSearch);
  }, [rooms, activeTab, selectedDate, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-surface-1">
      {/* View Tabs & Actions */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
          {(["active", "scheduled", "history", "all"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center justify-center px-4 py-1.5 rounded-full cursor-pointer transition-all capitalize text-[13px] select-none border ${activeTab === tab ? "bg-surface-2 border-transparent text-foreground font-medium shadow-none" : "bg-transparent border-border/40 text-muted-foreground hover:bg-surface-2 hover:border-border/60 hover:text-foreground"}`}
            >
              {tab}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pl-4 shrink-0">
          <ExpandingSearchDock
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search meetings..."
            ariaLabel="Search meetings"
            collapsedWidth={28}
            expandedWidth={220}
            className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
            iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
            clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
            inputClassName="h-[26px] text-[12px]"
          />
          <button
            className="flex items-center justify-center w-[28px] h-[28px] rounded-full border border-border/60 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors shadow-sm"
            title="Filter"
          >
            <Funnel weight="bold" size={13} />
          </button>
          <button
            className="flex items-center justify-center w-[28px] h-[28px] rounded-full border border-border/60 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors shadow-sm"
            title="Display Options"
          >
            <SlidersHorizontal weight="bold" size={13} />
          </button>

          <div className="h-4 w-[1px] bg-border mx-1" />

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCreateRoomModalOpen(true)}
              className="flex items-center gap-1.5 h-[28px] pl-2.5 pr-3 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity text-[13px] font-medium shadow-sm"
            >
              <Plus weight="bold" size={12} />
              New Meeting
            </button>
            <button
              onClick={() => setJoinModalOpen(true)}
              className="flex items-center justify-center w-[28px] h-[28px] rounded-full bg-surface-2 hover:bg-surface-3 text-ink transition-colors shadow-sm border border-border/60"
              title="Join via code"
            >
              <Keyboard weight="fill" size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === "scheduled" && (
          <div className="w-[300px] border-r border-border flex flex-col items-center py-6 px-4 overflow-y-auto bg-canvas/30 shrink-0">
            <div className="w-full bg-surface-1 rounded-xl border border-border shadow-sm p-1">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                className="w-full"
                modifiers={{ hasMeeting: daysWithMeetings }}
                modifiersClassNames={{
                  hasMeeting:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
                }}
              />
            </div>
            <div className="mt-6 text-[13px] text-muted-foreground w-full px-1">
              <p className="font-semibold text-foreground mb-1.5 flex items-center gap-2">
                <CalendarIcon size={16} weight="duotone" />
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="leading-relaxed">
                {filteredRooms.length === 0
                  ? "You have no meetings scheduled for this day."
                  : `You have ${filteredRooms.length} meeting${filteredRooms.length === 1 ? "" : "s"} scheduled for this day.`}
              </p>
              {filteredRooms.length === 0 && nextUpcoming ? (
                <button
                  type="button"
                  onClick={() => setSelectedDate(nextUpcoming)}
                  className="mt-2 text-[13px] font-medium text-primary hover:text-primary-hover"
                >
                  Go to next meeting —{" "}
                  {nextUpcoming.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </button>
              ) : null}
            </div>
          </div>
        )}

        {activeTab === "scheduled" ? (
          <DailyTimeline date={selectedDate} rooms={filteredRooms} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Group Header */}
            <div
              className="flex items-center gap-1.5 px-4 h-[30px] hover:bg-accent/40 cursor-pointer text-[12px] text-muted-foreground select-none transition-colors sticky top-0 bg-surface-1/90 backdrop-blur-sm z-10 border-b border-border/40"
              onClick={() => setIsGroupOpen(!isGroupOpen)}
            >
              {isGroupOpen ? (
                <CaretDown size={12} weight="bold" />
              ) : (
                <CaretRight size={12} weight="bold" />
              )}
              <span className="font-medium text-foreground capitalize">
                {activeTab} Meetings
              </span>
              <span className="tabular-nums">{filteredRooms.length}</span>
            </div>

            {/* Group Content */}
            {isGroupOpen && (
              <div className="flex flex-col pb-8">
                {filteredRooms.length > 0 ? (
                  filteredRooms.map((room) => (
                    <LinearRow key={room.id} room={room} members={members} />
                  ))
                ) : (
                  <div className="px-6 py-12 text-[13px] text-muted-foreground flex flex-col items-center justify-center">
                    <CalendarIcon
                      size={32}
                      weight="light"
                      className="mb-3 opacity-30"
                    />
                    <p>No {activeTab} meetings found.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={joinModalOpen} onOpenChange={setJoinModalOpen}>
        <DialogContent className="sm:max-w-[425px] !top-[25%] !translate-y-[-25%]">
          <DialogHeader>
            <DialogTitle>Join Translation Room</DialogTitle>
            <DialogDescription>
              Enter the meeting code provided by your host to join the room.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="grid gap-4 pt-2">
            <div className="grid gap-2">
              <Label
                htmlFor="code"
                className="text-foreground font-medium text-[13px]"
              >
                Meeting code
              </Label>
              <Input
                id="code"
                placeholder="e.g. ROOM-abc-123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoComplete="off"
                autoFocus
                className="bg-surface-1"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={!joinCode.trim()}
                className="disabled:bg-surface-2 disabled:text-ink-muted disabled:opacity-100 min-w-[80px] text-white"
              >
                Join
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
