"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Globe2, Calendar, ArrowRight, Clock, MapPin, Video, Users, ChevronDown, Copy, Link as LinkIcon, Star, ArrowLeft, Info, FileText, StopCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { useTranslationRoom, useTranslationRoomParticipants, useTranslationRoomInvitations, useEndTranslationRoom } from "@/hooks/use-translationRooms";
import { getLanguageName } from "@/lib/languages";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { Button } from "@/components/ui/button";
import { useTranscriptByRoom, useTranscriptSegments } from "@/hooks/use-transcripts";
import { MeetingPropertiesPills } from "./MeetingPropertiesPills";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";

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

export default function RoomInformationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = params.id;
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "transcript">("overview");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText("Copied");
    setTimeout(() => setCopiedText(null), 2000);
  };

  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const invitationsQuery = useTranslationRoomInvitations(roomId);
  const endRoomMutation = useEndTranslationRoom();
  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const liveRoomState = useTranslationRoomStore((state) => state.translationRoomState);
  const user = useAuthStore((state) => state.user);
  const role = useWorkspaceRole();

  const transcriptQuery = useTranscriptByRoom(roomId);
  const segmentsQuery = useTranscriptSegments(transcriptQuery.data?.id);
  const transcriptSegments = segmentsQuery.data?.items || [];

  const room = roomQuery.data;
  const apiParticipants = participantsQuery.data ?? [];
  const apiInvitations = invitationsQuery.data ?? [];
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
  const isHost = room.hostId === user?.id || role === "admin" || role === "owner";

  return (
    <div className="flex flex-col h-full  overflow-hidden">
      {copiedText && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[13px] font-medium px-4 py-2 rounded-md shadow-lg z-[100] animate-in fade-in slide-in-from-top-4 duration-200">
          {copiedText}
        </div>
      )}
      
      {/* Scrollable Container (holds both content and right sidebar) */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex w-full min-h-full">
          
          {/* Main content area */}
          <div className="flex-1 min-w-0 px-10 py-10 flex flex-col">
            {/* Title section */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h1 className="text-[24px] font-semibold text-foreground tracking-tight leading-snug">{room.title}</h1>
                {room.description && (
                  <p className="mt-1 text-[14px] text-muted-foreground">{room.description}</p>
                )}
                <MeetingPropertiesPills 
                  room={room} 
                  apiParticipants={apiParticipants} 
                  activeParticipantCount={activeParticipantCount} 
                  user={user} 
                />
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-2 px-3 py-1 rounded-[6px] border border-border bg-surface-2 text-[12px] font-medium text-muted-foreground">
                  <StatusDot status={room.status} />
                  {statusLabels[room.status]}
                </div>
                {room.hostId === user?.id && (room.status === "scheduled" || room.status === "waiting") && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[12px] w-full"
                    onClick={() => {
                      useUIStore.getState().setEditRoomId(room.id);
                      useUIStore.getState().setCreateRoomModalOpen(true);
                    }}
                  >
                    Edit Room
                  </Button>
                )}
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
                  <Popover>
                    <PopoverTrigger className="flex items-center gap-1.5 text-foreground font-medium hover:bg-surface-2 px-2 py-1.5 rounded-[6px] transition-colors cursor-pointer">
                      <Users className="w-3.5 h-3.5" />
                      Tracking
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[300px] p-3 rounded-xl bg-white shadow-xl border-border/20 z-[100]">
                      <h4 className="text-[13px] font-medium text-ink mb-3">Participants</h4>
                      {isHost && (
                        <div className="mb-4">
                          <label className="text-[11px] font-medium text-ink-muted px-1 mb-1.5 block">Invite by Email</label>
                          <div className="relative">
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted/70 h-4 w-4 pointer-events-none" />
                            <input 
                              type="email" 
                              placeholder="name@company.com..." 
                              className="w-full h-9 pl-9 pr-9 text-[13px] bg-surface-1 border border-border/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-border/50 text-ink placeholder:text-ink-muted/50 transition-all" 
                            />
                            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors">
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        <div className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">Current ({apiParticipants.length})</div>
                        {apiParticipants.length > 0 ? apiParticipants.map((p, i) => (
<<<<<<< HEAD:src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx
                          <div key={i} className="flex items-center gap-2.5 text-[13px] text-ink p-1.5 hover:bg-surface-1 rounded-md transition-colors">
                            <div className="h-7 w-7 rounded-full bg-surface-2 border border-border/40 flex items-center justify-center shrink-0">
                              <span className="text-[11px] font-medium text-ink-muted">{p.displayName?.charAt(0).toUpperCase() || '?'}</span>
                            </div>
                            <div className="flex-1 truncate leading-tight">
                              <div className="font-medium text-ink">{p.displayName}</div>
                              {(p as any).email && <div className="text-[11px] text-ink-muted truncate">{(p as any).email}</div>}
=======
                          <div key={`p-${i}`} className="flex items-center justify-between gap-2.5 text-[13px] text-ink p-1.5 hover:bg-surface-1 rounded-md transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-7 w-7 rounded-full bg-surface-2 border border-border/40 flex items-center justify-center shrink-0">
                                <span className="text-[11px] font-medium text-ink-muted">{p.displayName?.charAt(0).toUpperCase() || '?'}</span>
                              </div>
                              <div className="flex-1 truncate leading-tight">
                                <div className="font-medium text-ink truncate">{p.displayName}</div>
                              </div>
>>>>>>> origin/development:src/app/(app)/rooms/[id]/page.tsx
                            </div>
                            <span className="text-[10px] font-medium text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-sm shrink-0">
                              Joined
                            </span>
                          </div>
                        )) : null}

                        {apiInvitations.length > 0 && (
                          <div className="mt-3">
                            <div className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">Invited ({apiInvitations.length})</div>
                            {apiInvitations.map((inv, i) => {
                              const isAccepted = inv.status === 'ACCEPTED';
                              const isDeclined = inv.status === 'DECLINED';
                              return (
                                <div key={`inv-${i}`} className="flex items-center justify-between gap-2.5 text-[13px] text-ink p-1.5 hover:bg-surface-1 rounded-md transition-colors">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="h-7 w-7 rounded-full bg-surface-2 border border-border/40 flex items-center justify-center shrink-0">
                                      <span className="text-[11px] font-medium text-ink-muted">{inv.email.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div className="flex-1 truncate leading-tight">
                                      <div className="font-medium text-ink truncate">{inv.email}</div>
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm shrink-0 ${
                                    isAccepted ? "text-green-500 bg-green-500/10" : 
                                    isDeclined ? "text-red-500 bg-red-500/10" : 
                                    "text-orange-500 bg-orange-500/10"
                                  }`}>
                                    {inv.status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {apiParticipants.length === 0 && apiInvitations.length === 0 && (
                          <div className="text-[13px] text-ink-muted text-center py-4">No participants or invitations</div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
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
                   {isHost && (
                     <button className="flex items-center gap-1.5 text-foreground font-medium hover:bg-surface-2 px-2 py-1.5 rounded-[6px] transition-colors">
                       <Calendar className="w-3.5 h-3.5" />
                       Scheduling Assistant
                     </button>
                   )}
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
                        <button 
                          type="button"
                          onClick={() => {
                            useUIStore.getState().setSetupRoomId(roomId as string);
                            useUIStore.getState().setSetupRoomModalOpen(true);
                          }}
                          className="flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white text-[13px] font-semibold rounded-lg hover:bg-primary-hover transition-colors shadow-sm focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                          Join Meeting
                          <ArrowRight className="w-4 h-4" />
                        </button>
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
                    <h3 className="text-[14px] font-medium text-foreground">Transcript</h3>
                    <button className="text-[13px] text-muted-foreground hover:text-foreground">Download</button>
                  </div>
                  
                  {isLive || isEnded ? (
                    <div className="flex-1 overflow-y-auto space-y-6">
                      {isLive && transcriptSegments.length === 0 ? (
                        <div className="space-y-4">
                          <div className="animate-pulse flex gap-4 opacity-50">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"></div>
                            <div className="flex-1 space-y-2 py-1">
                              <div className="h-3 bg-muted rounded w-1/4"></div>
                              <div className="h-3 bg-muted rounded w-3/4"></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {transcriptSegments.map((segment) => {
                            const date = new Date(transcriptQuery.data?.createdAt || Date.now());
                            date.setMilliseconds(date.getMilliseconds() + segment.startTimeMs);
                            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            
                            return (
                              <div key={segment.id} className="flex gap-4 group">
                                <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                                  <span className="text-[11px] font-medium text-ink-muted">{segment.speakerName?.charAt(0).toUpperCase() || '?'}</span>
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-baseline gap-2 mb-1">
                                    <span className="text-[13px] font-medium text-ink">{segment.speakerName || 'Unknown Speaker'}</span>
                                    <span className="text-[11px] text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity">{timeString}</span>
                                  </div>
                                  <p className="text-[13px] text-ink-subtle leading-relaxed">
                                    {segment.originalText}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          
                          {isEnded && (
                            <p className="text-[13px] text-muted-foreground text-center py-6 italic border-t border-border/50 mt-6">
                              Transcript recording ended.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-xl">
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
                    Attendees: {(apiParticipants.filter(p => p.userId !== room.hostId).length + (invitationsQuery.data || []).filter(i => i.status !== "ACCEPTED").length)}
                  </h4>
                  {((apiParticipants.filter(p => p.userId !== room.hostId).length + (invitationsQuery.data || []).filter(i => i.status !== "ACCEPTED").length) > 0) ? (
                    <div className="space-y-2 mt-2">
                      {apiParticipants.filter(p => p.userId !== room.hostId).map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-2 text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0 uppercase">
                            {p.displayName?.charAt(0) || "U"}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] text-foreground truncate">{p.displayName || "Unknown User"}</span>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {p.status === "joined" ? "In meeting" : p.status}
                            </span>
                          </div>
                        </div>
                      ))}
                      {(invitationsQuery.data || []).filter(i => i.status !== "ACCEPTED").map((inv) => (
                        <div key={inv.id} className="flex items-center gap-2 opacity-60">
                          <div className="w-6 h-6 rounded-full bg-surface-2 text-muted-foreground flex items-center justify-center text-[10px] font-medium shrink-0 uppercase">
                            {inv.email.charAt(0)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] text-foreground truncate">{inv.email}</span>
                            <span className="text-[11px] text-muted-foreground truncate">Invited ({inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1).toLowerCase() : 'Pending'})</span>
                          </div>
                        </div>
                      ))}
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
                <button 
                  onClick={() => handleCopy(room.translationRoomCode, "Room code")}
                  className="flex items-center gap-2 w-full min-h-[28px] px-1.5 rounded-[6px] text-[13px] text-muted-foreground hover:bg-surface-2 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="text-foreground">Copy room code</span>
                </button>
                {isHost && (
                  <button 
                    onClick={() => handleCopy(`${window.location.origin}/join?code=${room.translationRoomCode}`, "Invite link")}
                    className="flex items-center gap-2 w-full min-h-[28px] px-1.5 rounded-[6px] text-[13px] text-muted-foreground hover:bg-surface-2 transition-colors"
                  >
                    <LinkIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span className="text-foreground">Copy invite link</span>
                  </button>
                )}
                <button className="flex items-center gap-2 w-full min-h-[28px] px-1.5 rounded-[6px] text-[13px] text-muted-foreground hover:bg-surface-2 transition-colors">
                  <Star className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="text-foreground">Add to favorites</span>
                </button>
                {isHost && !isEnded && room.status !== "cancelled" && (
                  <button 
                    onClick={async () => {
                      try {
                        await endRoomMutation.mutateAsync(room.id);
                      } catch (e) {
                        // error handled by mutation
                      }
                    }}
                    disabled={endRoomMutation.isPending}
                    className="flex items-center gap-2 w-full min-h-[28px] px-1.5 rounded-[6px] text-[13px] text-red-500 hover:bg-red-500/10 transition-colors mt-2"
                  >
                    <StopCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span className="text-foreground text-red-500">End Meeting</span>
                  </button>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */



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
