"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Calendar, Clock, FileText, Translate, SquaresFour, MagnifyingGlass, Users, VideoCamera, Plus } from "@phosphor-icons/react/dist/ssr";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import type { TranslationRoomDto } from "@/types/translationRoom";


const demoHistory = [
  {
    id: "ended-board-review",
    title: "Board Review Translation",
    translationRoomCode: "BORD-778",
    status: "ended" as const,
    endedAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    durationSeconds: 46 * 60,
    participantCount: 14,
    maxParticipants: 20,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN", "ja-JP"],
  },
  {
    id: "ended-product-demo",
    title: "Product Demo Follow-up",
    translationRoomCode: "PROD-213",
    status: "ended" as const,
    endedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    durationSeconds: 32 * 60,
    participantCount: 8,
    maxParticipants: 10,
    sourceLanguage: "vi-VN",
    targetLanguages: ["en-US"],
  },
  {
    id: "ended-legal-review",
    title: "Legal Review Session",
    translationRoomCode: "LEGL-889",
    status: "ended" as const,
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    durationSeconds: 58 * 60,
    participantCount: 11,
    maxParticipants: 15,
    sourceLanguage: "en-US",
    targetLanguages: ["ko-KR", "vi-VN"],
  },
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

function getRoomTime(room: Pick<TranslationRoomDto, "scheduledAt" | "startedAt" | "createdAt">) {
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

  return `${source} → ${targets || "No target"}`;
}

function statusColor(status: TranslationRoomDto["status"]) {
  switch (status) {
    case "in_progress":
      return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    case "scheduled":
      return "bg-blue-500";
    case "waiting":
      return "bg-amber-500";
    case "ended":
      return "bg-neutral-500";
    default:
      return "bg-neutral-500";
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

function StatusBadge({ status }: { status: TranslationRoomDto["status"] }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-1.5 w-1.5 rounded-full", statusColor(status))} />
      <span className="text-[12px] font-medium text-muted-foreground">{statusLabel(status)}</span>
    </div>
  );
}

export default function DashboardPage() {
  const roomList = useTranslationRooms({ pageSize: 100 });
  const history = useRoomHistory();
  const setCreateRoomModalOpen = useUIStore((state) => state.setCreateRoomModalOpen);

  const rooms = useMemo(() => {
    return roomList.data?.rooms ?? [];
  }, [roomList.data?.rooms]);

  const historyRows = useMemo(() => {
    const apiHistory =
      history.data?.rooms.map((room) => ({
        id: room.id,
        title: room.title,
        translationRoomCode: room.translationRoomCode,
        status: room.status,
        endedAt: room.endedAt,
        createdAt: room.createdAt,
        durationSeconds: room.durationSeconds,
        participantCount: room.participantCount,
        maxParticipants: room.maxParticipants,
        sourceLanguage: room.sourceLanguage,
        targetLanguages: room.targetLanguages,
      })) ?? [];

    return apiHistory.length > 0 ? apiHistory : demoHistory;
  }, [history.data?.rooms]);

  const activeRooms = rooms.filter((room) => room.status === "in_progress" || room.status === "paused");
  const upcomingRooms = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting");
  
  const allRooms = [...rooms, ...historyRows].sort((a, b) => {
    const timeA = new Date(getRoomTime(a)).getTime();
    const timeB = new Date(getRoomTime(b)).getTime();
    return timeB - timeA;
  });

  const totalParticipants =
    rooms.reduce((total, room) => total + (room.participantCount ?? 0), 0) +
    historyRows.reduce((total, room) => total + room.participantCount, 0);
  const translatedMinutes = Math.round(historyRows.reduce((total, room) => total + room.durationSeconds, 0) / 60);

  const metrics = [
    { label: "Total rooms", value: rooms.length + historyRows.length, icon: SquaresFour },
    { label: "Upcoming", value: upcomingRooms.length, icon: Calendar },
    { label: "Live sessions", value: activeRooms.length, icon: VideoCamera },
    { label: "Participants", value: totalParticipants, icon: Users },
    { label: "Translated time", value: `${translatedMinutes}m`, icon: Translate },
  ];

  return (
    <div className="flex h-full flex-col min-h-0 bg-background text-foreground max-w-[1200px] mx-auto w-full relative">
      {/* Background radial gradient for subtle depth */}
      <div className="pointer-events-none absolute left-0 top-0 h-96 w-full bg-[radial-gradient(ellipse_at_top_left,var(--color-primary)_0%,transparent_60%)] opacity-[0.03] mix-blend-screen" />

      {/* Top Header Metrics (Bento style) */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-8 pt-2 relative z-10">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-surface-1/40 p-5 shadow-sm backdrop-blur-md transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground">
              <metric.icon size={16} weight="duotone" />
              <p className="text-[12px] font-medium">{metric.label}</p>
            </div>
            <p className="text-3xl font-semibold tracking-tight text-foreground">{metric.value}</p>
          </div>
        ))}
      </section>

      {/* Main Content layout */}
      <section className="flex flex-1 min-h-0 relative z-10">
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* Header & Actions */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold text-foreground">Recent & Upcoming Rooms</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-border bg-surface-1/50 px-2.5 h-[34px] shadow-sm focus-within:ring-1 focus-within:ring-primary/30 transition-all">
                <MagnifyingGlass weight="light" className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search rooms..."
                  className="h-full border-0 bg-transparent text-[13px] px-2 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 shadow-none w-[180px]"
                />
                <div className="ml-2 hidden items-center justify-center rounded border border-border bg-surface-2 px-1.5 text-[10px] font-medium text-muted-foreground sm:flex">
                  /
                </div>
              </div>
              <button 
                onClick={() => setCreateRoomModalOpen(true)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all shadow-sm h-[34px]"
              >
                <Plus size={14} weight="bold" />
                New Room
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl border border-border/50 bg-surface-1/30 shadow-sm">
            {/* Table Header pseudo-list */}
            <div className="flex items-center border-b border-border/50 px-5 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider sticky top-0 bg-surface-1/90 backdrop-blur-sm z-10">
              <div className="w-[35%]">Room</div>
              <div className="w-[15%]">Status</div>
              <div className="w-[25%]">Translation</div>
              <div className="w-[15%]">Date & Time</div>
              <div className="w-[10%] text-right">Participants</div>
            </div>

            {/* List Rows */}
            <div className="flex flex-col">
              {allRooms.map((room) => (
                <Link 
                  href={`/rooms/${room.id}`} 
                  key={room.id} 
                  className="flex items-center border-b border-border/30 px-5 py-3.5 text-[13px] hover:bg-accent/40 transition-colors group cursor-pointer relative"
                >
                  {/* Subtle active indicator on hover */}
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
                  
                  <div className="w-[35%] pr-4 flex flex-col justify-center">
                    <p className="truncate font-semibold text-foreground group-hover:text-primary transition-colors">{room.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground mt-1 font-mono tracking-tight">{room.translationRoomCode}</p>
                  </div>
                  <div className="w-[15%]">
                    <StatusBadge status={room.status as TranslationRoomDto["status"]} />
                  </div>
                  <div className="w-[25%] text-muted-foreground pr-4">
                    <span className="truncate flex items-center gap-1.5 text-[12px]">
                      <Translate size={14} className="opacity-50" />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {formatLanguages(room as any)}
                    </span>
                  </div>
                  <div className="w-[15%] truncate text-muted-foreground text-[12px] flex items-center gap-1.5">
                    <Clock size={14} className="opacity-50" />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {formatDateTime(getRoomTime(room as any))}
                  </div>
                  <div className="w-[10%] text-right text-muted-foreground font-mono text-[12px]">
                    {room.participantCount ?? 0} <span className="opacity-40">/ {room.maxParticipants}</span>
                  </div>
                </Link>
              ))}
              {allRooms.length === 0 && (
                <div className="py-16 flex flex-col items-center justify-center text-muted-foreground">
                  <SquaresFour size={32} weight="light" className="mb-3 opacity-30" />
                  <p className="text-sm">No translation rooms found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
