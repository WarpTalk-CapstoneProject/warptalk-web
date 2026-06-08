"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaretRight, CaretDown, CheckCircle, Circle, DotsThree } from "@phosphor-icons/react/dist/ssr";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import type { TranslationRoomDto } from "@/types/translationRoom";

const demoRooms: TranslationRoomDto[] = [
  {
    id: "preview-investor-qa",
    workspaceId: "preview",
    hostId: "host",
    title: "Investor Q&A Translation",
    description: "Live multilingual room for product due diligence.",
    translationRoomCode: "WARP-241",
    status: "in_progress",
    translationRoomType: "scheduled",
    maxParticipants: 24,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN", "ja-JP"],
    startedAt: new Date().toISOString(),
    scheduledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    participantCount: 18,
    isHost: true,
  },
  {
    id: "preview-partner-sync",
    workspaceId: "preview",
    hostId: "host",
    title: "Partner Sync Room",
    description: "Scheduled interpretation room for APAC stakeholders.",
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
    description: "Waiting room for enterprise onboarding and support.",
    translationRoomCode: "CUST-104",
    status: "waiting",
    translationRoomType: "scheduled",
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
    description: "Completed session with transcript artifacts ready.",
    translationRoomCode: "BORD-778",
    status: "ended",
    translationRoomType: "scheduled",
    maxParticipants: 20,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN"],
    endedAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    participantCount: 14,
    isHost: true,
  },
];

function formatTimeShort(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function StatusIcon({ status }: { status: string }) {
  if (status === "in_progress") return <div className="w-3 h-3 rounded-full border-[1.5px] border-foreground/70 bg-foreground/10" />;
  if (status === "scheduled" || status === "waiting") return <div className="w-3 h-3 rounded-full border-[1.5px] border-muted-foreground/40" />;
  if (status === "ended") return <CheckCircle size={13} weight="light" className="text-muted-foreground" />;
  return <Circle size={13} weight="light" className="text-muted-foreground/40" />;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="text-[11px] text-muted-foreground capitalize">
      {status.replace(/_/g, " ")}
    </span>
  );
}

function LinearRow({ room }: { room: TranslationRoomDto }) {
  return (
    <Link 
      href={`/rooms/${room.id}`}
      className="flex items-center h-[34px] text-[13px] hover:bg-accent/50 border-b border-border/40 px-4 group cursor-pointer transition-colors"
    >
      <div className="flex items-center w-5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground">
        <DotsThree size={14} weight="bold" />
      </div>
      
      <div className="flex items-center w-8 shrink-0">
        <StatusIcon status={room.status} />
      </div>
      
      <div className="w-[72px] shrink-0 font-mono text-[11px] text-muted-foreground tracking-tight">
        {room.translationRoomCode}
      </div>
      
      <div className="flex-1 min-w-0">
        <span className="text-foreground truncate block">{room.title}</span>
      </div>
      
      <div className="flex items-center gap-4 shrink-0 text-muted-foreground text-[11px]">
        <StatusBadge status={room.status} />
        <span>{room.sourceLanguage} → {room.targetLanguages[0]}</span>
        <span className="tabular-nums">{room.participantCount}/{room.maxParticipants}</span>
        <span className="w-[52px] text-right tabular-nums">
          {formatTimeShort(room.scheduledAt ?? room.createdAt)}
        </span>
      </div>
    </Link>
  );
}

export default function MeetingsPageLinear() {
  const [isGroupOpen, setIsGroupOpen] = useState(true);
  const roomList = useTranslationRooms({ pageSize: 100 });

  const rooms = useMemo(() => {
    const apiRooms = roomList.data?.rooms ?? [];
    return apiRooms.length > 0 ? apiRooms : demoRooms;
  }, [roomList.data?.rooms]);

  return (
    <div className="flex flex-col h-full ">
      
      {/* View Tabs */}
      <div className="flex items-center px-4 border-b border-border h-[38px] shrink-0">
        <div className="flex gap-0 text-[13px] h-full">
          <div className="h-full flex items-center border-b-[1.5px] border-foreground text-foreground font-medium px-2.5">
            Active
          </div>
          <div className="h-full flex items-center text-muted-foreground hover:text-foreground cursor-pointer px-2.5 transition-colors">
            Scheduled
          </div>
          <div className="h-full flex items-center text-muted-foreground hover:text-foreground cursor-pointer px-2.5 transition-colors">
            History
          </div>
          <div className="h-full flex items-center text-muted-foreground hover:text-foreground cursor-pointer px-2.5 transition-colors">
            All
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Group Header */}
        <div 
          className="flex items-center gap-1.5 px-4 h-[30px] hover:bg-accent/40 cursor-pointer text-[12px] text-muted-foreground select-none transition-colors"
          onClick={() => setIsGroupOpen(!isGroupOpen)}
        >
          {isGroupOpen ? (
            <CaretDown size={12} weight="bold" />
          ) : (
            <CaretRight size={12} weight="bold" />
          )}
          <span className="font-medium text-foreground">Active & Upcoming</span>
          <span className="tabular-nums">{rooms.length}</span>
        </div>

        {/* Group Content */}
        {isGroupOpen && (
          <div className="flex flex-col">
            {rooms.map((room) => (
              <LinearRow key={room.id} room={room} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
