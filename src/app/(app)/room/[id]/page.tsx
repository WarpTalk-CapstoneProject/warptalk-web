"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Languages,
  LogOut,
  Mic,
  MicOff,
  MoreHorizontal,
  Shield,
  Sparkles,
  UserRoundX,
  Users,
  Volume2,
  VolumeX,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSpeechCapture } from "@/hooks/use-speech-capture";
import { createHubConnection } from "@/lib/signalr";
import { getLanguageName } from "@/lib/languages";
import { toast } from "sonner";
import * as signalR from "@microsoft/signalr";
import type { ParticipantInfoDto, TranscriptSegmentDto } from "@/types/realtime";

type RoomParticipant = ParticipantInfoDto & {
  role?: "host" | "participant" | "interpreter";
  status?: "joined" | "connected" | "left" | "removed";
  avatarUrl?: string;
  isUsingVoiceClone?: boolean;
  source?: "current" | "realtime" | "mock";
};

type TranslationTextDto = {
  segmentId: string;
  translatedText: string;
  targetLang: string;
};

const CURRENT_USER_ID = "demo-host";

const MOCK_PARTICIPANTS: RoomParticipant[] = [
  {
    userId: "demo-host",
    displayName: "Demo Host",
    role: "host",
    status: "connected",
    speakLanguage: "en",
    listenLanguage: "vi",
    isMuted: false,
    isUsingVoiceClone: true,
    joinedAt: "2026-05-16T12:00:00.000Z",
    source: "current",
  },
  {
    userId: "participant-sofia",
    displayName: "Sofia Alvarez",
    role: "participant",
    status: "joined",
    speakLanguage: "es",
    listenLanguage: "en",
    isMuted: false,
    isUsingVoiceClone: true,
    joinedAt: "2026-05-16T12:05:00.000Z",
    source: "mock",
  },
  {
    userId: "participant-raj",
    displayName: "Raj Mehta",
    role: "interpreter",
    status: "joined",
    speakLanguage: "en",
    listenLanguage: "hi",
    isMuted: true,
    isUsingVoiceClone: false,
    joinedAt: "2026-05-16T12:08:00.000Z",
    source: "mock",
  },
];

function initials(name?: string) {
  return (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatLanguagePair(participant: Pick<ParticipantInfoDto, "speakLanguage" | "listenLanguage">) {
  return `${getLanguageName(participant.speakLanguage)} -> ${getLanguageName(participant.listenLanguage)}`;
}

function upsertParticipant(list: RoomParticipant[], participant: RoomParticipant) {
  const next = new Map(list.map((item) => [item.userId, item]));
  next.set(participant.userId, { ...next.get(participant.userId), ...participant });
  return Array.from(next.values()).sort((a, b) => {
    const roleWeight = (role?: string) => (role === "host" ? 0 : role === "interpreter" ? 1 : 2);
    return roleWeight(a.role) - roleWeight(b.role) || a.displayName.localeCompare(b.displayName);
  });
}

function normalizeRealtimeParticipant(participant: ParticipantInfoDto): RoomParticipant {
  return {
    role: "participant",
    status: "connected",
    source: "realtime",
    ...participant,
  };
}

function ParticipantRow({
  participant,
  canManage,
  isCurrentUser,
  onToggleMute,
  onRemove,
  onViewDetails,
}: {
  participant: RoomParticipant;
  canManage: boolean;
  isCurrentUser: boolean;
  onToggleMute: (participant: RoomParticipant) => void;
  onRemove: (participant: RoomParticipant) => void;
  onViewDetails: (participant: RoomParticipant) => void;
}) {
  const isAway = participant.status === "left" || participant.status === "removed";

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarImage src={participant.avatarUrl} alt={participant.displayName} />
            <AvatarFallback>{initials(participant.displayName) || "U"}</AvatarFallback>
          </Avatar>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
              isAway ? "bg-muted" : participant.isMuted ? "bg-black" : "bg-[#003476]"
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
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Participant actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Participant</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onViewDetails(participant)}>
                  <BadgeCheck className="mr-2 h-4 w-4" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canManage || isAway} onClick={() => onToggleMute(participant)}>
                  {participant.isMuted ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
                  {participant.isMuted ? "Unmute" : "Mute"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canManage || isCurrentUser || isAway} onClick={() => onRemove(participant)}>
                  <UserRoundX className="mr-2 h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Languages className="h-3.5 w-3.5" />
              <span className="truncate">{formatLanguagePair(participant)}</span>
            </div>
            <div className="flex items-center gap-2">
              {participant.isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span>{participant.isMuted ? "Muted" : "Mic open"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
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
  onToggleMute,
  onRemove,
  onViewDetails,
}: {
  participants: RoomParticipant[];
  canManage: boolean;
  currentUserId: string;
  onToggleMute: (participant: RoomParticipant) => void;
  onRemove: (participant: RoomParticipant) => void;
  onViewDetails: (participant: RoomParticipant) => void;
}) {
  return (
    <aside className="hidden w-80 flex-col border-r bg-muted/20 p-4 md:flex">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Users className="h-4 w-4" />
            Participants ({participants.length})
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Role, status, languages, mute state, and voice clone readiness.</p>
        </div>
        {canManage && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Shield className="h-3 w-3" />
            Host
          </Badge>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.userId}
            participant={participant}
            canManage={canManage}
            isCurrentUser={participant.userId === currentUserId}
            onToggleMute={onToggleMute}
            onRemove={onRemove}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>
    </aside>
  );
}

export default function TranslationRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: roomId } = use(params);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<RoomParticipant[]>(MOCK_PARTICIPANTS);
  const [selectedParticipant, setSelectedParticipant] = useState<RoomParticipant | null>(null);
  const [segments, setSegments] = useState<TranscriptSegmentDto[]>([]);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  const canManageParticipants = true;
  const visibleParticipants = useMemo(() => participants, [participants]);

  const { isRecording, error, toggleRecording } = useSpeechCapture({
    chunkDurationMs: 1000,
    onAudioChunk: (base64Audio, index) => {
      if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
        connectionRef.current
          .invoke("SendAudioChunk", roomId, base64Audio, index, "auto")
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

    connection.on("ParticipantJoined", (participant: ParticipantInfoDto) => {
      setParticipants((prev) => upsertParticipant(prev, normalizeRealtimeParticipant(participant)));
      toast.success(`${participant.displayName} joined the room`);
    });

    connection.on("ParticipantLeft", (userId: string) => {
      setParticipants((prev) =>
        prev.map((participant) =>
          participant.userId === userId ? { ...participant, status: "left" } : participant
        )
      );
    });

    connection.on("ParticipantMuteChanged", (userId: string, isMuted: boolean) => {
      setParticipants((prev) =>
        prev.map((participant) => (participant.userId === userId ? { ...participant, isMuted } : participant))
      );
    });

    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => {
      setSegments((prev) => {
        const existing = prev.findIndex((item) => item.segmentId === segment.segmentId);
        if (existing !== -1) {
          const next = [...prev];
          next[existing] = { ...next[existing], ...segment };
          return next;
        }
        return [...prev, segment];
      });
    });

    connection.on("TranslationTextReceived", (dto: TranslationTextDto) => {
      setSegments((prev) => {
        const existing = prev.findIndex((item) => item.segmentId === dto.segmentId);
        if (existing !== -1) {
          const next = [...prev];
          next[existing] = {
            ...next[existing],
            translatedText: dto.translatedText,
            targetLanguage: dto.targetLang,
          };
          return next;
        }
        return prev;
      });
    });

    connection
      .start()
      .then(() => {
        setIsConnected(true);
        return connection.invoke("JoinTranslationRoom", roomId, "Demo Host", "en", "vi");
      })
      .catch((err) => {
        console.error("SignalR Connection Error: ", err);
        toast.error("Using participant preview until the room connects.");
      });

    return () => {
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke("LeaveTranslationRoom", roomId).finally(() => {
          connection.stop();
        });
      } else {
        connection.stop();
      }
    };
  }, [roomId]);

  const updateParticipantMute = (userId: string, isMuted: boolean) => {
    setParticipants((prev) =>
      prev.map((participant) => (participant.userId === userId ? { ...participant, isMuted } : participant))
    );
  };

  const handleToggleParticipantMute = async (participant: RoomParticipant) => {
    if (!canManageParticipants) {
      toast.error("Only the host can manage participants.");
      return;
    }

    const nextMuted = !participant.isMuted;
    updateParticipantMute(participant.userId, nextMuted);

    if (participant.userId !== CURRENT_USER_ID) {
      toast.info("Remote mute is shown in UI while the backend host-mute endpoint is pending.");
      return;
    }

    try {
      await connectionRef.current?.invoke("ToggleMute", roomId, nextMuted);
    } catch (err) {
      updateParticipantMute(participant.userId, !nextMuted);
      console.error("Error toggling mute:", err);
      toast.error("Could not update mute state.");
    }
  };

  const handleRemoveParticipant = (participant: RoomParticipant) => {
    if (!canManageParticipants || participant.userId === CURRENT_USER_ID) {
      return;
    }

    setParticipants((prev) =>
      prev.map((item) =>
        item.userId === participant.userId ? { ...item, status: "removed", isMuted: true } : item
      )
    );
    toast.info("Remove is reflected in UI while the backend host-remove endpoint is pending.");
  };

  const handleLeave = () => {
    router.push("/dashboard");
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Translation Room</h1>
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? "Connected" : "Preview"}
          </Badge>
          <span className="font-mono text-sm text-muted-foreground">{roomId}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleLeave}>
          <LogOut className="mr-2 h-4 w-4" />
          Leave Room
        </Button>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <ParticipantsPanel
          participants={visibleParticipants}
          canManage={canManageParticipants}
          currentUserId={CURRENT_USER_ID}
          onToggleMute={handleToggleParticipantMute}
          onRemove={handleRemoveParticipant}
          onViewDetails={setSelectedParticipant}
        />

        <section className="flex flex-1 flex-col overflow-hidden p-4 md:p-6">
          {selectedParticipant && (
            <Card className="mb-4 border-[#e4eef9] bg-[#fdfcf6]">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold">{selectedParticipant.displayName}</p>
                  <p className="text-muted-foreground">
                    {selectedParticipant.role ?? "participant"} - {selectedParticipant.status ?? "joined"} - {formatLanguagePair(selectedParticipant)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedParticipant(null)}>
                  Close
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="flex flex-1 flex-col overflow-hidden border-muted shadow-sm">
            <CardHeader className="border-b bg-muted/10 py-4">
              <CardTitle className="flex items-center justify-between text-lg font-medium">
                <span>Live Transcript</span>
                <Button variant="ghost" size="icon">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-6 overflow-y-auto p-4">
              {segments.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No transcripts yet. Start speaking!
                </div>
              ) : (
                segments.map((segment) => (
                  <div key={segment.segmentId} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">{segment.speakerName}</span>
                      <span className="text-xs uppercase text-muted-foreground">{segment.originalLanguage}</span>
                    </div>
                    <p className="text-base leading-relaxed text-foreground">{segment.originalText}</p>
                    {segment.translatedText && (
                      <p className="mt-1 border-l-2 border-primary/30 pl-3 text-base italic text-muted-foreground">
                        {segment.translatedText}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="flex items-center justify-center gap-4 border-t bg-background p-4">
        <Button
          variant={isRecording ? "destructive" : "default"}
          size="lg"
          className="h-16 w-16 rounded-full shadow-lg transition-all"
          onClick={toggleRecording}
          disabled={!isConnected}
        >
          {isRecording ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>
      </footer>
    </div>
  );
}
