"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackLoop,
  TrackToggle,
  useConnectionState,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState, Track } from "livekit-client";
import {
  AlertCircle,
  Captions,
  Clock,
  Copy,
  FileText,
  Loader2,
  Link2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MoreVertical,
  PhoneOff,
  Play,
  Radio,
  ScreenShare,
  Settings,
  Share2,
  Sparkles,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useJoinMeeting, useTriggerMeetingAi } from "@/hooks/use-meeting";
import {
  useAdmitParticipant,
  useEndTranslationRoom,
  useKickParticipant,
  useLeaveTranslationRoom,
  useStartTranslationRoom,
  useTranslationRoom,
  useTranslationRoomParticipants,
  useUpdateParticipantAudio,
} from "@/hooks/use-translationRooms";
import { getLanguageName } from "@/lib/languages";
import { createHubConnection } from "@/lib/signalr";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import type { JoinMeetingResponseDto } from "@/types/meeting";
import type { ParticipantInfoDto, TranscriptSegmentDto, TranslationRoomStateDto } from "@/types/realtime";
import type { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";

function getJoinLink(code: string) {
  if (typeof window === "undefined") return code;
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

function isInstantRoom(room: TranslationRoomDto) {
  return ["instant", "group", "one_to_one", "webinar", "b2b_virtual_mic"].includes(room.translationRoomType);
}

const LIVEKIT_SERVER_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";
type MeetingLayoutMode = "auto" | "grid" | "spotlight" | "sidebar";

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = params.id;
  const user = useAuthStore((state) => state.user);
  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const startRoom = useStartTranslationRoom();
  const endRoom = useEndTranslationRoom();
  const leaveRoom = useLeaveTranslationRoom(roomId);
  const { mutateAsync: joinMeetingAsync, isPending: isMeetingJoining } = useJoinMeeting();
  const { mutate: triggerAiMutate } = useTriggerMeetingAi(roomId);
  const autoStartedRef = useRef(false);
  const meetingJoinedRef = useRef(false);
  const aiTriggeredRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [isParticipantPanelOpen, setIsParticipantPanelOpen] = useState(false);
  const [meetingSession, setMeetingSession] = useState<JoinMeetingResponseDto | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [warptalkStarted, setWarptalkStarted] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<"transcript" | "chat" | "notes" | "people">("transcript");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localMediaError, setLocalMediaError] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [meetingLayout, setMeetingLayout] = useState<MeetingLayoutMode>("auto");

  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const transcriptSegments = useTranslationRoomStore((state) => state.transcriptSegments);
  const setLiveState = useTranslationRoomStore((state) => state.setTranslationRoomState);
  const addLiveParticipant = useTranslationRoomStore((state) => state.addParticipant);
  const removeLiveParticipant = useTranslationRoomStore((state) => state.removeParticipant);
  const addTranscriptSegment = useTranslationRoomStore((state) => state.addTranscriptSegment);
  const resetLiveRoom = useTranslationRoomStore((state) => state.reset);

  const isPreviewRoom = roomId.startsWith("preview-");
  const room = roomQuery.data ?? (isPreviewRoom ? getPreviewLiveRoom(roomId) : undefined);
  const refetchRoom = roomQuery.refetch;
  const apiParticipants = participantsQuery.data ?? (isPreviewRoom ? getPreviewLiveParticipants(roomId) : []);
  const isHost = Boolean(room?.isHost || (user?.id && room?.hostId === user.id));
  const participants = liveParticipants.length ? mergeParticipants(apiParticipants, liveParticipants) : apiParticipants;
  const activeCount = participants.filter((participant) => !["left", "removed", "kicked"].includes(participant.status)).length;
  const joinLink = room?.translationRoomCode ? getJoinLink(room.translationRoomCode) : "";
  const liveSegments = useMemo(() => dedupeSegments(transcriptSegments), [transcriptSegments]);
  const latestSegment = liveSegments.at(-1);
  const canConnectMeeting =
    Boolean(room) &&
    room?.status !== "ended" &&
    room?.status !== "cancelled" &&
    room?.status !== "expired" &&
    room?.status !== "failed";
  const displayName = user?.fullName || user?.email || "Participant";
  const sourceLanguage = room?.sourceLanguage ?? "vi";
  const targetLanguage = room?.targetLanguages[0] ?? "en";

  function retryMeetingConnection() {
    if (!room?.id || !canConnectMeeting) return;

    meetingJoinedRef.current = true;
    aiTriggeredRef.current = false;
    setMeetingSession(null);

    void joinMeetingAsync(room.id)
      .then((session) => {
        setMeetingError(null);
        setMeetingSession(session);
      })
      .catch((error) => {
        setMeetingSession(null);
        setMeetingError(error instanceof Error ? error.message : "Could not connect to the LiveKit meeting.");
      });
  }

  useEffect(() => {
    if (!room || !isHost || autoStartedRef.current) return;
    if (room.status !== "waiting" || !isInstantRoom(room)) return;

    autoStartedRef.current = true;
    startRoom.mutate(room.id, {
      onSuccess: () => toast.success("Room is live."),
      onError: () => {
        autoStartedRef.current = false;
      },
    });
  }, [isHost, room, startRoom]);

  useEffect(() => {
    if (!room?.id || !canConnectMeeting || meetingJoinedRef.current) return;
    meetingJoinedRef.current = true;

    const translationRoomId = room.id;
    queueMicrotask(() => {
      void joinMeetingAsync(translationRoomId)
        .then((session) => {
          setMeetingError(null);
          setMeetingSession(session);
        })
        .catch((error) => {
          setMeetingSession(null);
          setMeetingError(error instanceof Error ? error.message : "Could not connect to the LiveKit meeting.");
        });
    });
  }, [canConnectMeeting, joinMeetingAsync, room?.id]);

  useEffect(() => {
    if (!meetingSession || aiTriggeredRef.current) return;

    aiTriggeredRef.current = true;
    triggerAiMutate({ participantIdentity: meetingSession.participantIdentity });
  }, [meetingSession, triggerAiMutate]);

  useEffect(() => {
    if (!roomId) return;

    resetLiveRoom();
    const connection = createHubConnection("/hubs/translation-room");

    connection.on("TranslationRoomStarted", (state: TranslationRoomStateDto) => setLiveState(state));
    connection.on("ParticipantJoined", (participant: ParticipantInfoDto) => addLiveParticipant(participant));
    connection.on("ParticipantLeft", (userId: string) => removeLiveParticipant(userId));
    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => addTranscriptSegment(segment));
    connection.on("TranslationRoomEnded", () => refetchRoom());

    connection
      .start()
      .then(() =>
        connection
          .invoke("JoinTranslationRoom", roomId, displayName, sourceLanguage, targetLanguage)
          .catch(() => undefined)
      )
      .catch(() => undefined);

    return () => {
      connection.stop().catch(() => undefined);
      resetLiveRoom();
    };
  }, [
    addLiveParticipant,
    addTranscriptSegment,
    refetchRoom,
    removeLiveParticipant,
    resetLiveRoom,
    displayName,
    roomId,
    setLiveState,
    sourceLanguage,
    targetLanguage,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function startLocalMedia() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setLocalMediaError("This browser does not support camera and microphone access.");
        return;
      }

      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);

      if (!cameraEnabled && !microphoneEnabled) {
        setLocalMediaError(null);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraEnabled ? true : false,
          audio: microphoneEnabled ? { echoCancellation: true, noiseSuppression: true } : false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
        setLocalMediaError(null);
      } catch (error) {
        if (cancelled) return;
        setLocalMediaError(error instanceof Error ? error.message : "Unable to access camera or microphone.");
      }
    }

    void startLocalMedia();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [cameraEnabled, microphoneEnabled]);

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    toast.success(`${label} copied.`);
  }

  async function handleExit() {
    try {
      if (isHost && room?.status !== "ended" && room?.status !== "cancelled") {
        await endRoom.mutateAsync(roomId);
        toast.success("Room ended.");
      } else if (!isHost && room?.status !== "ended" && room?.status !== "cancelled") {
        await leaveRoom.mutateAsync();
        toast.success("You left the room.");
      }
      router.push("/rooms");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not leave the room.");
    }
  }

  async function handleToggleScreenShare() {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      toast.success("Screen sharing stopped.");
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("This browser does not support screen sharing.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        screenStreamRef.current = null;
        setScreenStream(null);
      });
      toast.success("Screen sharing started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start screen sharing.");
    }
  }

  if (roomQuery.isLoading && !isPreviewRoom) {
    return <StatePanel title="Loading room..." description="Fetching room details from the TranslationRoom service." />;
  }

  function handleStartWarptalk() {
    setWarptalkStarted(true);
    toast.success("WarpTalk realtime translation started.");
  }

  if ((roomQuery.isError && !isPreviewRoom) || !room) {
    return (
      <StatePanel
        icon={<AlertCircle className="h-8 w-8" />}
        title="Room unavailable"
        description="The room does not exist or your account cannot access it."
      />
    );
  }

  return (
    <div className="h-screen min-h-0 overflow-hidden bg-[#111111] p-3 text-white">
      <LiveKitRoom
        audio
        video
        token={meetingSession?.token}
        serverUrl={LIVEKIT_SERVER_URL}
        connect={Boolean(meetingSession?.token)}
        data-lk-theme="default"
        className="h-full"
      >
        <main className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_82px] gap-3">
          <section className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="relative min-h-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#191919] shadow-2xl">
              <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
                {participants.slice(0, 5).map((participant) => (
                  <ParticipantPill key={participant.id} participant={participant} />
                ))}
              </div>

              <LiveKitMeetingStage
                fallbackName={user?.fullName || user?.email || room.title}
                isJoining={isMeetingJoining}
                error={meetingError}
                localStream={localStream}
                localMediaError={localMediaError}
                cameraEnabled={cameraEnabled}
                participants={participants}
                screenStream={screenStream}
                layoutMode={meetingLayout}
                onRetry={retryMeetingConnection}
              />
              <RoomAudioRenderer />

              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-5 pb-5 pt-24">
                <CaptionWindow latestSegment={warptalkStarted ? latestSegment ?? getPreviewTranscriptSegment() : undefined} warptalkStarted={warptalkStarted} />
              </div>
            </div>

            <MeetingSidePanel
              roomId={roomId}
              room={room}
              isHost={isHost}
              mode={sidePanelMode}
              onModeChange={setSidePanelMode}
              participants={participants}
              participantsLoading={participantsQuery.isLoading && !isPreviewRoom}
              participantsError={participantsQuery.isError && !isPreviewRoom}
              activeCount={activeCount}
              segments={warptalkStarted ? liveSegments.length ? liveSegments : getPreviewTranscriptSegments() : []}
            />
          </section>

          <MeetingControlBar
            room={room}
            isHost={isHost}
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            activeCount={activeCount}
            meetingEnabled={Boolean(meetingSession?.token)}
            cameraEnabled={cameraEnabled}
            microphoneEnabled={microphoneEnabled}
            isScreenSharing={Boolean(screenStream)}
            layoutMode={meetingLayout}
            roomCode={room.translationRoomCode}
            joinLink={joinLink}
            warptalkStarted={warptalkStarted}
            panelMode={sidePanelMode}
            onCopyText={copyText}
            onExit={handleExit}
            onStartWarptalk={handleStartWarptalk}
            onToggleCamera={() => setCameraEnabled((current) => !current)}
            onToggleMicrophone={() => setMicrophoneEnabled((current) => !current)}
            onToggleScreenShare={handleToggleScreenShare}
            onLayoutChange={setMeetingLayout}
            onPanelModeChange={setSidePanelMode}
            onToggleParticipants={() => setIsParticipantPanelOpen((current) => !current)}
          />
        </main>

        {isParticipantPanelOpen ? (
          <div className="absolute bottom-24 right-6 top-24 z-40 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-white/10 bg-[#f7f7f7] text-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold">People</h2>
                <p className="text-sm text-neutral-500">{activeCount} in room</p>
              </div>
              <button
                type="button"
                onClick={() => setIsParticipantPanelOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-100"
                aria-label="Close participants"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(100%-72px)] overflow-y-auto p-3">
              {participants.map((participant) => (
                <ParticipantRow
                  key={participant.id}
                  participant={participant}
                  isHost={isHost}
                  roomId={roomId}
                  isRoomHost={participant.userId === room.hostId}
                />
              ))}
            </div>
          </div>
        ) : null}
      </LiveKitRoom>
    </div>
  );
}

// Kept temporarily while the meeting footer owns the active layout.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MeetingTopBar({
  room,
  isHost,
  activeCount,
  sourceLanguage,
  targetLanguage,
  joinLink,
  onCopyText,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  activeCount: number;
  sourceLanguage: string;
  targetLanguage: string;
  joinLink: string;
  onCopyText: (value: string, label: string) => void;
}) {
  return (
    <header className="flex min-h-0 items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-[#1b1b1b] px-4 shadow-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-neutral-950">
          <Radio className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold">{room.title}</h1>
            <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Live
            </span>
            {isHost ? <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold">Host</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-white/55">
            {room.translationRoomCode} · {activeCount}/{room.maxParticipants} participants · {getLanguageName(sourceLanguage)} to {getLanguageName(targetLanguage)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onCopyText(joinLink, "Invite link")}
          className="hidden h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 transition hover:bg-white/90 md:flex"
        >
          <Share2 className="h-4 w-4" />
          Invite
        </button>
        <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15" aria-label="Meeting settings">
          <Settings className="h-4 w-4" />
        </button>
        <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15" aria-label="More actions">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function MeetingSidePanel({
  roomId,
  room,
  isHost,
  mode,
  onModeChange,
  participants,
  participantsLoading,
  participantsError,
  activeCount,
  segments,
}: {
  roomId: string;
  room: TranslationRoomDto;
  isHost: boolean;
  mode: "transcript" | "chat" | "notes" | "people";
  onModeChange: (mode: "transcript" | "chat" | "notes" | "people") => void;
  participants: TranslationRoomParticipantDto[];
  participantsLoading: boolean;
  participantsError: boolean;
  activeCount: number;
  segments: TranscriptSegmentDto[];
}) {
  return (
    <aside className="hidden min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 xl:grid">
      <div className="flex items-center gap-2 rounded-[24px] border border-white/10 bg-[#1b1b1b] p-2 shadow-xl">
        <PanelModeButton active={mode === "transcript"} icon={<Captions />} label="Transcript" onClick={() => onModeChange("transcript")} />
        <PanelModeButton active={mode === "chat"} icon={<MessageSquare />} label="Chat" onClick={() => onModeChange("chat")} />
        <PanelModeButton active={mode === "notes"} icon={<Sparkles />} label="Notes" onClick={() => onModeChange("notes")} />
        <PanelModeButton active={mode === "people"} icon={<Users />} label="People" onClick={() => onModeChange("people")} />
      </div>
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] border border-white/10 bg-[#f7f7f7] text-neutral-950 shadow-2xl">
        <div className="border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">{panelTitle(mode)}</h2>
              <p className="text-xs text-neutral-500">{panelDescription(mode)}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-neutral-950 text-white">
              {panelIcon(mode)}
            </span>
          </div>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto p-3">
          {mode === "transcript" ? (
            segments.length ? segments.map((segment) => <TranscriptBubble key={segment.segmentId} segment={segment} />) : <EmptyPanel text="Start WarpTalk realtime translation to show live transcript here." />
          ) : null}
          {mode === "chat" ? <MeetingChat /> : null}
          {mode === "notes" ? <AiNotesPanel /> : null}
          {mode === "people" ? (
            <PeoplePanel
              roomId={roomId}
              room={room}
              isHost={isHost}
              participants={participants}
              participantsLoading={participantsLoading}
              participantsError={participantsError}
              activeCount={activeCount}
            />
          ) : null}
        </div>
      </section>

      {false ? <section className="grid min-h-0 grid-cols-2 gap-3">
        <div className="rounded-[28px] border border-white/10 bg-[#f7f7f7] p-4 text-neutral-950 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">AI notes</h2>
            <Sparkles className="h-4 w-4" />
          </div>
          <ul className="space-y-2 text-xs text-neutral-600">
            <li>• Confirm investor rollout risks.</li>
            <li>• Follow up terminology cleanup.</li>
            <li>• Export transcript after meeting ends.</li>
          </ul>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#f7f7f7] p-4 text-neutral-950 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">People</h2>
            <span className="rounded-full bg-neutral-950 px-2 py-0.5 text-xs font-bold text-white">{activeCount}</span>
          </div>
          {participantsLoading ? <p className="text-xs text-neutral-500">Loading participants...</p> : null}
          {participantsError ? <p className="text-xs text-red-600">Could not load participant controls.</p> : null}
          <div className="space-y-2">
            {participants.slice(0, 3).map((participant) => (
              <div key={participant.id} className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-neutral-950 text-xs font-bold text-white">
                  {initials(participant.displayName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{participant.displayName}</p>
                  <p className="text-[11px] capitalize text-neutral-500">{participant.role.toString().toLowerCase()}</p>
                </div>
              </div>
            ))}
          </div>
          {isHost ? (
            <div className="mt-3 border-t border-neutral-200 pt-3 text-[11px] text-neutral-500">
              Host controls are available in the people drawer.
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-500">
            <FileText className="h-3.5 w-3.5" />
            {room.translationRoomCode} · {roomId}
          </div>
        </div>
      </section> : null}
    </aside>
  );
}

function TranscriptBubble({ segment }: { segment: TranscriptSegmentDto }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span className="font-semibold text-neutral-900">{segment.speakerName || "Speaker"}</span>
        <span>
          {getLanguageName(segment.originalLanguage)}
          {segment.targetLanguage ? ` -> ${getLanguageName(segment.targetLanguage)}` : ""}
        </span>
      </div>
      <p className="text-sm leading-5 text-neutral-800">{segment.originalText}</p>
      {segment.translatedText ? <p className="mt-2 text-sm font-semibold leading-5 text-neutral-950">{segment.translatedText}</p> : null}
    </div>
  );
}

function PanelModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-2 text-xs font-semibold transition ${
        active ? "bg-white text-neutral-950" : "text-white/60 hover:bg-white/10 hover:text-white"
      } [&_svg]:h-4 [&_svg]:w-4`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function panelTitle(mode: "transcript" | "chat" | "notes" | "people") {
  if (mode === "chat") return "Meeting chat";
  if (mode === "notes") return "AI notes";
  if (mode === "people") return "People";
  return "Live transcript";
}

function panelDescription(mode: "transcript" | "chat" | "notes" | "people") {
  if (mode === "chat") return "Messages between participants";
  if (mode === "notes") return "Realtime AI draft notes";
  if (mode === "people") return "Participants and host controls";
  return "Original and translated captions";
}

function panelIcon(mode: "transcript" | "chat" | "notes" | "people") {
  if (mode === "chat") return <MessageSquare className="h-4 w-4" />;
  if (mode === "notes") return <Sparkles className="h-4 w-4" />;
  if (mode === "people") return <Users className="h-4 w-4" />;
  return <Captions className="h-4 w-4" />;
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-6 text-center text-sm text-neutral-500">
      {text}
    </div>
  );
}

function MeetingChat() {
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState([
    { from: "Host", body: "We will start WarpTalk translation after everyone confirms audio.", mine: false },
    { from: "Mika Tanaka", body: "Audio is clear on my side.", mine: false },
    { from: "You", body: "Thanks. Starting translation in a moment.", mine: true },
  ]);

  function sendMessage() {
    const text = draftMessage.trim();
    if (!text) return;
    setMessages((current) => [...current, { from: "You", body: text, mine: true }]);
    setDraftMessage("");
  }

  return (
    <div className="flex min-h-[360px] flex-col gap-3">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((message) => (
          <div key={`${message.from}-${message.body}`} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${message.mine ? "bg-neutral-950 text-white" : "border bg-white text-neutral-950"}`}>
              <p className={`mb-1 text-[11px] font-semibold ${message.mine ? "text-white/60" : "text-neutral-500"}`}>{message.from}</p>
              <p>{message.body}</p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex h-11 items-center gap-2 rounded-full border bg-white px-4 text-sm text-neutral-950"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <MessageSquare className="h-4 w-4" />
        <input
          value={draftMessage}
          onChange={(event) => setDraftMessage(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-neutral-400"
          placeholder="Type a message..."
        />
        <button type="submit" className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white">
          Send
        </button>
      </form>
    </div>
  );
}

function AiNotesPanel() {
  return (
    <ul className="space-y-3 text-sm text-neutral-700">
      <li className="rounded-2xl border bg-white p-3">Confirm investor rollout risks.</li>
      <li className="rounded-2xl border bg-white p-3">Follow up terminology cleanup.</li>
      <li className="rounded-2xl border bg-white p-3">Export transcript after meeting ends.</li>
    </ul>
  );
}

function PeoplePanel({
  roomId,
  room,
  isHost,
  participants,
  participantsLoading,
  participantsError,
  activeCount,
}: {
  roomId: string;
  room: TranslationRoomDto;
  isHost: boolean;
  participants: TranslationRoomParticipantDto[];
  participantsLoading: boolean;
  participantsError: boolean;
  activeCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border bg-white p-3 text-sm">
        <span className="font-semibold">Active participants</span>
        <span className="rounded-full bg-neutral-950 px-2 py-0.5 text-xs font-bold text-white">{activeCount}</span>
      </div>
      {participantsLoading ? <p className="text-xs text-neutral-500">Loading participants...</p> : null}
      {participantsError ? <p className="text-xs text-red-600">Could not load participant controls.</p> : null}
      {participants.map((participant) => (
        <ParticipantRow
          key={participant.id}
          participant={participant}
          isHost={isHost}
          roomId={roomId}
          isRoomHost={participant.userId === room.hostId}
        />
      ))}
      <div className="flex items-center gap-2 rounded-2xl border bg-white p-3 text-[11px] text-neutral-500">
        <FileText className="h-3.5 w-3.5" />
        {room.translationRoomCode} - {roomId}
      </div>
    </div>
  );
}

function MeetingControlBar({
  room,
  isHost,
  sourceLanguage,
  targetLanguage,
  roomCode,
  joinLink,
  activeCount,
  meetingEnabled,
  cameraEnabled,
  microphoneEnabled,
  isScreenSharing,
  layoutMode,
  warptalkStarted,
  panelMode,
  onCopyText,
  onExit,
  onStartWarptalk,
  onToggleCamera,
  onToggleMicrophone,
  onToggleScreenShare,
  onLayoutChange,
  onPanelModeChange,
  onToggleParticipants,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  roomCode: string;
  joinLink: string;
  activeCount: number;
  meetingEnabled: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  isScreenSharing: boolean;
  layoutMode: MeetingLayoutMode;
  warptalkStarted: boolean;
  panelMode: "transcript" | "chat" | "notes" | "people";
  onCopyText: (value: string, label: string) => void;
  onExit: () => void;
  onStartWarptalk: () => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onToggleScreenShare: () => void;
  onLayoutChange: (layout: MeetingLayoutMode) => void;
  onPanelModeChange: (mode: "transcript" | "chat" | "notes" | "people") => void;
  onToggleParticipants: () => void;
}) {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);

  return (
    <footer className="grid min-h-0 grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)] items-center gap-3 rounded-[28px] border border-white/10 bg-[#1b1b1b] px-4 shadow-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-neutral-950">
          <Radio className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{room.title}</h1>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${warptalkStarted ? "bg-red-500 text-white" : "bg-white/10 text-white/70"}`}>
              {warptalkStarted ? "Live" : "Ready"}
            </span>
            {isHost ? <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold">Host</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-white/55">
            {roomCode} - {activeCount}/{room.maxParticipants} participants - {getLanguageName(sourceLanguage)} to {getLanguageName(targetLanguage)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {isHost ? (
          <button
            type="button"
            onClick={onStartWarptalk}
            disabled={warptalkStarted}
            className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
              warptalkStarted ? "bg-emerald-500/20 text-emerald-200" : "bg-white text-neutral-950 hover:bg-white/90"
            }`}
          >
            <Play className="h-4 w-4" />
            {warptalkStarted ? "WarpTalk on" : "Start WarpTalk"}
          </button>
        ) : null}
        <MeetControl label="Copy invite" icon={<Link2 className="h-5 w-5" />} onClick={() => onCopyText(joinLink, "Invite link")} />
        <MeetControl label="Copy code" icon={<Copy className="h-5 w-5" />} onClick={() => onCopyText(roomCode, "Room code")} />
        <MeetControl label="Transcript" active={panelMode === "transcript"} icon={<Captions className="h-5 w-5" />} onClick={() => onPanelModeChange("transcript")} />
        <MeetControl label="Chat" active={panelMode === "chat"} icon={<MessageSquare className="h-5 w-5" />} onClick={() => onPanelModeChange("chat")} />
        <LiveKitTrackControls
          enabled={meetingEnabled}
          cameraEnabled={cameraEnabled}
          microphoneEnabled={microphoneEnabled}
          onToggleCamera={onToggleCamera}
          onToggleMicrophone={onToggleMicrophone}
        />
        <MeetControl
          label={isScreenSharing ? "Stop presenting" : "Present now"}
          active={isScreenSharing}
          icon={<ScreenShare className="h-5 w-5" />}
          onClick={onToggleScreenShare}
        />
        <button
          type="button"
          onClick={onExit}
          className="grid h-12 w-14 place-items-center rounded-full bg-red-600 text-white transition hover:bg-red-500"
          aria-label={isHost ? "End room" : "Leave room"}
          title={isHost ? "End room" : "Leave room"}
        >
          {isHost ? <PhoneOff className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onCopyText(joinLink, "Invite link")}
          className="hidden h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 transition hover:bg-white/90 2xl:flex"
        >
          <Share2 className="h-4 w-4" />
          Invite
        </button>
        <MeetControl label="Notes" active={panelMode === "notes"} icon={<Sparkles className="h-5 w-5" />} onClick={() => onPanelModeChange("notes")} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsLayoutMenuOpen((current) => !current)}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15"
            aria-label="Layout options"
            title="Layout options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {isLayoutMenuOpen ? (
            <div className="absolute bottom-14 right-0 z-50 w-52 rounded-2xl border border-white/10 bg-[#252525] p-2 text-sm text-white shadow-2xl">
              <LayoutOption label="Auto" value="auto" active={layoutMode === "auto"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
              <LayoutOption label="Grid" value="grid" active={layoutMode === "grid"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
              <LayoutOption label="Spotlight" value="spotlight" active={layoutMode === "spotlight"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
              <LayoutOption label="Presentation sidebar" value="sidebar" active={layoutMode === "sidebar"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            onPanelModeChange("people");
            onToggleParticipants();
          }}
          className="relative grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15"
          aria-label="People"
          title="People"
        >
          <Users className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs font-bold text-neutral-950">
            {activeCount}
          </span>
        </button>
      </div>
    </footer>
  );
}

function CaptionWindow({ latestSegment, warptalkStarted }: { latestSegment?: TranscriptSegmentDto; warptalkStarted: boolean }) {
  if (!latestSegment) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl bg-black/45 px-5 py-4 text-center backdrop-blur">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-white/70">
          <Radio className="h-4 w-4" />
          {warptalkStarted ? "Transcript will appear here when real audio is received." : "WarpTalk realtime translation is ready. Host must press Start WarpTalk."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl rounded-2xl bg-black/60 px-5 py-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/60">
        <span className="font-semibold text-white/80">{latestSegment.speakerName || "Speaker"}</span>
        <span>
          {getLanguageName(latestSegment.originalLanguage)}
          {latestSegment.targetLanguage ? ` -> ${getLanguageName(latestSegment.targetLanguage)}` : ""}
        </span>
      </div>
      <p className="text-lg leading-8 text-white">{latestSegment.originalText}</p>
      {latestSegment.translatedText && <p className="mt-2 text-2xl font-semibold leading-9 text-[#8ab4f8]">{latestSegment.translatedText}</p>}
    </div>
  );
}

function LayoutOption({
  label,
  value,
  active,
  onSelect,
  close,
}: {
  label: string;
  value: MeetingLayoutMode;
  active: boolean;
  onSelect: (layout: MeetingLayoutMode) => void;
  close: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(value);
        close();
      }}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${active ? "bg-white text-neutral-950" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
    >
      {label}
      {active ? <span className="h-2 w-2 rounded-full bg-neutral-950" /> : null}
    </button>
  );
}

function LiveKitMeetingStage({
  fallbackName,
  isJoining,
  error,
  localStream,
  localMediaError,
  cameraEnabled,
  participants,
  screenStream,
  layoutMode,
  onRetry,
}: {
  fallbackName: string;
  isJoining: boolean;
  error: string | null;
  localStream: MediaStream | null;
  localMediaError: string | null;
  cameraEnabled: boolean;
  participants: TranslationRoomParticipantDto[];
  screenStream: MediaStream | null;
  layoutMode: MeetingLayoutMode;
  onRetry: () => void;
}) {
  const connectionState = useConnectionState();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const hasTracks = tracks.length > 0;

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!screenVideoRef.current) return;
    screenVideoRef.current.srcObject = screenStream;
  }, [screenStream]);

  if (hasTracks) {
    return (
      <div className="h-full w-full p-3 sm:p-4">
        <div className={`grid h-full gap-3 ${tracks.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          <TrackLoop tracks={tracks}>
            <ParticipantTile className="overflow-hidden rounded-2xl bg-[#202124] [&_.lk-participant-name]:text-white" />
          </TrackLoop>
        </div>
        <ConnectionBadge state={connectionState} />
      </div>
    );
  }

  const localTile = (
    <MeetingPreviewTile
      name={fallbackName}
      stream={localStream}
      videoRef={localVideoRef}
      cameraEnabled={cameraEnabled}
      muted={false}
      featured
    />
  );
  const participantTiles = participants.filter((participant) => participant.displayName !== fallbackName).slice(0, 24);
  const effectiveLayout: Exclude<MeetingLayoutMode, "auto"> = layoutMode === "auto" ? (screenStream ? "sidebar" : participantTiles.length > 5 ? "grid" : "spotlight") : layoutMode;

  if (screenStream && effectiveLayout === "sidebar") {
    return (
      <div className="grid h-full min-h-0 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative min-h-0 overflow-hidden rounded-[24px] border border-white/10 bg-black">
          <video ref={screenVideoRef} className="h-full w-full object-contain" autoPlay muted playsInline />
          <div className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            You are presenting
          </div>
        </div>
        <div className="grid min-h-0 gap-3 overflow-hidden">
          {localTile}
          {participantTiles.slice(0, 3).map((participant) => <ParticipantGridTile key={participant.id} participant={participant} />)}
        </div>
        <ConnectionBadge state={connectionState} />
      </div>
    );
  }

  if (screenStream) {
    return (
      <div className="relative h-full w-full overflow-hidden p-3">
        <div className="h-full overflow-hidden rounded-[24px] border border-white/10 bg-black">
          <video ref={screenVideoRef} className="h-full w-full object-contain" autoPlay muted playsInline />
        </div>
        <ConnectionBadge state={connectionState} />
      </div>
    );
  }

  if (cameraEnabled && localStream?.getVideoTracks().length && effectiveLayout === "spotlight") {
    return (
      <div className="grid h-full min-h-0 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_240px]">
        {localTile}
        <div className="grid min-h-0 gap-3 overflow-hidden">
          {participantTiles.slice(0, 3).map((participant) => <ParticipantGridTile key={participant.id} participant={participant} />)}
        </div>
        <ConnectionBadge state={connectionState} />
        <LocalMediaError error={localMediaError} />
      </div>
    );
  }

  if (effectiveLayout === "grid" || effectiveLayout === "sidebar") {
    return (
      <div className="relative h-full min-h-0 p-3">
        <div className={`grid h-full min-h-0 gap-3 ${gridClassName(participantTiles.length + 1)}`}>
          {localTile}
          {participantTiles.map((participant) => <ParticipantGridTile key={participant.id} participant={participant} />)}
        </div>
        <ConnectionBadge state={connectionState} />
        <LocalMediaError error={localMediaError} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-20">
      <div className="grid h-24 w-24 place-items-center rounded-full bg-[#3c4043] text-4xl font-semibold text-white shadow-lg">
        {initials(fallbackName)}
      </div>
      <p className="mt-4 max-w-xl truncate text-center text-lg font-medium text-white">{fallbackName}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-white/55">
        {isJoining && <Loader2 className="h-4 w-4 animate-spin" />}
        {localMediaError || error || liveKitStateLabel(connectionState)}
      </p>
      {error && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
        >
          Retry meeting connection
        </button>
      )}
    </div>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  return (
    <div className="absolute right-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
      {liveKitStateLabel(state)}
    </div>
  );
}

function liveKitStateLabel(state: ConnectionState) {
  if (state === ConnectionState.Connected) return "Meeting connected";
  if (state === ConnectionState.Connecting) return "Connecting to LiveKit";
  if (state === ConnectionState.Reconnecting) return "Reconnecting";
  return "Waiting for LiveKit";
}

function gridClassName(count: number) {
  if (count <= 1) return "grid-cols-1";
  if (count <= 4) return "grid-cols-2";
  if (count <= 9) return "grid-cols-3";
  if (count <= 16) return "grid-cols-4";
  return "grid-cols-5";
}

function MeetingPreviewTile({
  name,
  stream,
  videoRef,
  cameraEnabled,
  muted,
  featured,
}: {
  name: string;
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraEnabled: boolean;
  muted: boolean;
  featured?: boolean;
}) {
  const hasVideo = cameraEnabled && Boolean(stream?.getVideoTracks().length);

  return (
    <div className="relative min-h-0 overflow-hidden rounded-[24px] border border-white/10 bg-[#24272a]">
      {hasVideo ? (
        <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
      ) : (
        <div className="grid h-full min-h-[160px] place-items-center">
          <div className={`${featured ? "h-28 w-28 text-5xl" : "h-16 w-16 text-2xl"} grid place-items-center rounded-full bg-[#1b5fa7] font-semibold text-white`}>
            {initials(name) || "H"}
          </div>
        </div>
      )}
      <TileLabel name={name} muted={muted} />
    </div>
  );
}

function ParticipantGridTile({ participant }: { participant: TranslationRoomParticipantDto }) {
  const muted = participant.isTranslationAudioEnabled === false;
  return (
    <div className="relative min-h-[128px] overflow-hidden rounded-[24px] border border-white/10 bg-[#303336]">
      <div className="grid h-full place-items-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-[#3c4043] text-2xl font-semibold text-white">
          {initials(participant.displayName)}
        </div>
      </div>
      <TileLabel name={participant.displayName} muted={muted} />
    </div>
  );
}

function TileLabel({ name, muted }: { name: string; muted: boolean }) {
  return (
    <>
      <div className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
        {name}
      </div>
      <div className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
        {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      </div>
    </>
  );
}

function LocalMediaError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm text-red-100 backdrop-blur">
      {error}
    </div>
  );
}

function LiveKitTrackControls({
  enabled,
  cameraEnabled,
  microphoneEnabled,
  onToggleCamera,
  onToggleMicrophone,
}: {
  enabled: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
}) {
  if (!enabled) {
    return (
      <>
        <MeetControl
          label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
          active={microphoneEnabled}
          icon={microphoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          onClick={onToggleMicrophone}
        />
        <MeetControl
          label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          active={cameraEnabled}
          icon={cameraEnabled ? <VideoIcon /> : <VideoOffIcon />}
          onClick={onToggleCamera}
        />
      </>
    );
  }

  return (
    <>
      <TrackToggle
        source={Track.Source.Microphone}
        className="grid h-11 w-11 place-items-center rounded-full bg-[#3c4043] text-white hover:bg-[#4a4d51] data-[lk-enabled=true]:bg-[#8ab4f8] data-[lk-enabled=true]:text-[#202124]"
      />
      <TrackToggle
        source={Track.Source.Camera}
        className="grid h-11 w-11 place-items-center rounded-full bg-[#3c4043] text-white hover:bg-[#4a4d51] data-[lk-enabled=true]:bg-[#8ab4f8] data-[lk-enabled=true]:text-[#202124]"
      />
    </>
  );
}

function VideoIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.75A2.75 2.75 0 0 1 6.75 5h7.5A2.75 2.75 0 0 1 17 7.75v.85l2.45-1.63A1 1 0 0 1 21 7.8v8.4a1 1 0 0 1-1.55.83L17 15.4v.85A2.75 2.75 0 0 1 14.25 19h-7.5A2.75 2.75 0 0 1 4 16.25v-8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function VideoOffIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.75A2.75 2.75 0 0 1 6.75 5h7.5A2.75 2.75 0 0 1 17 7.75v.85l2.45-1.63A1 1 0 0 1 21 7.8v8.4a1 1 0 0 1-1.55.83L17 15.4v.85A2.75 2.75 0 0 1 14.25 19h-7.5A2.75 2.75 0 0 1 4 16.25v-8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MeetControl({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`grid h-11 w-11 place-items-center rounded-full ${
        disabled
          ? "cursor-not-allowed bg-[#3c4043] text-white/35"
          :
        active ? "bg-[#8ab4f8] text-[#202124]" : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"
      }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function ParticipantPill({ participant }: { participant: TranslationRoomParticipantDto }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/35 py-1 pl-1 pr-3 text-sm text-white backdrop-blur">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#3c4043] text-xs font-bold">{initials(participant.displayName)}</span>
      <span className="max-w-[140px] truncate">{participant.displayName}</span>
    </div>
  );
}

function mergeParticipants(apiParticipants: TranslationRoomParticipantDto[], liveParticipants: ParticipantInfoDto[]): TranslationRoomParticipantDto[] {
  const mappedLive = liveParticipants.map((participant) => ({
    id: participant.userId,
    translationRoomId: "",
    userId: participant.userId,
    displayName: participant.displayName,
    role: participant.role ?? "participant",
    listenLanguage: participant.listenLanguage,
    speakLanguage: participant.speakLanguage,
    status: participant.status === "connected" ? "connected" : participant.status ?? "connected",
    isTranslationAudioEnabled: !participant.isMuted,
    isUsingVoiceClone: participant.isUsingVoiceClone,
    avatarUrl: participant.avatarUrl,
    joinedAt: participant.joinedAt,
  })) satisfies TranslationRoomParticipantDto[];

  const byUserId = new Map(apiParticipants.map((participant) => [participant.userId, participant]));
  for (const participant of mappedLive) {
    byUserId.set(participant.userId, {
      ...byUserId.get(participant.userId),
      ...participant,
    });
  }
  return Array.from(byUserId.values());
}

function dedupeSegments(segments: TranscriptSegmentDto[]) {
  const map = new Map<string, TranscriptSegmentDto>();
  for (const segment of segments) {
    map.set(segment.segmentId, segment);
  }
  return Array.from(map.values()).sort((a, b) => a.startTimeMs - b.startTimeMs);
}

function getPreviewLiveRoom(id: string): TranslationRoomDto {
  const now = new Date();
  return {
    id,
    workspaceId: "workspace-preview",
    hostId: "host-preview",
    title: id.includes("partner") ? "Partner Sync Room" : "Investor Q&A Translation",
    description: "Preview meeting surface for live translation, captions, and AI notes.",
    translationRoomCode: id.includes("partner") ? "SYNC-882" : "WARP-241",
    status: "in_progress",
    translationRoomType: "scheduled",
    maxParticipants: 24,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN", "ja-JP"],
    scheduledAt: now.toISOString(),
    startedAt: now.toISOString(),
    createdAt: now.toISOString(),
    settings: { requiresApproval: true },
    participantCount: 4,
    isHost: true,
  };
}

function getPreviewLiveParticipants(roomId: string): TranslationRoomParticipantDto[] {
  const now = new Date().toISOString();
  return [
    {
      id: `${roomId}-host`,
      translationRoomId: roomId,
      userId: "host-preview",
      displayName: "Host",
      role: "host",
      listenLanguage: "vi-VN",
      speakLanguage: "en-US",
      status: "connected",
      isTranslationAudioEnabled: true,
      joinedAt: now,
    },
    {
      id: `${roomId}-investor`,
      translationRoomId: roomId,
      userId: "participant-investor",
      displayName: "Mika Tanaka",
      role: "participant",
      listenLanguage: "ja-JP",
      speakLanguage: "en-US",
      status: "connected",
      isTranslationAudioEnabled: true,
      joinedAt: now,
    },
    {
      id: `${roomId}-ops`,
      translationRoomId: roomId,
      userId: "participant-ops",
      displayName: "Nguyen Linh",
      role: "participant",
      listenLanguage: "vi-VN",
      speakLanguage: "vi-VN",
      status: "connected",
      isTranslationAudioEnabled: true,
      joinedAt: now,
    },
    {
      id: `${roomId}-interpreter`,
      translationRoomId: roomId,
      userId: "interpreter-preview",
      displayName: "Interpreter Bot",
      role: "interpreter",
      listenLanguage: "en-US",
      speakLanguage: "ja-JP",
      status: "connected",
      isTranslationAudioEnabled: true,
      joinedAt: now,
    },
  ];
}

function getPreviewTranscriptSegment() {
  return getPreviewTranscriptSegments().at(-1);
}

function getPreviewTranscriptSegments(): TranscriptSegmentDto[] {
  return [
    {
      segmentId: "preview-segment-1",
      speakerId: "host-preview",
      speakerName: "Host",
      originalText: "Let us start with the rollout risks and align on the terminology cleanup plan.",
      originalLanguage: "en-US",
      translatedText: "Chúng ta bắt đầu với các rủi ro triển khai và thống nhất kế hoạch làm sạch thuật ngữ.",
      targetLanguage: "vi-VN",
      confidence: 0.93,
      startTimeMs: 1000,
      endTimeMs: 5400,
    },
    {
      segmentId: "preview-segment-2",
      speakerId: "participant-investor",
      speakerName: "Mika Tanaka",
      originalText: "The Japanese team needs the glossary before the next review session.",
      originalLanguage: "en-US",
      translatedText: "チームは次回のレビュー前に用語集が必要です。",
      targetLanguage: "ja-JP",
      confidence: 0.9,
      startTimeMs: 6200,
      endTimeMs: 10400,
    },
    {
      segmentId: "preview-segment-3",
      speakerId: "participant-ops",
      speakerName: "Nguyen Linh",
      originalText: "We will attach the product terms and meeting notes after this call.",
      originalLanguage: "en-US",
      translatedText: "Chúng tôi sẽ đính kèm thuật ngữ sản phẩm và ghi chú cuộc họp sau cuộc gọi này.",
      targetLanguage: "vi-VN",
      confidence: 0.95,
      startTimeMs: 11200,
      endTimeMs: 15800,
    },
  ];
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function ParticipantRow({
  participant,
  isHost,
  roomId,
  isRoomHost,
}: {
  participant: TranslationRoomParticipantDto;
  isHost: boolean;
  roomId: string;
  isRoomHost: boolean;
}) {
  const updateAudio = useUpdateParticipantAudio(roomId);
  const admit = useAdmitParticipant(roomId);
  const kick = useKickParticipant(roomId);
  const canManage = isHost && !isRoomHost;
  const audioEnabled = participant.isTranslationAudioEnabled ?? true;

  async function runAction(action: "audio" | "admit" | "kick") {
    try {
      if (action === "audio") {
        await updateAudio.mutateAsync({
          participantId: participant.id,
          isTranslationAudioEnabled: !audioEnabled,
        });
        toast.success("Participant audio route updated.");
      }
      if (action === "admit") {
        await admit.mutateAsync(participant.id);
        toast.success("Participant admitted.");
      }
      if (action === "kick") {
        await kick.mutateAsync(participant.id);
        toast.success("Participant removed.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update participant.");
    }
  }

  return (
    <div className="rounded-2xl p-3 hover:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f0fe] text-sm font-bold text-[#174ea6]">
          {initials(participant.displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950">{participant.displayName}</p>
          <p className="mt-0.5 text-xs capitalize text-slate-500">
            {participant.role.toString().toLowerCase()} · {participant.status.replace("_", " ")}
          </p>
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600">
          {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </span>
      </div>

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
          {participant.status === "waiting" && (
            <Button size="sm" variant="outline" onClick={() => runAction("admit")}>
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              Admit
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => runAction("audio")}>
            {audioEnabled ? <MicOff className="mr-1.5 h-3.5 w-3.5" /> : <Mic className="mr-1.5 h-3.5 w-3.5" />}
            {audioEnabled ? "Mute route" : "Unmute route"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runAction("kick")}>
            <UserMinus className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

function StatePanel({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto grid min-h-[520px] w-full max-w-3xl place-items-center">
      <div className="rounded-2xl border border-[#dbe7f4] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#e4eef9] text-[#003476]">
          {icon ?? <Clock className="h-7 w-7" />}
        </div>
        <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
}
