"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import {
  Activity,
  Bell,
  BookOpen,
  BotMessageSquare,
  CalendarClock,
  Clock3,
  FileText,
  Home,
  Languages,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Mic2,
  Search,
  Settings,
  Sparkles,
  Star,
  Users,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { TranslationRoomDto } from "@/types/translationRoom";

type NavItem = {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  active?: boolean;
  badge?: string;
};

const demoRooms: TranslationRoomDto[] = [
  {
    id: "preview-investor-qa",
    workspaceId: "preview",
    hostId: "host",
    title: "Investor Q&A Translation",
    description: "English to Vietnamese live room for product due diligence.",
    translationRoomCode: "WARP-241",
    status: "in_progress",
    translationRoomType: "instant",
    maxParticipants: 24,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN", "ja-JP"],
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    participantCount: 18,
    isHost: true,
  },
  {
    id: "preview-partner-sync",
    workspaceId: "preview",
    hostId: "host",
    title: "Partner Sync Room",
    translationRoomCode: "SYNC-882",
    status: "scheduled",
    translationRoomType: "scheduled",
    maxParticipants: 12,
    sourceLanguage: "vi-VN",
    targetLanguages: ["en-US"],
    scheduledAt: new Date(Date.now() + 1000 * 60 * 55).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    participantCount: 7,
    isHost: true,
  },
  {
    id: "preview-onboarding",
    workspaceId: "preview",
    hostId: "host",
    title: "Customer Onboarding",
    translationRoomCode: "CUST-104",
    status: "waiting",
    translationRoomType: "group",
    maxParticipants: 16,
    sourceLanguage: "en-US",
    targetLanguages: ["ko-KR", "vi-VN"],
    scheduledAt: new Date(Date.now() + 1000 * 60 * 130).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    participantCount: 9,
    isHost: true,
  },
  {
    id: "preview-board-review",
    workspaceId: "preview",
    hostId: "host",
    title: "Board Review Translation",
    translationRoomCode: "BORD-778",
    status: "ended",
    translationRoomType: "scheduled",
    maxParticipants: 20,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN"],
    createdAt: new Date(Date.now() - 1000 * 60 * 190).toISOString(),
    participantCount: 14,
    isHost: true,
  },
];

const demoHistory = [
  {
    id: "ended-board-review",
    title: "Board Review Translation",
    endedAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    durationSeconds: 46 * 60,
    participantCount: 14,
    artifacts: 4,
    languages: "English to Vietnamese, Japanese",
  },
  {
    id: "ended-product-demo",
    title: "Product Demo Follow-up",
    endedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    durationSeconds: 32 * 60,
    participantCount: 8,
    artifacts: 3,
    languages: "Vietnamese to English",
  },
  {
    id: "ended-legal-review",
    title: "Legal Review Session",
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    durationSeconds: 58 * 60,
    participantCount: 11,
    artifacts: 5,
    languages: "English to Korean, Vietnamese",
  },
];

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, active: true },
      { title: "Rooms", href: "/rooms", icon: LayoutGrid },
      { title: "History", href: "/history", icon: FileText },
    ],
  },
  {
    label: "AI",
    items: [
      { title: "AI Summaries", href: "/ai-summaries", icon: MessageSquare, badge: "New" },
      { title: "Chat with AI", href: "/ai-chat", icon: BotMessageSquare },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Terminology", href: "/terminology", icon: BookOpen },
      { title: "Voice Profiles", href: "/voice-profiles", icon: Mic2 },
      { title: "Feedback", href: "/feedback", icon: Star },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const languageMix = [
  { label: "Vietnamese", value: 42, color: "bg-cyan-300" },
  { label: "English", value: 28, color: "bg-violet-300" },
  { label: "Japanese", value: 18, color: "bg-emerald-300" },
  { label: "Korean", value: 12, color: "bg-amber-300" },
];

function formatDateTime(value?: string) {
  if (!value) return "No schedule";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    minute: "2-digit",
    hour: "2-digit",
  }).format(new Date(value));
}

function getRoomTime(room: TranslationRoomDto) {
  return room.scheduledAt ?? room.startedAt ?? room.createdAt;
}

function getLanguageLabel(code?: string) {
  const labels: Record<string, string> = {
    "en-US": "English",
    "vi-VN": "Vietnamese",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
  };

  return labels[code ?? ""] ?? code ?? "Unknown";
}

function formatLanguages(room: Pick<TranslationRoomDto, "sourceLanguage" | "targetLanguages">) {
  const source = getLanguageLabel(room.sourceLanguage);
  const targets = room.targetLanguages.map(getLanguageLabel).join(", ");

  return `${source} to ${targets || "No target"}`;
}

function statusTone(status: TranslationRoomDto["status"]) {
  switch (status) {
    case "in_progress":
      return "border-emerald-300/25 bg-emerald-300/12 text-emerald-100";
    case "scheduled":
      return "border-blue-300/25 bg-blue-300/12 text-blue-100";
    case "waiting":
      return "border-amber-300/25 bg-amber-300/12 text-amber-100";
    case "ended":
      return "border-white/10 bg-white/8 text-white/62";
    default:
      return "border-white/10 bg-white/8 text-white/62";
  }
}

function statusLabel(status: TranslationRoomDto["status"]) {
  const labels: Record<string, string> = {
    in_progress: "In Progress",
    scheduled: "Scheduled",
    waiting: "Waiting",
    paused: "Paused",
    ended: "Ended",
    cancelled: "Cancelled",
  };

  return labels[status] ?? status;
}

function DashboardSidebarNav() {
  const initialHref = navGroups.flatMap((group) => group.items).find((item) => item.active)?.href ?? "/dashboard";
  const [selectedHref, setSelectedHref] = useState(initialHref);
  const navRef = useRef<HTMLDivElement | null>(null);
  const activeCardRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());

  const animateTo = useCallback((href: string, immediate = false) => {
    const nav = navRef.current;
    const card = activeCardRef.current;
    const target = itemRefs.current.get(href);
    if (!nav || !card || !target) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const navRect = nav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    gsap.killTweensOf(card);
    gsap.to(card, {
      x: targetRect.left - navRect.left + 4,
      y: targetRect.top - navRect.top,
      width: targetRect.width - 8,
      height: targetRect.height,
      opacity: 1,
      duration: immediate || prefersReducedMotion ? 0 : 0.46,
      ease: "power3.out",
    });
  }, []);

  useEffect(() => {
    animateTo(selectedHref, true);

    const handleResize = () => animateTo(selectedHref, true);
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [animateTo, selectedHref]);

  return (
    <nav ref={navRef} className="relative flex-1 overflow-hidden px-2 py-1.5">
      <div
        ref={activeCardRef}
        className="pointer-events-none absolute left-0 top-0 z-0 overflow-hidden rounded-lg bg-white/[0.07] opacity-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_0_18px_rgba(255,255,255,0.035)] backdrop-blur-md backdrop-saturate-150"
        aria-hidden="true"
      >
        <span className="absolute inset-0 rounded-lg bg-[radial-gradient(circle_at_82%_22%,rgba(255,255,255,0.18),transparent_16%),linear-gradient(105deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02)_46%,rgba(255,255,255,0.08))]" />
        <span className="absolute inset-px rounded-[7px] border border-white/[0.07]" />
        <span className="absolute right-2.5 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.48)]" />
      </div>

      <div className="relative z-10 space-y-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-0.5 px-2 text-[10.5px] font-semibold text-white/42">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isSelected = item.href === selectedHref;

                return (
                  <Link
                    key={item.href}
                    ref={(node) => {
                      if (node) itemRefs.current.set(item.href, node);
                      else itemRefs.current.delete(item.href);
                    }}
                    href={item.href}
                    onClick={() => {
                      setSelectedHref(item.href);
                      animateTo(item.href);
                    }}
                    aria-current={isSelected ? "page" : undefined}
                    className={cn(
                      "flex h-[30px] items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-white/58 transition-colors duration-200 hover:bg-white/[0.045] hover:text-white/86",
                      isSelected && "px-3 font-semibold text-white"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0 transition-all duration-200", isSelected && "h-[15px] w-[15px]")} />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.badge ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          isSelected ? "bg-white/12 text-white/72" : "bg-white/10 text-white/44"
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const roomList = useTranslationRooms({ pageSize: 100 });
  const history = useRoomHistory();

  const rooms = useMemo(() => {
    const apiRooms = roomList.data?.rooms ?? [];
    return apiRooms.length > 0 ? apiRooms : demoRooms;
  }, [roomList.data?.rooms]);

  const historyRows = useMemo(() => {
    const apiHistory =
      history.data?.rooms.map((room) => ({
        id: room.id,
        title: room.title,
        endedAt: room.endedAt,
        durationSeconds: room.durationSeconds,
        participantCount: room.participantCount,
        artifacts: room.artifacts.length,
        languages: `${getLanguageLabel(room.sourceLanguage)} to ${room.targetLanguages.map(getLanguageLabel).join(", ")}`,
      })) ?? [];

    return apiHistory.length > 0 ? apiHistory : demoHistory;
  }, [history.data?.rooms]);

  const activeRooms = rooms.filter((room) => room.status === "in_progress" || room.status === "paused");
  const upcomingRooms = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting");
  const totalParticipants =
    rooms.reduce((total, room) => total + (room.participantCount ?? 0), 0) +
    historyRows.reduce((total, room) => total + room.participantCount, 0);
  const translatedMinutes = Math.round(historyRows.reduce((total, room) => total + room.durationSeconds, 0) / 60);
  const readyArtifacts = historyRows.reduce((total, room) => total + room.artifacts, 0);

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  const metrics = [
    {
      label: "Total rooms",
      value: rooms.length,
      helper: "Available room records",
      meta: `${upcomingRooms.length} upcoming`,
      icon: LayoutGrid,
    },
    {
      label: "Live sessions",
      value: activeRooms.length,
      helper: "Active or paused now",
      meta: activeRooms.length > 0 ? "Live" : "Idle",
      icon: Video,
    },
    {
      label: "Participants",
      value: totalParticipants,
      helper: "Across current and ended rooms",
      meta: `${rooms.length} rooms`,
      icon: Users,
    },
    {
      label: "Translated time",
      value: `${translatedMinutes}m`,
      helper: "Ended room duration",
      meta: `${readyArtifacts} files`,
      icon: Clock3,
    },
  ];

  return (
    <div className="relative h-screen overflow-hidden bg-[#050506] text-white">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-100 saturate-0"
        src="/assets/backgrounds/dashboard-glass-motion.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,3,6,0.04),rgba(3,4,8,0.14)_42%,rgba(0,0,0,0.24)),radial-gradient(circle_at_18%_9%,rgba(255,255,255,0.08),transparent_20%),radial-gradient(circle_at_82%_12%,rgba(255,255,255,0.05),transparent_18%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_58%,rgba(0,0,0,0.18)_100%)]" />

      <div className="relative z-10 flex h-full p-2 lg:p-3">
        <aside className="hidden h-full w-[248px] shrink-0 overflow-hidden rounded-xl border border-white/[0.125] bg-[rgba(143,143,143,0.1)] backdrop-blur-[10px] backdrop-saturate-200 xl:flex xl:flex-col">
          <div className="flex h-[52px] items-center gap-2.5 border-b border-white/[0.12] px-3">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.12] bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="grid min-w-0">
                <span className="truncate text-sm font-semibold">WarpTalk</span>
                <span className="truncate text-[11px] text-white/50">Host Dashboard</span>
              </span>
            </Link>
          </div>

          <DashboardSidebarNav />

          <div className="border-t border-white/10 p-2.5">
            <div className="mb-2 rounded-lg border border-white/[0.14] bg-white/[0.055] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
                Need help?
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-white/46">Frontend preview mode is enabled.</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-medium text-white/58 transition hover:bg-red-500/10 hover:text-red-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </aside>

        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.125] bg-[rgba(143,143,143,0)] backdrop-blur-0 backdrop-saturate-200 xl:rounded-l-none xl:border-l-0">
          <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-white/[0.125] bg-[rgba(143,143,143,0.1)] px-4 backdrop-blur-[10px] backdrop-saturate-200">
            <div className="flex min-w-0 items-center gap-2.5">
              <Home className="hidden h-4 w-4 text-white/42 sm:block" />
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span className="text-white/52">WarpTalk</span>
                <span className="text-white/28">/</span>
                <span className="truncate font-medium text-white">Dashboard</span>
              </div>
            </div>

            <div className="ml-auto hidden w-[300px] items-center rounded-lg border border-white/[0.12] bg-white/[0.035] px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl lg:flex">
              <Search className="h-3.5 w-3.5 text-white/34" />
              <Input
                aria-label="Search pages"
                placeholder="Search pages..."
                className="h-8 border-0 bg-transparent text-xs text-white placeholder:text-white/36 focus-visible:ring-0"
              />
              <span className="rounded border border-white/10 bg-white/8 px-1.5 py-0.5 text-[10px] text-white/42">Ctrl K</span>
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-white/66 hover:bg-white/8 hover:text-white">
              <Bell className="h-3.5 w-3.5" />
              <span className="sr-only">Notifications</span>
            </Button>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.035] px-2.5 text-xs font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] text-black">H</span>
              <span className="hidden sm:inline">Host</span>
            </div>
          </header>

          <main className="flex-1 overflow-hidden">
            <div className="grid h-full max-h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden px-3.5 py-2.5">
              <section className="flex items-center justify-between gap-3">
                <div>
                  <Badge variant="outline" className="mb-1.5 h-6 border-white/10 bg-white/[0.045] px-2 text-[10px] text-white/72">
                    <Activity className="mr-1 h-3 w-3" />
                    Workspace operations
                  </Badge>
                  <h1 className="text-xl font-semibold tracking-tight text-white xl:text-2xl">WarpTalk Dashboard</h1>
                  <p className="mt-0.5 max-w-2xl text-xs text-white/54">
                    Monitor live translation rooms, upcoming sessions, retained artifacts, and transcript activity.
                  </p>
                </div>

                <div className="hidden shrink-0 gap-2 md:flex">
                  <Link
                    href="/rooms/create"
                    className="inline-flex h-8 items-center justify-center rounded-lg bg-white px-3 text-xs font-medium text-black transition hover:bg-white/90"
                  >
                    <Video className="mr-1.5 h-3.5 w-3.5" />
                    Create room
                  </Link>
                  <Link
                    href="/history"
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] px-3 text-xs font-medium text-white transition hover:bg-white/8"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    View history
                  </Link>
                </div>
              </section>

              <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
              </section>

              <section className="grid min-h-0 gap-2.5 overflow-hidden xl:grid-cols-[minmax(0,1fr)_310px]">
                <GlassPanel className="min-h-0 overflow-hidden p-0">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
                    <div>
                      <h2 className="text-sm font-semibold">Translation rooms</h2>
                      <p className="text-xs text-white/48">Filter, scan, and open room workspaces.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <div className="hidden w-[220px] items-center rounded-lg border border-white/10 bg-white/[0.045] px-2.5 md:flex">
                        <Search className="h-3.5 w-3.5 text-white/34" />
                        <Input
                          aria-label="Search rooms"
                          placeholder="Search rooms..."
                          className="h-8 border-0 bg-transparent text-xs text-white placeholder:text-white/36 focus-visible:ring-0"
                        />
                      </div>
                      <Badge className="h-7 bg-white px-2 text-[11px] text-black hover:bg-white">All</Badge>
                    </div>
                  </div>

                  <Table className="table-fixed text-xs">
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="h-8 w-[28%] px-3 text-white/58">Room</TableHead>
                        <TableHead className="h-8 w-[14%] text-white/58">Status</TableHead>
                        <TableHead className="h-8 w-[30%] text-white/58">Languages</TableHead>
                        <TableHead className="h-8 w-[16%] text-white/58">Time</TableHead>
                        <TableHead className="h-8 w-[12%] pr-3 text-right text-white/58">Participants</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rooms.map((room) => (
                        <TableRow key={room.id} className="border-white/10 hover:bg-white/[0.035]">
                          <TableCell className="px-3 py-1.5">
                            <div>
                              <p className="truncate font-medium text-white">{room.title}</p>
                              <p className="truncate text-[11px] text-white/42">{room.translationRoomCode}</p>
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] font-normal", statusTone(room.status))}>
                              {statusLabel(room.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 text-white/62">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Languages className="h-3.5 w-3.5 shrink-0 text-white/38" />
                              <span className="truncate">{formatLanguages(room)}</span>
                            </span>
                          </TableCell>
                          <TableCell className="truncate py-1.5 text-white/62">{formatDateTime(getRoomTime(room))}</TableCell>
                          <TableCell className="py-1.5 pr-3 text-right text-white">
                            {room.participantCount ?? 0}/{room.maxParticipants}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </GlassPanel>

                <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden">
                  <GlassPanel className="p-3">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold">Operational focus</h2>
                        <p className="text-xs text-white/48">What needs attention next</p>
                      </div>
                      <Activity className="h-4 w-4 text-cyan-200" />
                    </div>
                    <div className="grid gap-1.5">
                      <SignalRow icon={<CalendarClock />} label="Upcoming rooms" value={String(upcomingRooms.length)} />
                      <SignalRow icon={<Clock3 />} label="Translated time" value={`${translatedMinutes}m`} />
                      <SignalRow icon={<FileText />} label="Ready artifacts" value={String(readyArtifacts)} />
                    </div>
                  </GlassPanel>

                  <GlassPanel className="min-h-0 overflow-hidden p-3">
                    <div className="mb-2.5">
                      <h2 className="text-sm font-semibold">Language mix</h2>
                      <p className="text-xs text-white/48">Session share by target language</p>
                    </div>
                    <div className="space-y-2">
                      {languageMix.map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-white/70">{item.label}</span>
                            <span className="text-white/42">{item.value}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-white/8">
                            <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>
              </section>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}

function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.125] bg-[rgba(143,143,143,0.15)] p-4 shadow-none backdrop-blur-[15px] backdrop-saturate-200",
        className
      )}
    >
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  meta,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  meta: string;
  icon: typeof LayoutGrid;
}) {
  return (
    <GlassPanel className="min-h-[82px] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-100">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <p className="text-xs text-white/58">{label}</p>
        </div>
        <Badge variant="outline" className="h-5 border-white/10 bg-white/[0.045] px-1.5 text-[10px] font-normal text-white/70">
          {meta}
        </Badge>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1.5 truncate text-xs text-white/48">{helper}</p>
    </GlassPanel>
  );
}

function SignalRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.125] bg-[rgba(143,143,143,0.15)] px-2.5 py-2 backdrop-blur-[15px] backdrop-saturate-200">
      <span className="inline-flex items-center gap-2 text-xs text-white/64">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/8 text-white/60 [&_svg]:h-3.5 [&_svg]:w-3.5">
          {icon}
        </span>
        {label}
      </span>
      <span className="text-xs font-semibold text-white">{value}</span>
    </div>
  );
}
