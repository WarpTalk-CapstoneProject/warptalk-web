"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarClock,
  Clock3,
  FileText,
  Languages,
  LayoutGrid,
  Search,
  Users,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import type { TranslationRoomDto } from "@/types/translationRoom";

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

const languageMix = [
  { label: "Vietnamese", value: 42, color: "bg-neutral-950" },
  { label: "English", value: 28, color: "bg-neutral-500" },
  { label: "Japanese", value: 18, color: "bg-neutral-300" },
  { label: "Korean", value: 12, color: "bg-neutral-700" },
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
      return "border-neutral-950 bg-neutral-950 text-white";
    case "scheduled":
      return "border-neutral-950/15 bg-white/70 text-neutral-900";
    case "waiting":
      return "border-neutral-950/15 bg-neutral-200/80 text-neutral-900";
    case "ended":
      return "border-neutral-950/10 bg-white/45 text-neutral-500";
    default:
      return "border-neutral-950/10 bg-white/45 text-neutral-500";
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

export default function DashboardPage() {
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
    <>
      <section className="flex items-center justify-between gap-2">
        <div>
          <Badge variant="outline" className="mb-1 h-5 border-white/60 bg-white/60 px-2 text-[9px] text-neutral-600">
            <Activity className="mr-1 h-2.5 w-2.5" />
            Workspace operations
          </Badge>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-950 xl:text-xl">WarpTalk Dashboard</h1>
          <p className="max-w-2xl text-[11px] text-neutral-600">
            Monitor live translation rooms, upcoming sessions, retained artifacts, and transcript activity.
          </p>
        </div>

        <div className="hidden shrink-0 gap-2 md:flex">
          <Link
            href="/rooms/create"
            className="inline-flex h-7 items-center justify-center rounded-full bg-neutral-950 px-3 text-[11px] font-medium text-white shadow-[0_12px_24px_rgba(0,0,0,0.14)] transition hover:bg-neutral-800"
          >
            <Video className="mr-1.5 h-3 w-3" />
            Create
          </Link>
          <Link
            href="/history"
            className="inline-flex h-7 items-center justify-center rounded-full border border-white/60 bg-white/60 px-3 text-[11px] font-medium text-neutral-950 transition hover:bg-white"
          >
            <FileText className="mr-1.5 h-3 w-3" />
            View history
          </Link>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid min-h-[500px] gap-2 xl:grid-cols-[minmax(0,1fr)_280px]">
                <GlassPanel className="min-h-0 overflow-hidden p-0">
                  <div className="flex items-center justify-between gap-2 border-b border-neutral-950/8 px-3 py-2">
                    <div>
                      <h2 className="text-[13px] font-semibold">Translation rooms</h2>
                      <p className="text-[11px] text-neutral-500">Filter, scan, and open room workspaces.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <div className="hidden w-[200px] items-center rounded-full border border-white/60 bg-white/60 px-2.5 md:flex">
                        <Search className="h-3 w-3 text-neutral-500" />
                        <Input
                          aria-label="Search rooms"
                          placeholder="Search rooms..."
                          className="h-7 border-0 bg-transparent text-[11px] text-neutral-950 placeholder:text-neutral-400 focus-visible:ring-0"
                        />
                      </div>
                      <Badge className="h-7 bg-neutral-950 px-2 text-[10px] text-white hover:bg-neutral-950">All</Badge>
                    </div>
                  </div>

                  <Table className="table-fixed text-[11px]">
                    <TableHeader>
                      <TableRow className="border-neutral-950/8 hover:bg-transparent">
                        <TableHead className="h-7 w-[28%] px-3 text-neutral-500">Room</TableHead>
                        <TableHead className="h-7 w-[14%] text-neutral-500">Status</TableHead>
                        <TableHead className="h-7 w-[30%] text-neutral-500">Languages</TableHead>
                        <TableHead className="h-7 w-[16%] text-neutral-500">Time</TableHead>
                        <TableHead className="h-7 w-[12%] pr-3 text-right text-neutral-500">Participants</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rooms.map((room) => (
                        <TableRow key={room.id} className="border-neutral-950/8 hover:bg-white/45">
                          <TableCell className="px-3 py-1">
                            <div>
                              <p className="truncate font-medium text-neutral-950">{room.title}</p>
                              <p className="truncate text-[10px] text-neutral-500">{room.translationRoomCode}</p>
                            </div>
                          </TableCell>
                          <TableCell className="py-1">
                            <Badge variant="outline" className={cn("h-5 px-1.5 text-[9px] font-normal", statusTone(room.status))}>
                              {statusLabel(room.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1 text-neutral-600">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Languages className="h-3 w-3 shrink-0 text-neutral-400" />
                              <span className="truncate">{formatLanguages(room)}</span>
                            </span>
                          </TableCell>
                          <TableCell className="truncate py-1 text-neutral-600">{formatDateTime(getRoomTime(room))}</TableCell>
                          <TableCell className="py-1 pr-3 text-right text-neutral-950">
                            {room.participantCount ?? 0}/{room.maxParticipants}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </GlassPanel>

                <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden">
                  <GlassPanel className="p-2.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div>
                        <h2 className="text-[13px] font-semibold">Operational focus</h2>
                        <p className="text-[11px] text-neutral-500">What needs attention next</p>
                      </div>
                      <Activity className="h-3.5 w-3.5 text-neutral-950" />
                    </div>
                    <div className="grid gap-1.5">
                      <SignalRow icon={<CalendarClock />} label="Upcoming rooms" value={String(upcomingRooms.length)} />
                      <SignalRow icon={<Clock3 />} label="Translated time" value={`${translatedMinutes}m`} />
                      <SignalRow icon={<FileText />} label="Ready artifacts" value={String(readyArtifacts)} />
                    </div>
                  </GlassPanel>

                  <GlassPanel className="min-h-0 overflow-hidden p-2.5">
                    <div className="mb-2.5">
                      <h2 className="text-[13px] font-semibold">Language mix</h2>
                      <p className="text-[11px] text-neutral-500">Session share by target language</p>
                    </div>
                    <div className="space-y-1.5">
                      {languageMix.map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="text-neutral-700">{item.label}</span>
                            <span className="text-neutral-500">{item.value}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-neutral-950/10">
                            <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>
              </section>
    </>
  );
}

function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-white/65 bg-white/52 p-3 text-neutral-950 shadow-[0_16px_48px_rgba(0,0,0,0.07)] backdrop-blur-[26px] backdrop-saturate-150",
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
  const featured = label === "Total rooms";

  return (
    <GlassPanel
      className={cn(
        "min-h-[72px] p-2.5",
        featured && "border-neutral-950/5 bg-neutral-950 text-white shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-none"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-xl shadow-[0_10px_18px_rgba(0,0,0,0.12)]",
              featured ? "bg-white text-neutral-950" : "bg-neutral-950 text-white"
            )}
          >
            <Icon className="h-3 w-3" />
          </span>
          <p className={cn("text-[11px]", featured ? "text-white/70" : "text-neutral-600")}>{label}</p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "h-5 px-1.5 text-[9px] font-normal",
            featured ? "border-white/10 bg-white/10 text-white/70" : "border-neutral-950/10 bg-white/55 text-neutral-600"
          )}
        >
          {meta}
        </Badge>
      </div>
      <p className="mt-1.5 text-xl font-semibold tracking-tight">{value}</p>
      <p className={cn("mt-1 truncate text-[11px]", featured ? "text-white/55" : "text-neutral-500")}>{helper}</p>
    </GlassPanel>
  );
}

function SignalRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/36 px-2.5 py-1.5">
      <span className="inline-flex items-center gap-2 text-[11px] text-neutral-700">
        <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-neutral-950 text-white [&_svg]:h-3 [&_svg]:w-3">
          {icon}
        </span>
        {label}
      </span>
      <span className="text-[11px] font-semibold text-neutral-950">{value}</span>
    </div>
  );
}
