"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarBlank,
  ChartBar,
  ClockCounterClockwise,
  CreditCard,
  FileText,
  GearSix,
  Keyboard,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Users,
  VideoCamera,
} from "@phosphor-icons/react";

import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { TranslationRoomDto } from "@/types/translationRoom";

type QuickAction = {
  title: string;
  description: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
  featured?: boolean;
};

type Metric = {
  label: string;
  value: string;
  helper: string;
  icon: React.ElementType;
};

type TimeRange = "day" | "week" | "month" | "year";

const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function formatRoomDate(value?: string) {
  const date = new Date(value || Date.now());
  return {
    day: date.getDate().toString().padStart(2, "0"),
    weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
    month: date.toLocaleDateString("en-US", { month: "short" }),
    time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

function MetricCard({ metric, index }: { metric: Metric; index: number }) {
  const Icon = metric.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.025 }}
      className="rounded-lg border border-border bg-surface-1 p-4 text-ink shadow-[0_8px_22px_rgba(15,15,15,0.04)] transition-colors hover:bg-neutral-100 dark:hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-ink-muted">{metric.label}</p>
          <p className="mt-3 text-[24px] font-semibold leading-none tracking-normal">{metric.value}</p>
        </div>
        <span className="grid size-8 place-items-center rounded-md border border-border bg-canvas text-ink-muted">
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-3 text-[11px] text-ink-muted">{metric.helper}</p>
    </motion.div>
  );
}

function QuickActionCard({ action, index }: { action: QuickAction; index: number }) {
  const Icon = action.icon;
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.02 }}
      whileTap={{ y: 1 }}
      className={cn(
        "group flex h-full min-h-[96px] items-start gap-3 rounded-lg border p-3 text-left transition",
        action.featured
          ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_10px_24px_rgba(15,15,15,0.14)] hover:bg-neutral-800"
          : "border-border bg-surface-1 hover:border-neutral-400 hover:bg-canvas",
        action.href || action.onClick ? "cursor-pointer" : ""
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-md border",
          action.featured ? "border-white/14 bg-white/10 text-white" : "border-border bg-canvas text-ink-muted group-hover:text-ink"
        )}
      >
        <Icon size={17} weight="duotone" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] font-semibold leading-5", action.featured ? "text-white" : "text-ink")}>{action.title}</span>
        <span className={cn("mt-1 block text-[12px] leading-5", action.featured ? "text-white/64" : "text-ink-muted")}>{action.description}</span>
      </span>
      <ArrowRight size={14} className={cn("shrink-0 transition group-hover:translate-x-0.5", action.featured ? "text-white/70" : "text-ink-subtle group-hover:text-ink")} />
    </motion.div>
  );

  if (action.href) {
    return (
      <Link href={action.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className="h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
      {content}
    </button>
  );
}

function WorkloadChart({ rooms, timeRange }: { rooms: TranslationRoomDto[]; timeRange: TimeRange }) {
  const data = buildActivityData(rooms, timeRange);
  const max = Math.max(1, ...data.map((item) => item.count));
  const rangeLabel = TIME_RANGES.find((range) => range.value === timeRange)?.label.toLowerCase() ?? "month";

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-4 shadow-[0_8px_22px_rgba(15,15,15,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Room activity</h2>
          <p className="mt-1 text-[12px] text-ink-muted">Recent meeting volume by {rangeLabel}.</p>
        </div>
        <span className="grid size-8 place-items-center rounded-md border border-border bg-canvas text-ink-muted">
          <ChartBar size={15} />
        </span>
      </div>

      <div className="flex h-[220px] items-end gap-4 border-b border-border px-2 pb-4">
        {data.map((item, index) => (
          <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
            <div className="flex flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-md transition",
                  index === data.length - 1 ? "bg-neutral-950 dark:bg-neutral-200" : item.count > 0 ? "bg-neutral-700 dark:bg-neutral-500" : "bg-neutral-200 dark:bg-neutral-800"
                )}
                style={{ height: `${Math.max(8, (item.count / max) * 100)}%` }}
              />
            </div>
            <span className="truncate text-center text-[11px] text-ink-muted">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WeekPanel({
  selectedDate,
  onSelectDate,
  rooms,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  rooms: TranslationRoomDto[];
}) {
  const days = getWeekDays();
  const selectedDay = selectedDate.toDateString();
  const selectedRooms = rooms.filter((room) => {
    const roomDate = new Date(room.scheduledAt || room.createdAt);
    return roomDate.toDateString() === selectedDay;
  });

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-4 shadow-[0_8px_22px_rgba(15,15,15,0.04)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <CalendarBlank size={16} className="text-ink-muted" />
      </div>
      <div className="grid grid-cols-5 gap-2">
        {days.map((date) => {
          const active = date.toDateString() === selectedDay;
          return (
            <button
              type="button"
              key={date.toISOString()}
              onClick={() => onSelectDate(date)}
              className={cn(
                "rounded-lg border px-2 py-3 text-center transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 dark:hover:bg-surface-2",
                active ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_10px_24px_rgba(15,15,15,0.18)] hover:bg-neutral-950 dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-950 dark:hover:bg-neutral-200" : "border-border bg-canvas text-ink"
              )}
              aria-pressed={active}
            >
              <p className={cn("text-[11px]", active ? "text-white/70 dark:text-neutral-700" : "text-ink-muted")}>{date.toLocaleDateString("en-US", { weekday: "short" })}</p>
              <p className="mt-3 text-[15px] font-semibold">{date.getDate()}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-canvas p-3">
        <div className="mb-3 border-b border-border pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-ink">Selected day</p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </p>
            </div>
            <span className="rounded-full border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium text-ink">
              {selectedRooms.length} rooms
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold text-ink">Workspace readiness</p>
            <p className="mt-1 text-[11px] text-ink-muted">Rooms, transcripts, documents, and members.</p>
          </div>
          <div className="grid size-12 place-items-center rounded-full border-4 border-neutral-950 text-[12px] font-semibold text-ink dark:border-neutral-200">65%</div>
        </div>
      </div>
    </section>
  );
}

function RoomRow({ room, slug }: { room: TranslationRoomDto; slug: string }) {
  const roomDate = formatRoomDate(room.scheduledAt || room.createdAt);
  const isLive = room.status === "in_progress";

  return (
    <Link href={`/${slug}/rooms/${room.id}`} className="block">
      <div className="grid min-h-[58px] grid-cols-[minmax(0,1.2fr)_110px_110px_28px] items-center gap-3 border-t border-border px-4 py-3 transition hover:bg-canvas">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{room.title || "Untitled meeting"}</p>
          <p className="mt-1 truncate text-[11px] text-ink-muted">{room.translationRoomCode || "No code"}</p>
        </div>
        <span className="text-[12px] text-ink-muted">{roomDate.month} {roomDate.day}</span>
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium capitalize",
            isLive ? "border-neutral-950 bg-neutral-950 text-white" : "border-border bg-canvas text-ink-muted"
          )}
        >
          {isLive ? <span className="size-1.5 rounded-full bg-white" /> : null}
          {isLive ? "Live" : room.status.replace("_", " ")}
        </span>
        <ArrowRight size={14} className="text-ink-subtle" />
      </div>
    </Link>
  );
}

export default function WorkspaceHomePage() {
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const activeWorkspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);
  const role = useWorkspaceStore((state) => state.role);
  const setCreateRoomModalOpen = useUIStore((state) => state.setCreateRoomModalOpen);
  const setSearchMeetingModalOpen = useUIStore((state) => state.setSearchMeetingModalOpen);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const { data: roomsData, isLoading: isLoadingRooms } = useTranslationRooms({ pageSize: 8 });
  const rooms = roomsData?.rooms || [];
  const slug = activeWorkspaceSlug || "workspace";
  const displayName = user?.fullName || "User";
  const isOwnerOrAdmin = role === "Owner" || role === "Admin";

  const liveRooms = rooms.filter((room) => room.status === "in_progress").length;
  const scheduledRooms = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting").length;
  const endedRooms = rooms.filter((room) => room.status === "ended").length;

  const metrics: Metric[] = [
    {
      label: "Total rooms",
      value: String(roomsData?.total ?? rooms.length),
      helper: "Workspace meeting records",
      icon: VideoCamera,
    },
    {
      label: "Live now",
      value: String(liveRooms),
      helper: "Currently in progress",
      icon: Sparkle,
    },
    {
      label: "Scheduled",
      value: String(scheduledRooms),
      helper: "Waiting or planned rooms",
      icon: CalendarBlank,
    },
    {
      label: "Finished",
      value: String(endedRooms),
      helper: "Ready for transcripts",
      icon: ClockCounterClockwise,
    },
  ];

  const quickActions: QuickAction[] = [
    {
      title: "Create room",
      description: "Open a live translation space for your team.",
      icon: Plus,
      onClick: () => setCreateRoomModalOpen(true),
      featured: true,
    },
    {
      title: "Find meeting",
      description: "Search rooms, notes, and saved transcripts.",
      icon: MagnifyingGlass,
      onClick: () => setSearchMeetingModalOpen(true),
    },
    {
      title: "Join by code",
      description: "Enter an invite code from another host.",
      icon: Keyboard,
      href: "/join",
    },
    {
      title: "Meetings",
      description: "Review scheduled, live, and past rooms.",
      icon: VideoCamera,
      href: `/${slug}/rooms`,
    },
    {
      title: "History",
      description: "Return to conversations already captured.",
      icon: ClockCounterClockwise,
      href: `/${slug}/history`,
    },
    {
      title: "Transcripts",
      description: "Read transcripts, summaries, and artifacts.",
      icon: Sparkle,
      href: `/${slug}/ai-summaries`,
    },
    {
      title: "Documents",
      description: "Manage vocabulary and reference material.",
      icon: FileText,
      href: `/${slug}/documents`,
    },
    {
      title: "Members",
      description: "Invite teammates and review workspace roles.",
      icon: Users,
      href: `/${slug}/members`,
    },
  ];

  if (isOwnerOrAdmin) {
    quickActions.push(
      {
        title: "Billing",
        description: "Manage plan, seats, and invoices.",
        icon: CreditCard,
        href: `/${slug}/billing`,
      },
      {
        title: "Dashboard",
        description: "Track usage and workspace health.",
        icon: ChartBar,
        href: `/${slug}/dashboard`,
      },
      {
        title: "Settings",
        description: "Control workspace profile and access.",
        icon: GearSix,
        href: `/${slug}/settings`,
      }
    );
  }

  return (
    <main className="min-h-full bg-canvas px-4 py-4 text-ink sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 pb-8">
        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[12px] font-medium text-ink-muted">{activeWorkspaceName || "Workspace dashboard"}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-normal text-ink">Dashboard</h1>
            <p className="mt-1 text-[13px] text-ink-muted">Welcome back, {displayName}. Manage rooms, records, and workspace actions from one place.</p>
          </div>
          <div className="flex items-center gap-2">
            {TIME_RANGES.map((range) => {
              const active = timeRange === range.value;
              return (
                <button
                  key={range.value}
                  type="button"
                  onClick={() => setTimeRange(range.value)}
                  aria-pressed={active}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[12px] font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                    active
                      ? "border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800 dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-950 dark:hover:bg-neutral-200"
                      : "border-border bg-surface-1 text-ink hover:bg-neutral-100 dark:hover:bg-surface-2"
                  )}
                >
                  {range.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <MetricCard key={metric.label} metric={metric} index={index} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_360px]">
          <WorkloadChart rooms={rooms} timeRange={timeRange} />
          <WeekPanel rooms={rooms} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </section>

        <section className="rounded-lg border border-border bg-surface-1 shadow-[0_8px_22px_rgba(15,15,15,0.04)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Workspace shortcuts</h2>
              <p className="mt-1 text-[12px] text-ink-muted">Core actions for rooms, transcripts, members, and admin tools.</p>
            </div>
            <button
              type="button"
              onClick={() => setCreateRoomModalOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-full border border-neutral-950 bg-neutral-950 px-3 text-[12px] font-semibold text-white transition hover:bg-neutral-800 sm:inline-flex"
            >
              <Plus size={13} weight="bold" />
              New room
            </button>
          </div>
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action, index) => (
              <QuickActionCard key={`${action.title}-${action.href || "action"}`} action={action} index={index} />
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-[0_8px_22px_rgba(15,15,15,0.04)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Active and upcoming</h2>
              <p className="mt-1 text-[12px] text-ink-muted">The next rooms needing attention.</p>
            </div>
            <Link href={`/${slug}/rooms`} className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted transition hover:text-ink">
              View all <ArrowRight size={13} />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(0,1.2fr)_110px_110px_28px] gap-3 border-t border-border bg-canvas px-4 py-2 text-[10px] font-medium uppercase tracking-normal text-ink-subtle">
                <span>Room</span>
                <span>Date</span>
                <span>Status</span>
                <span />
              </div>

              {isLoadingRooms ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="grid h-[58px] animate-pulse grid-cols-[minmax(0,1.2fr)_110px_110px_28px] items-center gap-3 border-t border-border px-4">
                    <div className="h-3 w-2/3 rounded bg-surface-3" />
                    <div className="h-3 w-16 rounded bg-surface-3" />
                    <div className="h-6 w-20 rounded bg-surface-3" />
                    <div className="size-4 rounded bg-surface-3" />
                  </div>
                ))
              ) : rooms.length > 0 ? (
                rooms.slice(0, 5).map((room) => <RoomRow key={room.id} room={room} slug={slug} />)
              ) : (
                <div className="border-t border-border px-4 py-10 text-center">
                  <CalendarBlank size={24} className="mx-auto text-ink-subtle" weight="duotone" />
                  <p className="mt-3 text-[13px] font-medium text-ink">No rooms scheduled</p>
                  <p className="mt-1 text-[12px] text-ink-muted">Create a room when your team is ready to talk.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function buildActivityData(rooms: TranslationRoomDto[], timeRange: TimeRange) {
  const today = new Date();
  if (timeRange === "day") {
    return Array.from({ length: 6 }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (5 - index));
      const label = date.toLocaleDateString("en-US", { weekday: "short" });
      const count = rooms.filter((room) => {
        const roomDate = new Date(room.scheduledAt || room.createdAt);
        return roomDate.toDateString() === date.toDateString();
      }).length;
      return { label, count };
    });
  }

  if (timeRange === "week") {
    return Array.from({ length: 6 }).map((_, index) => {
      const start = startOfWeek(today);
      start.setDate(start.getDate() - (5 - index) * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const label = `${start.getDate()}/${start.getMonth() + 1}`;
      const count = rooms.filter((room) => {
        const roomDate = new Date(room.scheduledAt || room.createdAt);
        return roomDate >= start && roomDate <= end;
      }).length;
      return { label, count };
    });
  }

  if (timeRange === "year") {
    return Array.from({ length: 6 }).map((_, index) => {
      const year = today.getFullYear() - (5 - index);
      const count = rooms.filter((room) => {
        const roomDate = new Date(room.scheduledAt || room.createdAt);
        return roomDate.getFullYear() === year;
      }).length;
      return { label: String(year), count };
    });
  }

  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    const label = date.toLocaleDateString("en-US", { month: "short" });
    const count = rooms.filter((room) => {
      const roomDate = new Date(room.scheduledAt || room.createdAt);
      return roomDate.getMonth() === date.getMonth() && roomDate.getFullYear() === date.getFullYear();
    }).length;
    return { label, count };
  });
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekDays() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 2);
  return Array.from({ length: 5 }).map((_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}
