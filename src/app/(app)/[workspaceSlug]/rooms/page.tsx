"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { CaretRight, CaretDown, CheckCircle, Circle, Copy, Calendar as CalendarIcon, SidebarSimple, Plus, Keyboard } from "@phosphor-icons/react/dist/ssr";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FilterDock,
  FilterDockRow,
  FilterDockSection,
  filterDockSelectContentClass,
  filterDockSelectItemClass,
  filterDockSelectTriggerClass,
} from "@/components/ui/filter-dock";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TranslationRoomDto } from "@/types/translationRoom";
import { StatusPanel } from "./StatusPanel";


function formatTimeShort(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function StatusIcon({ status }: { status: string }) {
  if (status === "in_progress") return <div className="w-3 h-3 rounded-full border-[1.5px] border-status-in-progress bg-status-in-progress/20 shadow-[0_0_8px_var(--color-status-in-progress)]/30" />;
  if (status === "waiting") return <div className="w-3 h-3 rounded-full border-[1.5px] border-status-waiting bg-status-waiting/20" />;
  if (status === "scheduled") return <div className="w-3 h-3 rounded-full border-[1.5px] border-status-scheduled bg-status-scheduled/20" />;
  if (status === "ended") return <CheckCircle size={13} weight="fill" className="text-status-ended" />;
  if (["cancelled", "failed", "expired"].includes(status)) return <div className="w-3 h-3 rounded-full border-[1.5px] border-status-error bg-status-error/20" />;
  return <Circle size={13} weight="light" className="text-muted-foreground/40" />;
}

function LanguageWithFlag({ locale, hideText }: { locale: string; hideText?: boolean }) {
  if (!locale) return null;
  const parts = locale.split("-");
  const langCode = parts[0].toUpperCase();
  const countryCode = parts.length > 1 ? parts[1].toUpperCase() : "";
  let flag = "";
  if (countryCode) {
    const codePoints = countryCode.split("").map(char => 127397 + char.charCodeAt(0));
    flag = String.fromCodePoint(...codePoints);
  }
  return (
    <div className="flex items-center gap-1">
      {flag && <span className="text-[14px] leading-none">{flag}</span>}
      {!hideText && <span className="font-medium">{langCode}</span>}
    </div>
  );
}

function LinearRow({ room }: { room: TranslationRoomDto }) {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string;
  const user = useAuthStore((state) => state.user);
  const role = useWorkspaceRole();
  const isCurrentUserHost = room.hostId === user?.id || Boolean(room.isHost);
  const hostName = isCurrentUserHost && user?.fullName ? user.fullName : "Host";
  const hostAvatar = isCurrentUserHost ? user?.avatarUrl : undefined;

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
        <span className="text-foreground font-medium truncate block">{room.title}</span>
        {user?.id && room.hostId !== user.id && (
          <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-500/20">
            Invited
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0 text-muted-foreground text-[11px]">
        <StatusPanel status={room.status} />

        <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <Avatar className="size-5 rounded-full">
            <AvatarImage src={hostAvatar} alt={hostName} />
            <AvatarFallback className="text-[9px] font-medium bg-primary/10 text-primary">
              {hostName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-ink-muted pr-1.5">{hostName}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <LanguageWithFlag locale={room.sourceLanguage || "en-US"} />
          {room.targetLanguages.length > 1 ? (
            <>
              <span className="text-muted-foreground/40 font-bold px-1 text-[13px]">;</span>
              <div className="flex items-center">
                {room.targetLanguages.map((t, i) => (
                  <div key={t} className="flex items-center">
                    {i > 0 && <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>}
                    <LanguageWithFlag locale={t} hideText={true} />
                  </div>
                ))}
                <div className="flex items-center">
                  <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>
                  <div className="flex items-center justify-center px-1">
                    <Plus weight="bold" size={12} className="text-ink-muted" />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <span className="text-border mx-0.5 font-bold">→</span>
              <LanguageWithFlag locale={room.targetLanguages[0]} />
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <span className="tabular-nums">{room.participantCount}/{room.maxParticipants}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] min-w-[80px] justify-center">
          <CalendarIcon size={13} weight="regular" />
          <span className="tabular-nums">
            {formatTimeShort(room.scheduledAt ?? room.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function DailyTimeline({ date, rooms }: { date: Date; rooms: TranslationRoomDto[] }) {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string;
  const scrollRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);
  const startHour = 0;
  const endHour = 24;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);
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
        const currentTop = (currentTime.getHours() * 60 + currentTime.getMinutes()) * minuteHeight;
        scrollRef.current.scrollTop = Math.max(0, currentTop - 200);
      } else {
        scrollRef.current.scrollTop = 8 * hourHeight; // default 8 AM
      }
    }
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date.toDateString() === new Date().toDateString();
  const currentTop = (currentTime.getHours() * 60 + currentTime.getMinutes()) * minuteHeight;

  return (
    <div className="flex-1 overflow-y-auto relative bg-surface-1" ref={scrollRef}>
      <div className="flex relative" style={{ minHeight: `${24 * hourHeight}px` }}>
        {/* Time column */}
        <div className="w-16 shrink-0 border-r border-border/50 flex flex-col relative z-10 bg-surface-1">
          {hours.map((hour) => (
            <div key={hour} className="relative w-full" style={{ height: hourHeight }}>
              <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground tabular-nums select-none font-medium">
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline grid */}
        <div className="flex-1 relative">
          {/* Horizontal lines */}
          {hours.map((hour) => (
            <div key={hour} className="absolute w-full border-t border-border/40 pointer-events-none" style={{ top: hour * hourHeight, height: hourHeight }} />
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
              const validRooms = rooms.filter(r => r.scheduledAt);
              // Sort by start time
              validRooms.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

              // Calculate columns for overlapping events
              const columns: TranslationRoomDto[][] = [];
              const layouts = new Map<string, { column: number }>();
              
              validRooms.forEach(room => {
                const start = new Date(room.scheduledAt!).getTime();
                
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                  const col = columns[i];
                  const lastEvent = col[col.length - 1];
                  const lastEnd = new Date(lastEvent.scheduledAt!).getTime() + (lastEvent.durationSeconds ?? 3600) * 1000;
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
                      width: `calc(${widthPercent}% - 0.5rem)`
                    }}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-semibold text-primary text-[12px] leading-tight truncate">{room.title}</span>
                        {user?.id && room.hostId !== user.id && (
                          <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[8px] font-medium text-amber-600 border border-amber-500/20">
                            Invited
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-primary/70 font-medium shrink-0">
                        {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                        {new Date(scheduledDate.getTime() + durationMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {height >= 40 && (
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-primary/80 truncate">
                        <span>{room.sourceLanguage} {room.targetLanguages.length > 1 ? ";" : "→"} {room.targetLanguages.join(", ")}</span>
                        <span>•</span>
                        <span className="font-mono">{room.translationRoomCode}</span>
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
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    setJoinModalOpen(false);
    router.push(`/join?code=${encodeURIComponent(trimmed)}`);
  }
  const [isGroupOpen, setIsGroupOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "scheduled" | "history" | "all">("active");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const roomList = useTranslationRooms({ 
    pageSize: 100,
    status: "SCHEDULED,WAITING,IN_PROGRESS,PAUSED,ENDED,CANCELLED,TIMEOUT"
  });
  const setCreateRoomModalOpen = useUIStore((state) => state.setCreateRoomModalOpen);

  const rooms = useMemo(() => {
    return roomList.data?.rooms ?? [];
  }, [roomList.data?.rooms]);

  const filteredRooms = useMemo(() => {
    if (activeTab === "active") {
      const now = new Date();
      const fifteenMinsFromNow = new Date(now.getTime() + 15 * 60000);
      return rooms.filter(r => 
        r.status === "in_progress" || 
        r.status === "waiting" || 
        (r.status === "scheduled" && (!r.scheduledAt || new Date(r.scheduledAt) <= fifteenMinsFromNow))
      );
    }
    if (activeTab === "scheduled") {
      if (!selectedDate) return rooms.filter(r => r.status === "scheduled");
      return rooms.filter(r => r.status === "scheduled" && r.scheduledAt && new Date(r.scheduledAt).toDateString() === selectedDate.toDateString());
    }
    if (activeTab === "history") return rooms.filter(r => r.status === "ended" || r.status === "cancelled" || r.status === "timeout");
    return rooms;
  }, [rooms, activeTab, selectedDate]);
  const activeRoomsFilterCount = activeTab !== "active" ? 1 : 0;

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
          <FilterDock activeCount={activeRoomsFilterCount} label="Room filters" className="size-7">
            <FilterDockSection title="Room filters">
              <FilterDockRow label="Status" icon={<Circle size={15} />}>
                <Select value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                  <SelectTrigger aria-label="Room status" className={filterDockSelectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={filterDockSelectContentClass}>
                    <SelectItem value="active" className={filterDockSelectItemClass}>Active now</SelectItem>
                    <SelectItem value="scheduled" className={filterDockSelectItemClass}>Scheduled</SelectItem>
                    <SelectItem value="history" className={filterDockSelectItemClass}>History</SelectItem>
                    <SelectItem value="all" className={filterDockSelectItemClass}>All rooms</SelectItem>
                  </SelectContent>
                </Select>
              </FilterDockRow>

              <FilterDockRow label="Scheduled date" icon={<CalendarIcon size={15} />}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(new Date());
                    setActiveTab("scheduled");
                  }}
                  className="h-8 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-[12px] font-medium text-neutral-100 transition-colors hover:bg-neutral-800"
                >
                  Today
                </button>
              </FilterDockRow>
            </FilterDockSection>
          </FilterDock>

          <FilterDock mode="view" label="Display options" className="size-7">
            <div className="grid grid-cols-2 gap-2 p-1">
              <button
                type="button"
                onClick={() => setIsGroupOpen(true)}
                className="h-9 rounded-full bg-neutral-800 text-[13px] font-semibold text-neutral-100 transition-colors hover:bg-neutral-700"
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("scheduled")}
                className="h-9 rounded-full border border-neutral-800 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
              >
                Calendar
              </button>
            </div>

            <FilterDockSection title="List options">
              <FilterDockRow label="Grouping" icon={<SidebarSimple size={15} />}>
                <button
                  type="button"
                  onClick={() => setIsGroupOpen((open) => !open)}
                  className="h-8 w-[148px] rounded-md border border-neutral-800 bg-neutral-900 px-3 text-left text-[12px] font-medium text-neutral-100 transition-colors hover:bg-neutral-800"
                >
                  {isGroupOpen ? "Expanded" : "Collapsed"}
                </button>
              </FilterDockRow>
              <FilterDockRow label="Ordering" icon={<CaretDown size={15} />}>
                <span className="inline-flex h-8 w-[148px] items-center rounded-md border border-neutral-800 bg-neutral-900 px-3 text-[12px] font-medium text-neutral-400">
                  Recency
                </span>
              </FilterDockRow>
              <FilterDockRow label="Completed rooms" icon={<CheckCircle size={15} />}>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className="h-8 w-[148px] rounded-md border border-neutral-800 bg-neutral-900 px-3 text-left text-[12px] font-medium text-neutral-100 transition-colors hover:bg-neutral-800"
                >
                  Show history
                </button>
              </FilterDockRow>
            </FilterDockSection>
          </FilterDock>
          
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
              />
            </div>
            <div className="mt-6 text-[13px] text-muted-foreground w-full px-1">
              <p className="font-semibold text-foreground mb-1.5 flex items-center gap-2">
                <CalendarIcon size={16} weight="duotone" />
                {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <p className="leading-relaxed">
                {filteredRooms.length === 0
                  ? "You have no meetings scheduled for this day."
                  : `You have ${filteredRooms.length} meeting${filteredRooms.length === 1 ? '' : 's'} scheduled for this day.`}
              </p>
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
              <span className="font-medium text-foreground capitalize">{activeTab} Meetings</span>
              <span className="tabular-nums">{filteredRooms.length}</span>
            </div>

            {/* Group Content */}
            {isGroupOpen && (
              <div className="flex flex-col pb-8">
                {filteredRooms.length > 0 ? (
                  filteredRooms.map((room) => (
                    <LinearRow key={room.id} room={room} />
                  ))
                ) : (
                  <div className="px-6 py-12 text-[13px] text-muted-foreground flex flex-col items-center justify-center">
                    <CalendarIcon size={32} weight="light" className="mb-3 opacity-30" />
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
              <Label htmlFor="code" className="text-foreground font-medium text-[13px]">Meeting code</Label>
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
