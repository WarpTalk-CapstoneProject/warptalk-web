"use client";

import { use, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Captions,
  CircleOff,
  Image as ImageIcon,
  Languages,
  LogOut,
  MessageSquareText,
  Mic,
  MicOff,
  MoreHorizontal,
  Paperclip,
  Play,
  ScreenShare,
  Send,
  Shield,
  Sparkles,
  Square,
  UserRoundX,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import * as signalR from "@microsoft/signalr";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCancelTranslationRoom,
  useEndTranslationRoom,
  useStartTranslationRoom,
  useTranslationRoom,
} from "@/hooks/use-translationRooms";
import { useSpeechCapture } from "@/hooks/use-speech-capture";
import { createHubConnection } from "@/lib/signalr";
import {
  getLanguageName,
  normalizeLanguageCode,
} from "@/lib/languages";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import type { ParticipantInfoDto, TranscriptSegmentDto } from "@/types/realtime";
import type {
  TranslationRoomLifecycleAction,
  TranslationRoomParticipantDto,
  TranslationRoomStatus,
} from "@/types/translationRoom";

type RoomParticipant = ParticipantInfoDto &
  Pick<
    Partial<TranslationRoomParticipantDto>,
    "id" | "translationRoomId" | "role" | "status" | "avatarUrl" | "isUsingVoiceClone"
  > & {
    source: "auth" | "api" | "realtime" | "mock";
  };

type JoinSessionPreferences = {
  displayName?: string;
  speakLanguage?: string;
  listenLanguage?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  translationMode?: "single" | "multi";
};

type MeetingEdgePanel = "live" | "participants" | "devices" | "translation" | "settings";

const MOCK_CONTRACT_PARTICIPANTS: RoomParticipant[] = [
  {
    userId: "mock-host-william",
    displayName: "William Carter",
    role: "host",
    status: "joined",
    speakLanguage: "English",
    listenLanguage: "Spanish",
    isMuted: false,
    isUsingVoiceClone: true,
    joinedAt: "2026-05-16T12:03:00.000Z",
    source: "mock",
  },
  {
    userId: "mock-participant-sofia",
    displayName: "Sofia Alvarez",
    role: "participant",
    status: "joined",
    speakLanguage: "Spanish",
    listenLanguage: "English",
    isMuted: false,
    isUsingVoiceClone: true,
    joinedAt: "2026-05-16T12:05:00.000Z",
    source: "mock",
  },
  {
    userId: "mock-participant-raj",
    displayName: "Raj Mehta",
    role: "interpreter",
    status: "joined",
    speakLanguage: "English",
    listenLanguage: "Hindi",
    isMuted: true,
    isUsingVoiceClone: false,
    joinedAt: "2026-05-16T12:08:00.000Z",
    source: "mock",
  },
];

const MOCK_SEGMENTS: TranscriptSegmentDto[] = [
  {
    segmentId: "mock-segment-1",
    speakerId: "mock-host-william",
    speakerName: "William",
    originalText: "We're building the future of communication, connecting teams everywhere.",
    originalLanguage: "English",
    translatedText:
      "Estamos construyendo el futuro de la comunicacion, conectando equipos en todas partes.",
    targetLanguage: "Spanish",
    confidence: 0.96,
    startTimeMs: 1450000,
    endTimeMs: 1458000,
  },
  {
    segmentId: "mock-segment-2",
    speakerId: "mock-participant-sofia",
    speakerName: "Sofia",
    originalText: "Nuestro objetivo es empoderar a cada equipo para que se comunique mejor.",
    originalLanguage: "Spanish",
    translatedText: "Our goal is to empower every team to communicate better.",
    targetLanguage: "English",
    confidence: 0.94,
    startTimeMs: 1462000,
    endTimeMs: 1469000,
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatLanguagePair(participant: Pick<ParticipantInfoDto, "speakLanguage" | "listenLanguage">) {
  return `${getLanguageName(participant.speakLanguage) || "Auto"} -> ${getLanguageName(participant.listenLanguage) || "Auto"}`;
}

function normalizeRealtimeParticipant(participant: ParticipantInfoDto): RoomParticipant {
  return {
    role: "participant",
    status: "joined",
    source: "realtime",
    ...participant,
  };
}

function mergeParticipants(participants: RoomParticipant[]) {
  const byUser = new Map<string, RoomParticipant>();
  for (const participant of participants) {
    byUser.set(participant.userId, { ...byUser.get(participant.userId), ...participant });
  }
  return Array.from(byUser.values()).sort((a, b) => {
    const roleWeight = (role?: string) => (role === "host" ? 0 : role === "interpreter" ? 1 : 2);
    return roleWeight(a.role) - roleWeight(b.role) || a.displayName.localeCompare(b.displayName);
  });
}

const roomStatusCopy: Record<TranslationRoomStatus, { label: string; detail: string; badge: string }> = {
  scheduled: {
    label: "Scheduled",
    detail: "Room is planned and can be started or cancelled by the host.",
    badge: "border-[#e4eef9] bg-[#fdfcf6] text-[#003476]",
  },
  waiting: {
    label: "Waiting",
    detail: "Room is open for setup and waiting for the host to start.",
    badge: "border-[#e4eef9] bg-[#e4eef9] text-[#003476]",
  },
  in_progress: {
    label: "Live",
    detail: "Room is active. Host can end the room for everyone.",
    badge: "border-[#003476] bg-[#003476] text-white",
  },
  ended: {
    label: "Ended",
    detail: "Room has ended and lifecycle controls are locked.",
    badge: "border-[#e4eef9] bg-white text-black/70",
  },
  archived: {
    label: "Archived",
    detail: "Room is archived and cannot be changed here.",
    badge: "border-[#e4eef9] bg-[#e4eef9] text-black/65",
  },
  cancelled: {
    label: "Cancelled",
    detail: "Room was cancelled before it went live.",
    badge: "border-black/10 bg-black text-white",
  },
};

const lifecycleActionCopy: Record<
  TranslationRoomLifecycleAction,
  { title: string; body: string; confirm: string; success: string; icon: LucideIcon }
> = {
  start: {
    title: "Start this room?",
    body: "Participants will move into the live translation session.",
    confirm: "Start room",
    success: "Room started.",
    icon: Play,
  },
  end: {
    title: "End this room?",
    body: "This ends the live session for everyone. Participants will no longer be able to continue translating in this room.",
    confirm: "End room",
    success: "Room ended.",
    icon: Square,
  },
  cancel: {
    title: "Cancel this room?",
    body: "This cancels the scheduled or waiting room. Participants should treat the session as no longer available.",
    confirm: "Cancel room",
    success: "Room cancelled.",
    icon: CircleOff,
  },
};

function normalizeRoomStatus(status?: string): TranslationRoomStatus {
  if (status === "active" || status === "live") return "in_progress";
  if (status === "completed") return "ended";
  if (
    status === "scheduled" ||
    status === "waiting" ||
    status === "in_progress" ||
    status === "ended" ||
    status === "archived" ||
    status === "cancelled"
  ) {
    return status;
  }

  return "scheduled";
}

function getAllowedLifecycleActions(status: TranslationRoomStatus, canManage: boolean) {
  if (!canManage) return [];
  if (status === "scheduled" || status === "waiting") return ["start", "cancel"] as TranslationRoomLifecycleAction[];
  if (status === "in_progress") return ["end"] as TranslationRoomLifecycleAction[];
  return [];
}

function LifecycleControls({
  status,
  canManage,
  pending,
  onAction,
}: {
  status: TranslationRoomStatus;
  canManage: boolean;
  pending?: TranslationRoomLifecycleAction;
  onAction: (action: TranslationRoomLifecycleAction) => void;
}) {
  const actions = getAllowedLifecycleActions(status, canManage);

  if (!canManage) {
    return null;
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2">
      {actions.map((action) => {
        const copy = lifecycleActionCopy[action];
        const Icon = copy.icon;
        const destructive = action === "end" || action === "cancel";

        return (
          <Button
            key={action}
            variant={destructive ? "destructive" : "default"}
            size="sm"
            className={
              action === "start"
                ? "bg-[#003476] text-white hover:bg-[#003476]/90"
                : action === "cancel"
                  ? "border-black/10 bg-white text-black hover:bg-[#fdfcf6]"
                  : "bg-black text-white hover:bg-black/85"
            }
            disabled={Boolean(pending)}
            onClick={() => onAction(action)}
          >
            <Icon />
            {pending === action ? "Working..." : copy.confirm}
          </Button>
        );
      })}
    </div>
  );
}

function ParticipantRow({
  participant,
  canManage,
  isCurrentUser,
  onToggleMute,
  onViewDetails,
}: {
  participant: RoomParticipant;
  canManage: boolean;
  isCurrentUser: boolean;
  onToggleMute: (participant: RoomParticipant) => void;
  onViewDetails: (participant: RoomParticipant) => void;
}) {
  const isAway = participant.status === "left" || participant.status === "removed";

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="size-10">
            <AvatarImage src={participant.avatarUrl} alt={participant.displayName} />
            <AvatarFallback>{initials(participant.displayName) || "U"}</AvatarFallback>
          </Avatar>
          <span
            className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background ${
              isAway ? "bg-[#e4eef9]" : participant.isMuted ? "bg-black" : "bg-[#003476]"
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-semibold">{participant.displayName}</p>
                {isCurrentUser && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    You
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                  {participant.role ?? "participant"}
                </Badge>
                <Badge variant={isAway ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px] capitalize">
                  {participant.status ?? "joined"}
                </Badge>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                <MoreHorizontal />
                <span className="sr-only">Participant actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Participant</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onViewDetails(participant)}>
                  <BadgeCheck />
                  View details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canManage}
                  onClick={() => onToggleMute(participant)}
                >
                  {participant.isMuted ? <Volume2 /> : <VolumeX />}
                  {participant.isMuted ? "Unmute" : "Mute"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canManage} variant="destructive">
                  <UserRoundX />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Languages className="size-3.5" />
              <span className="truncate">{formatLanguagePair(participant)}</span>
            </div>
            <div className="flex items-center gap-2">
              {participant.isMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
              <span>{participant.isMuted ? "Muted" : "Mic open"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5" />
              <span>{participant.isUsingVoiceClone ? "Voice clone ready" : "Standard voice"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParticipantsPanel({
  participants,
  canManage,
  currentUserId,
  contractPreview,
  onToggleMute,
  onViewDetails,
}: {
  participants: RoomParticipant[];
  canManage: boolean;
  currentUserId?: string;
  contractPreview: boolean;
  onToggleMute: (participant: RoomParticipant) => void;
  onViewDetails: (participant: RoomParticipant) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Participants</h2>
            <p className="text-xs text-muted-foreground">
              {participants.length} in room
              {contractPreview ? " - mock contract preview" : ""}
            </p>
          </div>
          {canManage && (
            <Badge variant="outline" className="gap-1 text-[11px]">
              <Shield className="size-3" />
              Host
            </Badge>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.userId}
            participant={participant}
            canManage={canManage}
            isCurrentUser={participant.userId === currentUserId}
            onToggleMute={onToggleMute}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>
    </aside>
  );
}

function MeetingBottomBar({
  title,
  roomCode,
  isRoomLive,
  roomStatus,
  activeParticipantCount,
  isMuted,
  isRecording,
  isConnected,
  canUsePreview,
  currentParticipant,
  onOpenPanel,
  onLeave,
  onToggleMute,
}: {
  title: string;
  roomCode: string;
  isRoomLive: boolean;
  roomStatus: TranslationRoomStatus;
  activeParticipantCount: number;
  isMuted: boolean;
  isRecording: boolean;
  isConnected: boolean;
  canUsePreview: boolean;
  currentParticipant: RoomParticipant;
  onOpenPanel: (panel: MeetingEdgePanel) => void;
  onLeave: () => void;
  onToggleMute: (participant: RoomParticipant) => void;
}) {
  const bottomItems: Array<{
    panel: MeetingEdgePanel;
    label: string;
    detail: string;
    icon: LucideIcon;
  }> = [
    {
      panel: "live",
      label: isRoomLive ? "Live room" : "Room state",
      detail: roomStatusCopy[roomStatus].label,
      icon: isRoomLive ? Play : Square,
    },
    {
      panel: "participants",
      label: "Participants",
      detail: `${activeParticipantCount} in room`,
      icon: Users,
    },
    {
      panel: "devices",
      label: "Audio & camera",
      detail: "Mic, camera, speaker",
      icon: Video,
    },
    {
      panel: "translation",
      label: "Translation",
      detail: "Languages and captions",
      icon: Captions,
    },
    {
      panel: "settings",
      label: "More settings",
      detail: "Room options",
      icon: MoreHorizontal,
    },
  ];

  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-20 border-t border-[#e4eef9] bg-white/95 px-4 backdrop-blur">
      <div className="relative mx-auto flex h-full max-w-[1600px] items-center justify-between">
        <button
          type="button"
          className="pointer-events-auto flex min-w-0 items-center gap-3 rounded-full px-1 py-1 text-left transition hover:bg-[#fdfcf6]"
          onClick={() => onOpenPanel("settings")}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#003476] text-base font-bold text-white">
            W
          </span>
          <div className="hidden min-w-0 sm:block">
            <p className="max-w-44 truncate text-sm font-bold text-black">{title}</p>
            <p className="text-[11px] leading-none text-black/50">{roomCode}</p>
          </div>
        </button>

        <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-3">
          <Button
            variant="outline"
            size="icon-lg"
            className="size-11 rounded-full border-[#e4eef9] bg-white text-[#003476] shadow-sm hover:bg-[#fdfcf6]"
            onClick={() => onToggleMute(currentParticipant)}
            disabled={!isConnected && !canUsePreview}
            title="Mic"
          >
            {isMuted ? <MicOff /> : <Mic />}
            <span className="sr-only">Mic</span>
          </Button>

          {bottomItems.map((item) => {
            const Icon = item.icon;
            const ItemIcon = item.panel === "settings" && isRecording ? VolumeX : Icon;
            const isLiveItem = item.panel === "live";
            const isTranslation = item.panel === "translation";

            return (
              <button
                key={item.panel}
                type="button"
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border shadow-sm transition ${
                  isLiveItem && isRoomLive
                    ? "border-[#003476] bg-[#003476] text-white hover:bg-[#003476]/90"
                    : isTranslation
                      ? "border-[#003476] bg-[#fdfcf6] text-[#003476] hover:bg-[#e4eef9]"
                      : "border-[#e4eef9] bg-white text-[#003476] hover:bg-[#fdfcf6]"
                }`}
                onClick={() => onOpenPanel(item.panel)}
                title={`${item.label}: ${item.detail}`}
              >
                <ItemIcon className="size-4" />
                <span className="sr-only">{item.label}</span>
              </button>
            );
          })}

          <Button
            variant="outline"
            size="icon-lg"
            className="size-11 rounded-full border-[#e4eef9] bg-white text-[#003476] shadow-sm hover:bg-[#fdfcf6]"
            onClick={() => onOpenPanel("settings")}
            title="Share"
          >
            <ScreenShare />
            <span className="sr-only">Share</span>
          </Button>

        </div>

        <Button
          variant="outline"
          className="pointer-events-auto h-11 rounded-full border-[#003476] bg-white px-5 font-semibold text-[#003476] shadow-sm hover:bg-[#e4eef9]"
          onClick={onLeave}
        >
          <LogOut />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>
    </footer>
  );
}

function SettingRow({
  icon: Icon,
  title,
  detail,
  active,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#e4eef9] bg-white p-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${active ? "bg-[#003476] text-white" : "bg-[#fdfcf6] text-[#003476]"}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-black">{title}</p>
        <p className="text-xs leading-relaxed text-black/55">{detail}</p>
      </div>
      <span className={`h-6 w-11 rounded-full p-0.5 transition ${active ? "bg-[#003476]" : "bg-[#e4eef9]"}`}>
        <span className={`block size-5 rounded-full bg-white shadow-sm transition ${active ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </div>
  );
}

function MeetingSidePanel({
  activePanel,
  title,
  roomCode,
  isRoomLive,
  roomStatus,
  activeParticipantCount,
  participants,
  canManageParticipants,
  currentUserId,
  contractPreview,
  sourceLanguageName,
  targetLanguageNames,
  isMuted,
  isRecording,
  activeLifecycleMutation,
  onClose,
  onOpenPanel,
  onLeave,
  onLifecycleAction,
  onToggleMute,
  onToggleRecording,
  onViewParticipant,
}: {
  activePanel: MeetingEdgePanel | null;
  title: string;
  roomCode: string;
  isRoomLive: boolean;
  roomStatus: TranslationRoomStatus;
  activeParticipantCount: number;
  participants: RoomParticipant[];
  canManageParticipants: boolean;
  currentUserId?: string;
  contractPreview: boolean;
  sourceLanguageName: string;
  targetLanguageNames: string;
  isMuted: boolean;
  isRecording: boolean;
  activeLifecycleMutation?: TranslationRoomLifecycleAction;
  onClose: () => void;
  onOpenPanel: (panel: MeetingEdgePanel) => void;
  onLeave: () => void;
  onLifecycleAction: (action: TranslationRoomLifecycleAction) => void;
  onToggleMute: (participant: RoomParticipant) => void;
  onToggleRecording: () => void;
  onViewParticipant: (participant: RoomParticipant) => void;
}) {
  if (!activePanel) return null;

  const headingCopy: Record<MeetingEdgePanel, { title: string; detail: string }> = {
    live: {
      title: "Live controls",
      detail: "Host lifecycle and current room state.",
    },
    participants: {
      title: "Participants",
      detail: `${activeParticipantCount} active participants.`,
    },
    devices: {
      title: "Audio & camera",
      detail: "Adjust meeting devices from the right panel.",
    },
    translation: {
      title: "Translation",
      detail: "Room language policy and caption controls.",
    },
    settings: {
      title: "Room settings",
      detail: "Meeting identity, options, and exit controls.",
    },
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-black/10"
        aria-label="Close meeting panel"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(396px,calc(100vw-16px))] flex-col border-l border-[#e4eef9] bg-white shadow-[0_0_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#e4eef9] bg-[#fdfcf6] p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#003476]">WarpTalk</p>
            <h2 className="truncate text-lg font-bold text-black">{headingCopy[activePanel].title}</h2>
            <p className="mt-1 text-sm text-black/60">{headingCopy[activePanel].detail}</p>
          </div>
          <Button variant="ghost" size="icon-sm" className="rounded-full hover:bg-[#e4eef9]" onClick={onClose}>
            <X />
            <span className="sr-only">Close panel</span>
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activePanel === "live" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#e4eef9] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-black">{title}</p>
                    <p className="text-xs text-black/55">{roomCode}</p>
                  </div>
                  <Badge variant="outline" className={`gap-1 ${roomStatusCopy[roomStatus].badge}`}>
                    <span className={`size-2 rounded-full ${isRoomLive ? "bg-[#003476]" : "bg-black"}`} />
                    {roomStatusCopy[roomStatus].label}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-black/65">{roomStatusCopy[roomStatus].detail}</p>
              </div>

              <div className="rounded-2xl border border-[#e4eef9] bg-[#fdfcf6] p-4">
                <p className="mb-3 text-sm font-bold text-black">Host lifecycle</p>
                <LifecycleControls
                  status={roomStatus}
                  canManage={canManageParticipants}
                  pending={activeLifecycleMutation}
                  onAction={onLifecycleAction}
                />
                {!canManageParticipants && (
                  <p className="text-sm text-black/60">Only the host can start, end, or cancel this room.</p>
                )}
                {canManageParticipants && getAllowedLifecycleActions(roomStatus, true).length === 0 && (
                  <p className="text-sm text-black/60">No lifecycle action is available for this state.</p>
                )}
              </div>
            </div>
          )}

          {activePanel === "participants" && (
            <ParticipantsPanel
              participants={participants}
              canManage={canManageParticipants}
              currentUserId={currentUserId}
              contractPreview={contractPreview}
              onToggleMute={onToggleMute}
              onViewDetails={onViewParticipant}
            />
          )}

          {activePanel === "devices" && (
            <div className="space-y-3">
              <SettingRow icon={isMuted ? MicOff : Mic} title="Microphone" detail={isMuted ? "Your mic is muted." : "Your mic is open for this room."} active={!isMuted} />
              <SettingRow icon={Video} title="Camera" detail="Camera preview and device selection will connect to media settings." active />
              <SettingRow icon={Volume2} title="Speaker" detail="Meeting audio output is enabled." active />
              <Button className="mt-2 w-full rounded-2xl bg-[#003476] text-white hover:bg-[#003476]/90" onClick={() => onOpenPanel("translation")}>
                <Captions />
                Open translation settings
              </Button>
            </div>
          )}

          {activePanel === "translation" && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-[#e4eef9] bg-[#fdfcf6] p-4">
                <p className="text-sm font-bold text-black">Language policy</p>
                <p className="mt-2 text-sm text-black/65">
                  Speak {sourceLanguageName} / Listen {targetLanguageNames}
                </p>
              </div>
              <SettingRow icon={Captions} title="Live captions" detail="Translated transcript is visible in the right panel." active />
              <SettingRow icon={Languages} title="Multi-language room" detail={`Targets: ${targetLanguageNames}.`} active />
              <Button variant="outline" className="w-full rounded-2xl border-[#003476] bg-white text-[#003476] hover:bg-[#e4eef9]" onClick={() => onOpenPanel("live")}>
                <Play />
                Review lifecycle state
              </Button>
            </div>
          )}

          {activePanel === "settings" && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-[#e4eef9] bg-[#fdfcf6] p-4">
                <p className="text-sm font-bold text-black">{title}</p>
                <p className="mt-1 text-xs text-black/55">{roomCode}</p>
                <p className="mt-3 text-sm text-black/65">
                  {activeParticipantCount} participants are connected to this meeting surface.
                </p>
              </div>
              <Button variant="outline" className="w-full justify-start rounded-2xl border-[#e4eef9] bg-white text-black hover:bg-[#fdfcf6]" onClick={onToggleRecording} disabled={!isRoomLive}>
                {isRecording ? <VolumeX /> : <Volume2 />}
                {isRecording ? "Stop meeting capture" : "Start meeting capture"}
              </Button>
              <Button variant="outline" className="w-full justify-start rounded-2xl border-[#e4eef9] bg-white text-black hover:bg-[#fdfcf6]" onClick={() => onOpenPanel("participants")}>
                <Users />
                Manage participants
              </Button>
              <Button className="w-full rounded-2xl bg-[#003476] text-white hover:bg-[#003476]/90" onClick={onLeave}>
                <LogOut />
                Leave meeting
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

const mockVideoAssets = ["/image-a.png", "/image-b.png", "/Image%203.png", "/Image%204.png"];

function VideoTile({
  participant,
  index,
}: {
  participant: RoomParticipant;
  index: number;
}) {
  const isHost = participant.role === "host";
  const imageSrc = participant.avatarUrl || mockVideoAssets[index % mockVideoAssets.length];

  return (
    <div className="group relative h-full min-h-0 overflow-hidden rounded-lg border border-[#e4eef9] bg-black shadow-sm">
      <Image
        src={imageSrc}
        alt={participant.displayName}
        fill
        sizes="(max-width: 768px) 100vw, 25vw"
        className="object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/55 to-transparent p-3">
        <div className="inline-flex max-w-[75%] items-center gap-2 rounded-md bg-white/92 px-2 py-1 text-xs font-medium text-black shadow-sm">
          {participant.isMuted ? (
            <MicOff className="size-3.5 text-black/60" />
          ) : (
            <Mic className="size-3.5 text-[#003476]" />
          )}
          <span className="truncate">{participant.displayName.split(" ")[0]}</span>
        </div>
        {isHost && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#003476] px-2 py-1 text-xs font-semibold text-white">
            <Volume2 className="size-3" />
            Host
          </span>
        )}
      </div>
    </div>
  );
}

export default function TranslationRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: roomId } = use(params);
  const user = useAuthStore((s) => s.user);
  const { data: room } = useTranslationRoom(roomId);
  const startRoom = useStartTranslationRoom();
  const endRoom = useEndTranslationRoom();
  const cancelRoom = useCancelTranslationRoom();
  const storeParticipants = useTranslationRoomStore((s) => s.participants);
  const storeSegments = useTranslationRoomStore((s) => s.transcriptSegments);
  const isMuted = useTranslationRoomStore((s) => s.isMuted);
  const setTranslationRoomState = useTranslationRoomStore((s) => s.setTranslationRoomState);
  const addParticipant = useTranslationRoomStore((s) => s.addParticipant);
  const removeParticipant = useTranslationRoomStore((s) => s.removeParticipant);
  const updateParticipantMute = useTranslationRoomStore((s) => s.updateParticipantMute);
  const addTranscriptSegment = useTranslationRoomStore((s) => s.addTranscriptSegment);
  const setMuted = useTranslationRoomStore((s) => s.setMuted);
  const resetTranslationRoom = useTranslationRoomStore((s) => s.reset);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<RoomParticipant | null>(null);
  const [activeEdgePanel, setActiveEdgePanel] = useState<MeetingEdgePanel | null>(null);
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState<TranslationRoomLifecycleAction | null>(null);
  const [joinPreferences] = useState<JoinSessionPreferences | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const rawSession = window.sessionStorage.getItem(`warptalk.join.${roomId}`);
      return rawSession ? (JSON.parse(rawSession) as JoinSessionPreferences) : null;
    } catch {
      return null;
    }
  });
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  const currentUserId = user?.id ?? "mock-preview-host";
  const displayName =
    searchParams.get("displayName") ||
    joinPreferences?.displayName ||
    user?.fullName?.trim() ||
    "Preview Host";
  const currentSpeakLanguage = normalizeLanguageCode(
    searchParams.get("speakLanguage") || joinPreferences?.speakLanguage || user?.preferredLanguage || "en"
  );
  const currentListenLanguage = normalizeLanguageCode(
    searchParams.get("listenLanguage") ||
      joinPreferences?.listenLanguage ||
      (currentSpeakLanguage === "vi" ? "en" : "vi")
  );
  const joinedViaPreflight = Boolean(joinPreferences || searchParams.get("displayName"));
  const canManageParticipants =
    Boolean(user?.roles?.includes("host") || (user?.id && user.id === room?.hostId)) && !joinedViaPreflight;
  const roomStatus = normalizeRoomStatus(room?.status);
  const isRoomLive = roomStatus === "in_progress";
  const activeLifecycleMutation =
    startRoom.isPending ? "start" : endRoom.isPending ? "end" : cancelRoom.isPending ? "cancel" : undefined;
  const currentParticipant: RoomParticipant = {
    userId: currentUserId,
    displayName,
    role: canManageParticipants ? "host" : "participant",
    status: "joined",
    speakLanguage: currentSpeakLanguage,
    listenLanguage: currentListenLanguage,
    isMuted,
    isUsingVoiceClone: Boolean(user),
    avatarUrl: user?.avatarUrl,
    joinedAt: new Date().toISOString(),
    source: user ? "auth" : "mock",
  };

  const realtimeParticipants = storeParticipants.map(normalizeRealtimeParticipant);
  const shouldUseContractPreview = realtimeParticipants.length === 0 && !isConnected;
  const participants = mergeParticipants([
    currentParticipant,
    ...(shouldUseContractPreview ? MOCK_CONTRACT_PARTICIPANTS : realtimeParticipants),
  ]);
  const activeParticipantCount = participants.filter((p) => p.status !== "left" && p.status !== "removed").length;
  const transcriptSegments =
    storeSegments.length > 0
      ? storeSegments
      : MOCK_SEGMENTS;
  const meetingTitle = room?.title ?? "Global Strategy Sync";
  const meetingCode = room?.translationRoomCode ?? "GSS-7X2Q";
  const sourceLanguageName = getLanguageName(room?.sourceLanguage || joinPreferences?.sourceLanguage || currentSpeakLanguage);
  const targetLanguageNames = (
    room?.targetLanguages
      ?.split(",")
      .map((language) => language.trim())
      .filter(Boolean) ||
    joinPreferences?.targetLanguages ||
    [currentListenLanguage]
  )
    .map(getLanguageName)
    .join(", ");

  const { isRecording, error, toggleRecording } = useSpeechCapture({
    chunkDurationMs: 1000,
    onAudioChunk: (base64Audio, index) => {
      if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
        connectionRef.current
          .invoke("SendAudioChunk", roomId, base64Audio, index, currentParticipant.speakLanguage || "auto")
          .catch((err) => console.error("Error sending audio chunk:", err));
      }
    },
  });

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    const connection = createHubConnection("/hubs/translationRoom");
    connectionRef.current = connection;

    connection.on("TranslationRoomStarted", setTranslationRoomState);

    connection.on("TranslationRoomEnded", () => {
      toast.info("This room has ended. Artifacts and feedback are available after processing.");
    });

    connection.on("ParticipantJoined", (participant: ParticipantInfoDto) => {
      addParticipant(normalizeRealtimeParticipant(participant));
      toast.success(`${participant.displayName} joined the room`);
    });

    connection.on("ParticipantLeft", (userId: string) => {
      removeParticipant(userId);
    });

    connection.on("ParticipantMuteChanged", (userId: string, isMuted: boolean) => {
      updateParticipantMute(userId, isMuted);
      if (userId === currentUserId) {
        setMuted(isMuted);
      }
    });

    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => {
      addTranscriptSegment(segment);
    });

    connection.on("TranslationTextReceived", (dto: { segmentId: string; translatedText: string; targetLang: string }) => {
      addTranscriptSegment({
        segmentId: dto.segmentId,
        speakerId: "unknown",
        speakerName: "Unknown",
        originalText: "",
        originalLanguage: "auto",
        translatedText: dto.translatedText,
        targetLanguage: dto.targetLang,
        confidence: 0,
        startTimeMs: 0,
        endTimeMs: 0,
      });
    });

    connection
      .start()
      .then(async () => {
        setIsConnected(true);
        await connection.invoke(
          "JoinTranslationRoom",
          roomId,
          currentParticipant.displayName,
          currentParticipant.speakLanguage,
          currentParticipant.listenLanguage
        );
      })
      .catch((err) => {
        console.error("SignalR Connection Error: ", err);
        setIsConnected(false);
        toast.error("Using participant contract preview until the room connects.");
      });

    return () => {
      resetTranslationRoom();
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke("LeaveTranslationRoom", roomId).finally(() => {
          connection.stop();
        });
      } else {
        connection.stop();
      }
    };
  }, [
    addParticipant,
    addTranscriptSegment,
    currentParticipant.displayName,
    currentParticipant.listenLanguage,
    currentParticipant.speakLanguage,
    currentUserId,
    removeParticipant,
    resetTranslationRoom,
    roomId,
    setMuted,
    setTranslationRoomState,
    updateParticipantMute,
  ]);

  const handleToggleMute = async (participant: RoomParticipant) => {
    const isSelf = participant.userId === currentUserId;
    const nextMuted = !participant.isMuted;

    if (!canManageParticipants) {
      toast.error("Only the host can manage participants.");
      return;
    }

    if (!isSelf) {
      updateParticipantMute(participant.userId, nextMuted);
      toast.info("Remote mute is shown in UI; backend host-mute endpoint is pending.");
      return;
    }

    try {
      await connectionRef.current?.invoke("ToggleMute", roomId, nextMuted);
      setMuted(nextMuted);
      updateParticipantMute(participant.userId, nextMuted);
    } catch (err) {
      console.error("Error toggling mute:", err);
      toast.error("Could not update mute state.");
    }
  };

  const openLifecycleConfirm = (action: TranslationRoomLifecycleAction) => {
    if (!getAllowedLifecycleActions(roomStatus, canManageParticipants).includes(action)) {
      toast.error("This lifecycle action is not available for the current room state.");
      return;
    }

    setPendingLifecycleAction(action);
  };

  const handleConfirmLifecycleAction = async () => {
    if (!pendingLifecycleAction) return;

    try {
      if (pendingLifecycleAction === "start") {
        await startRoom.mutateAsync(roomId);
      } else if (pendingLifecycleAction === "end") {
        await endRoom.mutateAsync(roomId);
      } else {
        await cancelRoom.mutateAsync(roomId);
      }

      toast.success(lifecycleActionCopy[pendingLifecycleAction].success);
      setPendingLifecycleAction(null);
    } catch (err) {
      console.error("Room lifecycle action failed:", err);
      toast.error("Could not update room lifecycle state.");
    }
  };

  const handleLeave = () => {
    if (roomStatus === "ended" || roomStatus === "archived") {
      router.push(`/feedback?roomId=${roomId}`);
      return;
    }

    router.push(canManageParticipants ? "/rooms" : "/join");
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-black">
      <MeetingBottomBar
        title={meetingTitle}
        roomCode={meetingCode}
        isRoomLive={isRoomLive}
        roomStatus={roomStatus}
        activeParticipantCount={activeParticipantCount}
        isMuted={isMuted}
        isRecording={isRecording}
        isConnected={isConnected}
        canUsePreview={shouldUseContractPreview}
        currentParticipant={currentParticipant}
        onOpenPanel={setActiveEdgePanel}
        onLeave={handleLeave}
        onToggleMute={handleToggleMute}
      />
      <MeetingSidePanel
        activePanel={activeEdgePanel}
        title={meetingTitle}
        roomCode={meetingCode}
        isRoomLive={isRoomLive}
        roomStatus={roomStatus}
        activeParticipantCount={activeParticipantCount}
        participants={participants}
        canManageParticipants={canManageParticipants}
        currentUserId={currentUserId}
        contractPreview={shouldUseContractPreview}
        sourceLanguageName={sourceLanguageName}
        targetLanguageNames={targetLanguageNames}
        isMuted={isMuted}
        isRecording={isRecording}
        activeLifecycleMutation={activeLifecycleMutation}
        onClose={() => setActiveEdgePanel(null)}
        onOpenPanel={setActiveEdgePanel}
        onLeave={handleLeave}
        onLifecycleAction={openLifecycleConfirm}
        onToggleMute={handleToggleMute}
        onToggleRecording={toggleRecording}
        onViewParticipant={setSelectedParticipant}
      />

      <main className="grid min-h-0 flex-1 gap-3 overflow-hidden bg-white p-3 pb-20 lg:grid-cols-[minmax(0,1fr)_404px]">
        <section className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_112px] gap-3 overflow-hidden pr-1">
          <Card className="h-full gap-0 overflow-hidden rounded-lg border-[#e4eef9] bg-white py-0 shadow-none">
            <CardContent className="p-0">
              <div className="relative h-full overflow-hidden bg-[linear-gradient(135deg,#ffffff_0%,#fdfcf6_48%,#e4eef9_100%)] p-5 md:p-6">
                <Badge variant="secondary" className="gap-1 bg-[#fdfcf6] text-black shadow-sm">
                  <Volume2 className="size-3.5 text-[#003476]" />
                  {participants.find((p) => p.role === "host")?.displayName.split(" ")[0] ?? "Host"} is presenting
                </Badge>
                <div className="mt-4 max-w-2xl">
                  <h2 className="text-3xl font-bold leading-tight tracking-normal text-black md:text-[40px]">
                    Building the future of communication
                  </h2>
                  <p className="mt-2 text-base text-black/60">Our roadmap to 2026 and beyond</p>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  {["Q2 2024 Launch Core Platform", "Q4 2024 Scale Global Reach", "Q2 2025 AI-Powered Experiences", "Q4 2025 Intelligent Collaboration"].map(
                    (milestone, index) => (
                      <div key={milestone} className="relative rounded-lg border border-[#e4eef9] bg-white/80 p-2 text-center shadow-sm">
                        <div className="mx-auto mb-1 flex size-8 items-center justify-center rounded-full bg-[#003476] text-white shadow-sm">
                          {index === 2 ? <Sparkles /> : index === 3 ? <BadgeCheck /> : <Users />}
                        </div>
                        <p className="text-xs font-semibold text-[#003476]">{milestone.split(" ")[0]} {milestone.split(" ")[1]}</p>
                        <p className="mt-1 text-xs leading-snug text-black">{milestone.split(" ").slice(2, 4).join(" ")}</p>
                        <p className="text-xs leading-snug text-black/70">{milestone.split(" ").slice(4).join(" ")}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {participants.slice(1, 4).map((participant, index) => (
              <VideoTile key={participant.userId} participant={participant} index={index} />
            ))}
          </div>
        </section>

        <div className="hidden min-h-0 lg:block">
          <Tabs defaultValue="transcript" className="flex h-full flex-col overflow-hidden rounded-lg border border-[#e4eef9] bg-white">
            <TabsList variant="line" className="mx-auto h-12 w-full shrink-0 justify-around rounded-none border-b border-[#e4eef9] bg-white">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="m-0 min-h-0 flex-1 overflow-y-auto p-4 text-sm text-black/60">
              Chat messages will appear here during the meeting.
            </TabsContent>
            <TabsContent value="transcript" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {transcriptSegments.map((segment, index) => {
                  const speaker = participants.find((participant) =>
                    participant.displayName.toLowerCase().includes(segment.speakerName.toLowerCase())
                  );

                  return (
                    <div
                      key={`${segment.segmentId}-side`}
                      className={`rounded-lg border p-3 ${
                        index === 0 ? "border-[#003476] bg-white" : "border-transparent bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="size-10">
                          <AvatarImage src={speaker?.avatarUrl} alt={segment.speakerName} />
                          <AvatarFallback className="bg-[#e4eef9] text-[#003476]">
                            {initials(segment.speakerName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-black">{segment.speakerName}</p>
                            <span className="text-xs text-black/50">
                              {Math.floor(segment.endTimeMs / 60000).toString().padStart(2, "0")}:
                              {Math.floor((segment.endTimeMs % 60000) / 1000).toString().padStart(2, "0")}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-black/80">{segment.originalText || segment.translatedText}</p>
                          {segment.translatedText && segment.originalText && (
                            <p className="mt-3 text-sm leading-relaxed text-black/65">{segment.translatedText}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="rounded-lg border border-[#e4eef9] bg-[#fdfcf6] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#003476]">
                    <Sparkles className="size-4" />
                    AI Insight
                  </div>
                  <p className="text-sm leading-relaxed text-black/70">
                    William is emphasizing the long-term vision and global impact of building communication tools that connect teams everywhere.
                  </p>
                  <Button size="sm" variant="outline" className="mt-4 border-[#003476] bg-white text-[#003476] hover:bg-[#e4eef9]">
                    <Sparkles />
                    Ask AI about this
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="ai" className="m-0 min-h-0 flex-1 overflow-y-auto p-4 text-sm text-black/60">
              AI meeting assistance will appear here.
            </TabsContent>
            <form
              className="flex shrink-0 items-center gap-2 border-t border-[#e4eef9] bg-white p-3"
              onSubmit={(event) => event.preventDefault()}
            >
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-lg border-[#e4eef9] bg-white text-black hover:bg-[#fdfcf6]"
                title="Attach file"
              >
                <Paperclip />
                <span className="sr-only">Attach file</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-lg border-[#e4eef9] bg-white text-black hover:bg-[#fdfcf6]"
                title="Attach image"
              >
                <ImageIcon />
                <span className="sr-only">Attach image</span>
              </Button>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e4eef9] bg-[#fdfcf6] px-3 py-2">
                <MessageSquareText className="size-4 shrink-0 text-[#003476]" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/45"
                  placeholder="Ask AI about this meeting..."
                />
              </div>
              <Button size="icon-sm" className="rounded-full bg-[#003476] text-white hover:bg-[#003476]/90">
                <Send className="size-3.5" />
                <span className="sr-only">Send AI question</span>
              </Button>
            </form>
          </Tabs>
        </div>
      </main>

      {selectedParticipant && (
        <Card className="gap-0 rounded-lg border-[#e4eef9] bg-[#fdfcf6] py-0">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-semibold">{selectedParticipant.displayName}</p>
              <p className="text-muted-foreground">
                {selectedParticipant.role} - {selectedParticipant.status} - {formatLanguagePair(selectedParticipant)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedParticipant(null)}>
              Close
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(pendingLifecycleAction)} onOpenChange={(open) => !open && setPendingLifecycleAction(null)}>
        <DialogContent className="border-[#e4eef9] bg-white">
          {pendingLifecycleAction && (
            <>
              <DialogHeader>
                <DialogTitle>{lifecycleActionCopy[pendingLifecycleAction].title}</DialogTitle>
                <DialogDescription>{lifecycleActionCopy[pendingLifecycleAction].body}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-[#e4eef9] bg-[#fdfcf6] p-3 text-xs text-black/70">
                Current state: <span className="font-semibold text-[#003476]">{roomStatusCopy[roomStatus].label}</span>.
                Illegal transitions are hidden before this dialog opens.
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={Boolean(activeLifecycleMutation)} />}>
                  Keep room
                </DialogClose>
                <Button
                  variant={pendingLifecycleAction === "start" ? "default" : "destructive"}
                  className={
                    pendingLifecycleAction === "start"
                      ? "bg-[#003476] text-white hover:bg-[#003476]/90"
                      : "bg-black text-white hover:bg-black/85"
                  }
                  disabled={Boolean(activeLifecycleMutation)}
                  onClick={handleConfirmLifecycleAction}
                >
                  {activeLifecycleMutation ? "Working..." : lifecycleActionCopy[pendingLifecycleAction].confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
