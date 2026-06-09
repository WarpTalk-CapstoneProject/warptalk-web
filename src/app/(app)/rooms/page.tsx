"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaretRight, CaretDown, CheckCircle, Circle, DotsThree, Copy, Calendar as CalendarIcon } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import type { TranslationRoomDto } from "@/types/translationRoom";


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
      <div className="flex items-center w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground">
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
  const [activeTab, setActiveTab] = useState<"active" | "scheduled" | "history" | "all">("active");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const roomList = useTranslationRooms({ pageSize: 100 });

  const rooms = useMemo(() => {
    return roomList.data?.rooms ?? [];
  }, [roomList.data?.rooms]);

  const filteredRooms = useMemo(() => {
    if (activeTab === "active") return rooms.filter(r => r.status === "in_progress" || r.status === "waiting");
    if (activeTab === "scheduled") {
      if (!selectedDate) return rooms.filter(r => r.status === "scheduled");
      return rooms.filter(r => r.status === "scheduled" && r.scheduledAt && new Date(r.scheduledAt).toDateString() === selectedDate.toDateString());
    }
    if (activeTab === "history") return rooms.filter(r => r.status === "ended" || r.status === "cancelled");
    return rooms;
  }, [rooms, activeTab, selectedDate]);

  return (
    <div className="flex flex-col h-full ">
      
      {/* View Tabs */}
      <div className="flex items-center px-4 border-b border-border h-[38px] shrink-0">
        <div className="flex gap-0 text-[13px] h-full">
          {(["active", "scheduled", "history", "all"] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-full flex items-center px-2.5 cursor-pointer transition-colors capitalize ${activeTab === tab ? "border-b-[1.5px] border-foreground text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === "scheduled" && (
          <div className="w-[300px] border-r border-border flex flex-col items-center py-4 px-2 overflow-y-auto bg-surface-1/30">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border bg-surface-1 shadow-sm"
            />
            <div className="mt-4 text-[12px] text-muted-foreground w-full px-2">
              <p className="font-medium text-foreground mb-1">Scheduled for {selectedDate?.toDateString()}</p>
              <p>Select a date to view meetings scheduled for that day.</p>
            </div>
          </div>
        )}

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
            <span className="font-medium text-foreground capitalize">{activeTab} Meetings</span>
            <span className="tabular-nums">{filteredRooms.length}</span>
          </div>

          {/* Group Content */}
          {isGroupOpen && (
            <div className="flex flex-col">
              {filteredRooms.length > 0 ? (
                filteredRooms.map((room) => (
                  <LinearRow key={room.id} room={room} />
                ))
              ) : (
                <div className="px-6 py-8 text-[13px] text-muted-foreground flex flex-col items-center justify-center border-t border-border/40">
                  <CalendarIcon size={24} weight="light" className="mb-2 opacity-50" />
                  <p>No {activeTab} meetings found.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
