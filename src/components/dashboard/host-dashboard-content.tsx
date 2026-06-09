"use client";

import { useMemo, type ReactNode } from "react";
import { Calendar, Clock, FileText, Translate, SquaresFour, MagnifyingGlass, Users, VideoCamera } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { cn } from "@/lib/utils";
import type { TranslationRoomDto } from "@/types/translationRoom";


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
      return "border-emerald-500/20 text-emerald-500";
    case "scheduled":
      return "border-blue-500/20 text-blue-500";
    case "waiting":
      return "border-amber-500/20 text-amber-500";
    case "ended":
      return "border-border text-muted-foreground";
    default:
      return "border-border text-muted-foreground";
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
    return roomList.data?.rooms ?? [];
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

  const metrics = [
    {
      label: "Total rooms",
      value: rooms.length,
    },
    {
      label: "Upcoming",
      value: upcomingRooms.length,
    },
    {
      label: "Live sessions",
      value: activeRooms.length,
    },
    {
      label: "Participants",
      value: totalParticipants,
    },
    {
      label: "Translated time",
      value: `${translatedMinutes}m`,
    },
  ];

  return (
    <div className="flex h-full flex-col min-h-0 bg-background text-foreground max-w-[1200px] mx-auto w-full">
      {/* Top Header Metrics (Card-less) */}
      <section className="flex items-center gap-12 border-b border-border pb-6 pt-2">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <p className="text-[13px] text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{metric.value}</p>
          </div>
        ))}
      </section>

      {/* Main Content layout (Single Column) */}
      <section className="flex flex-1 min-h-0 pt-6">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold text-foreground">Translation rooms</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-md border border-border bg-muted/50 px-2.5 h-8">
                <MagnifyingGlass weight="light" className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  aria-label="MagnifyingGlass rooms"
                  placeholder="MagnifyingGlass..."
                  className="h-full border-0 bg-transparent text-[13px] px-2 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 shadow-none w-[160px]"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-4">
            {/* Table Header pseudo-list */}
            <div className="flex items-center border-b border-border py-2 text-[12px] font-medium text-muted-foreground">
              <div className="w-[30%]">Room</div>
              <div className="w-[15%]">Status</div>
              <div className="w-[30%]">Translate</div>
              <div className="w-[15%]">Time</div>
              <div className="w-[10%] text-right">Participants</div>
            </div>

            {/* List Rows */}
            <div className="flex flex-col">
              {rooms.map((room) => (
                <div key={room.id} className="flex items-center border-b border-border/50 py-3 text-[13px] hover:bg-muted/30 transition-colors group cursor-pointer">
                  <div className="w-[30%] pr-4">
                    <p className="truncate font-medium text-foreground group-hover:text-primary transition-colors">{room.title}</p>
                    <p className="truncate text-[12px] text-muted-foreground mt-0.5">{room.translationRoomCode}</p>
                  </div>
                  <div className="w-[15%]">
                    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium bg-transparent", statusTone(room.status))}>
                      {statusLabel(room.status)}
                    </span>
                  </div>
                  <div className="w-[30%] text-muted-foreground pr-4">
                    <span className="truncate">{formatLanguages(room)}</span>
                  </div>
                  <div className="w-[15%] truncate text-muted-foreground text-[12px]">{formatDateTime(getRoomTime(room))}</div>
                  <div className="w-[10%] text-right text-muted-foreground">
                    {room.participantCount ?? 0}/{room.maxParticipants}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
