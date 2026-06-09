"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Star,
  Link as LinkIcon,
  Copy,
  ChevronDown,
  Info,
  Globe2,
  Calendar,
  ArrowRight,
  Clock,
  MapPin,
  Video,
  Users,
} from "lucide-react";

import { useTranslationRoom, useTranslationRoomParticipants } from "@/hooks/use-translationRooms";
import { getLanguageName } from "@/lib/languages";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";


const getShortLang = (val: string) => {
  if (!val) return "";
  const code = val.toLowerCase();
  if (code.includes('vi')) return 'VN';
  if (code.includes('en')) return 'EN';
  if (code.includes('ja')) return 'JP';
  if (code.includes('ko')) return 'KR';
  if (code.includes('zh')) return 'CN';
  if (code.includes('de')) return 'DE';
  if (code.includes('fr')) return 'FR';
  if (code.includes('es')) return 'ES';
  return val.split('-')[0].toUpperCase();
};
import type { TranslationRoomDto, TranslationRoomStatus } from "@/types/translationRoom";

const statusLabels: Record<TranslationRoomStatus, string> = {
  scheduled: "Scheduled",
  waiting: "Waiting",
  in_progress: "In Progress",
  paused: "Paused",
  ended: "Ended",
  cancelled: "Cancelled",
  expired: "Expired",
  failed: "Failed",
};

export default function RoomInformationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = params.id;
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "transcript">("overview");

  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const liveRoomState = useTranslationRoomStore((state) => state.translationRoomState);
  const user = useAuthStore((state) => state.user);

  const room = roomQuery.data;
  const apiParticipants = participantsQuery.data ?? [];
  const activeApiParticipants = apiParticipants.filter((participant) =>
    ["joined", "connected"].includes(participant.status.toLowerCase())
  );
  const activeLiveParticipants = liveParticipants.filter((participant) =>
    ["joined", "connected"].includes(participant.status?.toLowerCase() ?? "")
  );
  const liveStateMatchesRoom = !liveRoomState || liveRoomState.translationRoomId === roomId;
  const activeParticipantCount =
    liveStateMatchesRoom && activeLiveParticipants.length > 0
      ? activeLiveParticipants.length
      : activeApiParticipants.length > 0
        ? activeApiParticipants.length
        : room?.status === "in_progress"
          ? room.participantCount ?? 0
          : 0;

  if (!room) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-muted-foreground">Room information is unavailable.</p>
      </div>
    );
  }

  const languageNames = [room.sourceLanguage, ...room.targetLanguages]
    .filter((language): language is string => Boolean(language))
    .map(getLanguageName);

  const isEnded = room.status === "ended";
  const isLive = room.status === "in_progress";

  return (
    <div className="flex flex-col h-full  overflow-hidden">
      
      {/* Scrollable Container (holds both content and right sidebar) */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex w-full min-h-full">
          
          {/* Main content area */}
          <div className="flex-1 min-w-0 px-10 py-10 flex flex-col">
            {/* Title section */}
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-[24px] font-semibold text-foreground tracking-tight leading-snug">{room.title}</h1>
                {room.description && (
                  <p className="mt-1 text-[14px] text-muted-foreground">{room.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-[6px] border border-border bg-surface-2 text-[12px] font-medium text-muted-foreground">
                <StatusDot status={room.status} />
                {statusLabels[room.status]}
              </div>
            </div>

            {/* Teams-like metadata rows */}
            <div className="flex flex-col mb-8 text-[13px] text-foreground border-y border-border/50 divide-y divide-border/50">
              
              {/* Participants Row */}
              <div className="flex items-center min-h-[44px] py-2 group">
                <div className="w-10 flex justify-center shrink-0 text-muted-foreground">
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex-1 pr-4 truncate">
                  {apiParticipants.length > 0 ? apiParticipants.map(p => p.displayName).join("; ") : "No participants added"}
                </div>
                <div className="shrink-0 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button className="flex items-center gap-1.5 text-foreground font-medium hover:bg-surface-2 px-2 py-1.5 rounded-[6px] transition-colors">
                     <Users className="w-3.5 h-3.5" />
                     Tracking
                   </button>
                </div>
              </div>

              {/* Time Row */}
              <div className="flex items-center min-h-[44px] py-2 group">
                <div className="w-10 flex justify-center shrink-0 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex-1 pr-4 flex items-center gap-2">
                  <span>{formatDateTime(room.scheduledAt ?? room.createdAt)}</span>
                  {room.endedAt && (
                    <>
                      <span className="text-muted-foreground">-</span>
                      <span>{formatDateTime(room.endedAt)}</span>
                    </>
                  )}
                </div>
                <div className="shrink-0 pr-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                   <button className="flex items-center gap-1.5 text-foreground font-medium hover:bg-surface-2 px-2 py-1.5 rounded-[6px] transition-colors">
                     <Calendar className="w-3.5 h-3.5" />
                     Scheduling Assistant
                   </button>
                </div>
              </div>

              {/* Location Row */}
              <div className="flex items-center min-h-[44px] py-2">
                <div className="w-10 flex justify-center shrink-0 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 pr-4 text-muted-foreground">
                  Virtual Audio Bridge
                </div>
              </div>

              {/* Toggle Row */}
              <div className="flex items-center min-h-[44px] py-2">
                <div className="w-10 flex justify-center shrink-0 text-muted-foreground">
                  <Video className="w-4 h-4" />
                </div>
                <div className="flex-1 pr-4 flex items-center gap-3 text-muted-foreground">
                  <div className="w-8 h-4 bg-primary rounded-full relative">
                    <div className="w-3 h-3 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm" />
                  </div>
                  <span>WarpTalk Meeting</span>
                </div>
              </div>
            </div>

            {/* Tabs (no full-width border) */}
            <div className="flex items-center gap-6 mt-8 mb-6 border-b border-border/50">
              <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</TabButton>
              <TabButton active={activeTab === "activity"} onClick={() => setActiveTab("activity")}>Activity</TabButton>
              <TabButton active={activeTab === "transcript"} onClick={() => setActiveTab("transcript")}>Transcript</TabButton>
            </div>

            <div className="flex-1 min-h-0">
              {activeTab === "overview" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Meeting Link Block */}
                  <div className="border border-border rounded-xl bg-surface-1 overflow-hidden shadow-sm p-5 space-y-5">
                    <div>
                      <h2 className="text-[13px] font-medium text-ink-subtle uppercase tracking-wider">Meeting Access</h2>
                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2 border border-border text-ink">
                            <Video className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold text-ink">WarpTalk Session</p>
                            <p className="text-[13px] text-ink-subtle mt-0.5">
                              ID: <span className="font-mono bg-surface-2 border border-border px-1.5 py-0.5 rounded text-ink ml-1">{room.translationRoomCode}</span>
                            </p>
                          </div>
                        </div>
                        <Link 
                          href={`/rooms/${roomId}/setup`}
                          className="flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white text-[13px] font-semibold rounded-lg hover:bg-primary-hover transition-colors shadow-sm focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                          Join Meeting
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-border">
                      <textarea 
                        placeholder="Add meeting agenda or notes..." 
                        className="w-full bg-canvas border border-border rounded-lg px-3 py-2.5 text-[13px] text-ink outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-ink-muted resize-none min-h-[80px] shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === "activity" && (
                <div className="space-y-6">
                  <div className="relative pl-4 border-l border-border space-y-8">
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-foreground" />
                      <div className="text-[13px]">
                        <span className="font-medium text-foreground">Meeting scheduled</span>
                        <span className="text-muted-foreground ml-2">{formatDateTime(room.createdAt)}</span>
                      </div>
                      <div className="text-[13px] text-muted-foreground mt-1">Host set the languages to {languageNames.join(", ")}.</div>
                    </div>
                    {room.startedAt && (
                      <div className="relative">
                        <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-border " />
                        <div className="text-[13px]">
                          <span className="font-medium text-foreground">Meeting started</span>
                          <span className="text-muted-foreground ml-2">{formatDateTime(room.startedAt)}</span>
                        </div>
                      </div>
                    )}
                    {isEnded && room.endedAt && (
                      <div className="relative">
                        <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-border " />
                        <div className="text-[13px]">
                          <span className="font-medium text-foreground">Meeting ended</span>
                          <span className="text-muted-foreground ml-2">{formatDateTime(room.endedAt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "transcript" && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[14px] font-medium text-foreground">Live Transcript</h3>
                    <button className="text-[13px] text-muted-foreground hover:text-foreground">Download</button>
                  </div>
                  
                  {isLive ? (
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-medium text-muted-foreground">H</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[13px] font-medium text-foreground">Host</span>
                            <span className="text-[11px] text-muted-foreground">Just now</span>
                          </div>
                          <p className="text-[13px] text-muted-foreground">
                            Welcome everyone to the meeting. We will be translating from {getLanguageName(room.sourceLanguage ?? "")} today.
                          </p>
                        </div>
                      </div>
                      <div className="animate-pulse flex gap-4 opacity-50">
                         <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"></div>
                         <div className="flex-1 space-y-2 py-1">
                           <div className="h-3 bg-muted rounded w-1/4"></div>
                           <div className="h-3 bg-muted rounded w-3/4"></div>
                         </div>
                      </div>
                    </div>
                  ) : isEnded ? (
                    <div className="space-y-6">
                      <p className="text-[13px] text-muted-foreground text-center py-10 italic">
                        Transcript recording ended.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-[13px] text-muted-foreground">
                        The meeting hasn&apos;t started yet. Transcript will appear here.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar — Linear Properties panels */}
          <div className="w-[280px] shrink-0 py-10 pr-2 flex flex-col gap-2">
            

            {/* Properties Card */}
            <div className="rounded-[10px] border border-border bg-surface-1 shadow-[0px_3px_6px_-2px_rgba(0,0,0,0.02),0px_1px_1px_rgba(0,0,0,0.04)] overflow-visible">
              <div className="px-2.5 pt-3 pb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted-foreground flex items-center gap-1 px-1.5">
                  Properties
                  <ChevronDown size={12} strokeWidth={2} className="ml-0.5" />
                </span>
              </div>
              
              <div className="px-1.5 pb-3 flex flex-col">
                <SidebarProperty label="Status" icon={<Info className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />}>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={room.status} />
                    <span>{statusLabels[room.status]}</span>
                  </div>
                </SidebarProperty>

                <SidebarProperty label="Languages" icon={<Globe2 className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />}>
                  <div className="flex items-center gap-1.5 overflow-hidden text-foreground">
                    <span className="shrink-0">{getShortLang(room.sourceLanguage ?? "")}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{room.targetLanguages.map(getShortLang).join(", ")}</span>
                  </div>
                </SidebarProperty>

                <SidebarProperty label="Created" icon={<Calendar className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />}>
                  <span>{formatDateTime(room.createdAt)}</span>
                </SidebarProperty>
              </div>
            </div>

            {/* Tracking Card */}
            <div className="rounded-[10px] border border-border bg-surface-1 shadow-[0px_3px_6px_-2px_rgba(0,0,0,0.02),0px_1px_1px_rgba(0,0,0,0.04)] overflow-visible mt-2">
              <div className="px-2.5 pt-3 pb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted-foreground flex items-center gap-1 px-1.5">
                  Tracking
                  <ChevronDown size={12} strokeWidth={2} className="ml-0.5" />
                </span>
              </div>
              
              <div className="px-3 pb-3 flex flex-col gap-4">
                {/* Organizer */}
                <div>
                  <h4 className="text-[12px] font-medium text-muted-foreground mb-2">Organizer</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 uppercase">
                      {room.hostId === user?.id ? user?.fullName?.charAt(0) : (apiParticipants.find(p => p.userId === room.hostId)?.displayName?.charAt(0) || room.hostId.charAt(0))}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] text-foreground font-medium truncate">
                        {room.hostId === user?.id ? user?.fullName : (apiParticipants.find(p => p.userId === room.hostId)?.displayName || room.hostId)}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">Organizer</span>
                    </div>
                  </div>
                </div>

                {/* Attendees */}
                <div>
                  <h4 className="text-[12px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <ChevronDown size={12} strokeWidth={2} />
                    Attendees: {activeParticipantCount}
                  </h4>
                  {activeParticipantCount > 0 ? (
                    <div className="space-y-2 mt-2">
                      {Array.from({ length: Math.min(activeParticipantCount, 5) }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-2 text-muted-foreground flex items-center justify-center text-[10px] font-medium shrink-0">
                            P{i+1}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] text-foreground truncate">Participant {i+1}</span>
                            <span className="text-[11px] text-muted-foreground truncate">In meeting</span>
                          </div>
                        </div>
                      ))}
                      {activeParticipantCount > 5 && (
                        <div className="text-[11px] text-muted-foreground mt-2 pl-8">
                          + {activeParticipantCount - 5} others
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[12px] text-muted-foreground">No attendees yet.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Card */}
            <div className="rounded-[10px] border border-border bg-surface-1 shadow-[0px_3px_6px_-2px_rgba(0,0,0,0.02),0px_1px_1px_rgba(0,0,0,0.04)] overflow-visible mt-2">
              <div className="px-2.5 pt-3 pb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted-foreground flex items-center gap-1 px-1.5">
                  Actions
                  <ChevronDown size={12} strokeWidth={2} className="ml-0.5" />
                </span>
              </div>
              <div className="px-1.5 pb-3 flex flex-col">
                <button className="flex items-center gap-2 w-full min-h-[28px] px-1.5 rounded-[6px] text-[13px] text-muted-foreground hover:bg-surface-2 transition-colors">
                  <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="text-foreground">Copy room code</span>
                </button>
                <button className="flex items-center gap-2 w-full min-h-[28px] px-1.5 rounded-[6px] text-[13px] text-muted-foreground hover:bg-surface-2 transition-colors">
                  <LinkIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="text-foreground">Copy invite link</span>
                </button>
                <button className="flex items-center gap-2 w-full min-h-[28px] px-1.5 rounded-[6px] text-[13px] text-muted-foreground hover:bg-surface-2 transition-colors">
                  <Star className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="text-foreground">Add to favorites</span>
                </button>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-[32px] flex items-center text-[13px] font-medium transition-colors border-b-2 ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const isLive = status === "in_progress";
  return (
    <div className={`w-2 h-2 rounded-full shrink-0 ${isLive ? "bg-blue-500" : "bg-muted-foreground/50"}`} />
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function SidebarProperty({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center text-[13px] min-h-[28px] px-1.5 rounded-[6px] hover:bg-surface-2 transition-colors cursor-default">
      <span className="text-muted-foreground w-[110px] shrink-0 flex items-center gap-2">
        {icon}
        {label}
      </span>
      <div className="text-foreground flex-1 flex items-center truncate">{children}</div>
    </div>
  );
}

/* ── Utilities ── */


function formatDateTime(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTimeAgo(value?: string) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(room: TranslationRoomDto) {
  const seconds =
    room.durationSeconds ??
    (room.startedAt && room.endedAt
      ? Math.max(0, Math.round((new Date(room.endedAt).getTime() - new Date(room.startedAt).getTime()) / 1000))
      : 0);
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m`;
}
