"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { resolveRoomHost } from "@/lib/meeting/room-host";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { TranslationRoomDto } from "@/types/translationRoom";
import { LanguageLabel } from "@/components/language/language-label";
import { meetingLanguageSet } from "@/lib/language/languages";
// The home day panel needs the same two answers; they live in one place so the two surfaces
// cannot drift the way the language chip did.
import { isScheduledOn, startOfDay } from "@/lib/meeting/meeting-day";
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
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MeetingDayStrip } from "@/components/meetings/meeting-day-strip";
import { StatusPanel } from "./StatusPanel";

function formatTimeShort(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}


const ROOM_FILTER_WIDTH_CLASS = {
  active: "w-[90px]",
  scheduled: "w-[120px]",
  history: "w-[96px]",
  all: "w-[58px]",
} as const;

/**
 * WT-327: marks a room that is one occurrence of a recurring booking.
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
      // @container, not a viewport breakpoint: what squeezes this row is the Properties panel
      // opening beside it, which takes 260px away while the window stays exactly the same size.
      // A `lg:` rule cannot see that and would keep every chip at a width the row no longer has.
      className="@container flex items-center min-h-[44px] py-1 text-[13px] hover:bg-accent/50 border-b border-border/40 px-4 group cursor-pointer transition-colors"
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

      <div className="hidden @[560px]:block w-[80px] shrink-0 font-mono text-[11px] text-muted-foreground tracking-tight">
        {room.translationRoomCode}
      </div>
      {/* overflow-hidden, not just min-w-0. min-w-0 lets this column shrink to nothing, which is
          what has to happen when the Properties panel opens — but the badges after the title are
          shrink-0, so with nothing clipping them they simply drew on top of the status column.
          The title truncates first and the badges clip only once there is genuinely no room. */}
      <div className="flex-1 min-w-0 overflow-hidden pr-4 flex items-center gap-2">
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
          columns sideways, and no two rows lined up. Widths here, not content-derived widths.

          The CELL is what holds that width; the pill inside it is not. Making the pill fill the
          column drew a border around the reservation rather than around the content, so a
          two-flag room and a fourteen-character name both rendered as the same wide capsule
          with the meaning huddled in the middle of it. The pill hugs what it contains and is
          capped at the column, so the columns still line up and nothing can overflow them. */}
      <div className="flex items-center gap-2.5 shrink-0 text-muted-foreground text-[11px]">
        <div className="flex w-[104px] shrink-0 items-center">
          <StatusPanel status={room.status} />
        </div>

        <div className="hidden @[700px]:flex w-[164px] shrink-0 items-center">
          <div className="flex h-[26px] max-w-full items-center gap-1.5 overflow-hidden rounded-full bg-surface-1 border border-border/60 px-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <Avatar className="size-5 shrink-0 rounded-full">
              <AvatarImage src={hostAvatar} alt={hostName} />
              <AvatarFallback className="text-[9px] font-medium bg-primary/10 text-primary">
                {hostName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-ink-muted pr-1.5">{hostName}</span>
          </div>
        </div>

        <div className="flex w-[176px] shrink-0 items-center">
          <div className="flex h-[26px] max-w-full items-center gap-1.5 overflow-hidden rounded-full bg-surface-1 border border-border/60 px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            {/* Reads "🇺🇸 · 🇻🇳 · 🇯🇵" — the languages this meeting is held in, and nothing else.

                It used to read "English → 🇻🇳 · 🇯🇵", which asserted a relationship the product
                does not have: every participant picks their own speak and listen language, so
                there is no meeting-wide source and no direction to point an arrow at. A room
                only ever declares a SET. The named source was the loudest thing in the chip and
                it was the one part that meant nothing.

                The trailing "+" is gone too. It was a permanent icon, not an overflow count —
                it sat after every multi-language room whether or not anything had been hidden,
                so it punctuated a gap that was never there.

                Flags only, no names: the column is 176px and two language names do not fit.
                LanguageLabel keeps the name as the title and aria-label, so the flag is not the
                only thing carrying the meaning. A room can declare any number of languages —
                nothing client-side caps the set — so the pill is capped at the column and clips
                rather than pushing the occupancy and date columns out of line. */}
            {meetingLanguageSet(room.sourceLanguage, room.targetLanguages).map(
              (language, index) => (
                <div key={language} className="flex items-center">
                  {index > 0 && (
                    <span className="text-muted-foreground/40 px-1 text-[13px] font-bold">
                      ·
                    </span>
                  )}
                  <LanguageLabel value={language} showName={false} />
                </div>
              ),
            )}
          </div>
        </div>

        {/* WT-321(3): the bare "0/100" was read as an error code, a progress bar, anything but
            what it is. It is unchanged in meaning — `useRoomOccupancy` still returns
            seats-taken over the meeting type's seat cap (WT-274) — it just says so now. A
            people icon and a title are the whole fix; the number itself was never wrong. */}
        <div
          className="hidden @[820px]:flex h-[26px] w-[84px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface-1 border border-border/60 px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          title={`${occupancy.seatCount} in the room of ${occupancy.capacity} seats`}
        >
          <Users size={13} weight="regular" aria-hidden />
          <span className="tabular-nums">{occupancy.label}</span>
          <span className="sr-only">
            participants in the room, out of {occupancy.capacity} seats
          </span>
        </div>

        <div className="hidden @[900px]:flex h-[26px] w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface-1 border border-border/60 px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <CalendarIcon size={13} weight="regular" />
          <span className="tabular-nums">
            {formatTimeShort(room.scheduledAt ?? room.createdAt)}
          </span>
        </div>
      </div>
    </Link>
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
  const [activeTab, setActiveTab] = useState<"active" | "history" | "all">(
    "active",
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [today] = useState<Date>(() => new Date());
  // Null means "no day chosen", which is not the same as "today": the tab's own filter runs
  // untouched until somebody actually picks a day off the strip. Picking the selected day again
  // clears it, so there is always a way back out of a day without hunting for today.
  const [dayFilter, setDayFilter] = useState<Date | null>(null);
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

  // The next day after the one being viewed that actually holds something, so an empty day can
  // point somewhere instead of being a dead end.
  //
  // Measured against the selected day rather than against the clock: reading the current time
  // during render is impure, and "next after where you are" is the more useful answer anyway —
  // it works the same whether the user has paged backwards or forwards.

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
      // A scheduled room needs a window on BOTH sides. The check used to be "starts within the
      // next fifteen minutes" with no lower bound, so `scheduledAt <= now + 15min` was also true
      // for every meeting whose time had already passed — a room booked for last week sat in
      // Active forever, which is most of what made the tab meaningless. Two hours of grace after
      // the hour keeps a meeting that is running late; older than that it was never started, and
      // it belongs to its own day under Scheduled, not here.
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60000);
      return rooms.filter(
        (r) =>
          matchesSearch(r) &&
          (r.status === "in_progress" ||
            r.status === "waiting" ||
            (r.status === "scheduled" &&
              (!r.scheduledAt ||
                (new Date(r.scheduledAt) <= fifteenMinsFromNow &&
                  new Date(r.scheduledAt) >= twoHoursAgo)))),
      );
    }
    // A day off the strip narrows whichever tab is open. It replaced the Scheduled TAB, and
    // WT-247's reasoning still holds: what belongs to a day is what was BOOKED for it, not what
    // its status happens to be now — the row renders its own state.
    if (dayFilter) {
      return rooms.filter(
        (r) => matchesSearch(r) && isScheduledOn(r, dayFilter),
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
  }, [rooms, activeTab, dayFilter, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-surface-1">
      {/* View Tabs & Actions */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-2 pb-1.5 pt-2">
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
          {(["active", "history", "all"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex h-[26px] ${ROOM_FILTER_WIDTH_CLASS[tab]} shrink-0 items-center justify-center rounded-full border px-3 text-[12px] font-medium capitalize transition-colors select-none cursor-pointer ${
                activeTab === tab
                  ? "border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
                  : "border-[#e2e3e7] bg-transparent text-[#6b7280] hover:border-[#d6d7dc] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:border-[#25272b] dark:text-[#9fa0a5] dark:hover:border-[#303236] dark:hover:bg-[#232524] dark:hover:text-white"
              }`}
            >
              {tab}
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
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

      {/* Replaces the Scheduled tab. A permanent strip says which days have anything on them
          without costing a click, which a tab could never do — and it is the same component the
          home panel renders, so the two cannot disagree about which days are marked. */}
      <div className="flex items-center gap-3 border-b border-border/40 px-4 pb-3 shrink-0">
        <MeetingDayStrip
          rooms={rooms}
          selectedDate={selectedDate}
          today={today}
          onSelectDate={(day) => {
            setSelectedDate(day);
            setDayFilter((current) =>
              current && startOfDay(current) === startOfDay(day) ? null : day,
            );
          }}
        />
        {dayFilter ? (
          <button
            type="button"
            onClick={() => setDayFilter(null)}
            className="text-[12px] font-medium text-primary hover:text-primary-hover"
          >
            Clear day
          </button>
        ) : null}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {(
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
