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
  WarningCircle,
  ClosedCaptioning,
  Copy,
  SpinnerGap,
  Microphone,
  MicrophoneSlash,
  Play,
  Broadcast,
  Screencast,
  UserCheck,
  UserMinus,
  Layout,
  VideoCamera,
  VideoCameraSlash,
  CheckCircle,
  Stop,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
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
      if (isPreviewRoom) {
        toast.success("Preview room ended.");
        router.push("/rooms");
        return;
      }
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

  function handleStartWarptalk() {
    setWarptalkStarted(true);
    toast.success("WarpTalk realtime translation started.");
  }

  function handleStopWarptalk() {
    setWarptalkStarted(false);
    toast.success("WarpTalk realtime translation stopped.");
  }

  if (roomQuery.isLoading && !isPreviewRoom) {
    return <StatePanel title="Loading room..." description="Fetching room details from the TranslationRoom service." />;
  }

  if ((roomQuery.isError && !isPreviewRoom) || !room) {
    return (
      <StatePanel
        icon={<WarningCircle className="h-8 w-8" />}
        title="Room unavailable"
        description="The room does not exist or your account cannot access it."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-ink font-sans selection:bg-surface-3">
      <LiveKitRoom
        video={cameraEnabled}
        audio={microphoneEnabled}
        token={meetingSession?.token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        connect={Boolean(meetingSession?.token)}
        data-lk-theme="default"
        className="flex min-h-0 flex-1 flex-col !bg-transparent !text-ink [&_.lk-participant-placeholder]:!bg-surface-2 [&_.lk-participant-placeholder_svg]:!text-ink-muted [&_.lk-participant-tile]:!bg-surface-1"
      >
        <MeetingTopBar 
          room={room} 
          isHost={isHost} 
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          onExit={handleExit}
          warptalkStarted={warptalkStarted}
          onStartWarptalk={handleStartWarptalk}
          onStopWarptalk={handleStopWarptalk}
        />

        <main className="flex min-h-0 flex-1 gap-4 p-4 pt-0">
          <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-sm">
            <div className="relative flex-1 min-h-0 w-full">
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

              {/* Floating Control Bar */}
              <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 transition-opacity hover:opacity-100">
                <MeetingControlBar
                  room={room}
                  roomCode={room.translationRoomCode}
                  meetingEnabled={Boolean(meetingSession?.token)}
                  cameraEnabled={cameraEnabled}
                  microphoneEnabled={microphoneEnabled}
                  isScreenSharing={Boolean(screenStream)}
                  layoutMode={meetingLayout}
                  onCopyText={copyText}
                  onToggleCamera={() => setCameraEnabled((current) => !current)}
                  onToggleMicrophone={() => setMicrophoneEnabled((current) => !current)}
                  onToggleScreenShare={handleToggleScreenShare}
                  onLayoutChange={setMeetingLayout}
                />
              </div>
            </div>
          </section>

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
            onCopyText={copyText}
            joinLink={joinLink}
          />
        </main>
      </LiveKitRoom>
    </div>
  );
}

function MeetingTopBar({
  room,
  isHost,
  sourceLanguage,
  targetLanguage,
  onExit,
  warptalkStarted,
  onStartWarptalk,
  onStopWarptalk,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  onExit: () => void;
  warptalkStarted: boolean;
  onStartWarptalk: () => void;
  onStopWarptalk: () => void;
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Broadcast className="h-4 w-4 text-ink-subtle" />
          <span className="max-w-[200px] truncate">{room.title}</span>
          <span className="text-ink-tertiary">/</span>
          <span className="text-ink-subtle">{getLanguageName(sourceLanguage)} to {getLanguageName(targetLanguage)}</span>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${warptalkStarted ? "bg-red-50 text-red-600" : "bg-surface-2 text-ink-subtle"}`}>
          <div className={`h-1.5 w-1.5 rounded-full ${warptalkStarted ? "bg-destructive" : "bg-slate-400"}`} />
          {warptalkStarted ? "Live Translation" : "Translation Ready"}
        </div>
        {isHost ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-subtle border border-border">Host</span> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isHost && (
          <button
            type="button"
            onClick={warptalkStarted ? onStopWarptalk : onStartWarptalk}
            className={`flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors shadow-sm ${
              warptalkStarted
                ? "bg-surface-3 text-ink hover:bg-surface-4"
                : "bg-primary text-white hover:bg-primary-hover"
            }`}
          >
            {warptalkStarted ? <Stop className="h-3.5 w-3.5" weight="fill" /> : <Play className="h-3.5 w-3.5" weight="fill" />}
            {warptalkStarted ? "Stop Translation" : "Start WarpTalk"}
          </button>
        )}
        <div className="h-4 w-[1px] bg-surface-3 mx-1" />
        <button
          type="button"
          onClick={onExit}
          className="flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          {isHost ? "End Meeting" : "Leave"}
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
  onCopyText,
  joinLink,
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
  onCopyText: (value: string, label: string) => void;
  joinLink: string;
}) {
  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden xl:flex hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-1 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-4 px-4 pt-3 pb-2 shrink-0 border-b border-border">
          <TabButton active={mode === "transcript"} label="Transcript" onClick={() => onModeChange("transcript")} />
          <TabButton active={mode === "chat"} label="Chat" onClick={() => onModeChange("chat")} />
          <TabButton active={mode === "notes"} label="Notes" onClick={() => onModeChange("notes")} />
          <TabButton active={mode === "people"} label="People" badge={activeCount} onClick={() => onModeChange("people")} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
          {mode === "transcript" ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {segments.length ? segments.map((segment) => <TranscriptBubble key={segment.segmentId} segment={segment} />) : <EmptyPanel text="Start WarpTalk to see live translation here." />}
            </div>
          ) : null}
          {mode === "chat" ? <MeetingChat /> : null}
          {mode === "notes" ? (
            <div className="flex-1 overflow-y-auto p-4">
              <AiNotesPanel />
            </div>
          ) : null}
          {mode === "people" ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas p-3">
                <p className="text-[12px] font-medium text-ink-subtle">Room Code</p>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold tracking-wide text-ink">{room.translationRoomCode}</span>
                  <button onClick={() => onCopyText(joinLink, "Invite link")} className="text-[12px] font-medium text-primary hover:text-primary-hover">Copy Link</button>
                </div>
              </div>
              <PeoplePanel
                roomId={roomId}
                room={room}
                isHost={isHost}
                participants={participants}
                participantsLoading={participantsLoading}
                participantsError={participantsError}
                activeCount={activeCount}
              />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function TabButton({ active, label, badge, onClick }: { active: boolean; label: string; badge?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 pb-2.5 text-[13px] font-medium outline-none transition-colors ${
        active ? "text-ink" : "text-ink-subtle hover:text-ink"
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-2 px-1 text-[10px] font-semibold text-ink-muted">
          {badge}
        </span>
      )}
      {active && <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-ink" />}
    </button>
  );
}

function TranscriptBubble({ segment }: { segment: TranscriptSegmentDto }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink">{segment.speakerName || "Speaker"}</span>
        <span className="text-[11px] text-ink-subtle">
          {getLanguageName(segment.originalLanguage)}
          {segment.targetLanguage ? ` -> ${getLanguageName(segment.targetLanguage)}` : ""}
        </span>
      </div>
      <div className="rounded-lg border border-border bg-surface-1 p-3 shadow-sm">
        <p className="text-[13px] leading-relaxed text-ink-muted">{segment.originalText}</p>
        {segment.translatedText ? <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink">{segment.translatedText}</p> : null}
      </div>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <ClosedCaptioning className="h-8 w-8 text-ink-tertiary" weight="light" />
      <p className="text-[13px] text-ink-subtle max-w-[200px]">{text}</p>
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
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={`${message.from}-${message.body}`} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] shadow-sm ${message.mine ? "bg-ink text-white" : "border border-border bg-surface-1 text-ink"}`}>
              <p className={`mb-0.5 text-[11px] font-medium ${message.mine ? "text-ink-tertiary" : "text-ink-subtle"}`}>{message.from}</p>
              <p className="leading-relaxed">{message.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 bg-transparent">
        <form
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface-1 px-3 transition-colors focus-within:border-hairline-strong focus-within:shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <input
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
            placeholder="Write a message..."
          />
        </form>
      </div>
    </div>
  );
}

function AiNotesPanel() {
  return (
    <ul className="space-y-3">
      <li className="flex gap-3 items-start">
        <CheckCircle className="h-4 w-4 text-ink-subtle mt-0.5 shrink-0" />
        <span className="text-[13px] leading-relaxed text-ink">Confirm investor rollout risks.</span>
      </li>
      <li className="flex gap-3 items-start">
        <CheckCircle className="h-4 w-4 text-ink-subtle mt-0.5 shrink-0" />
        <span className="text-[13px] leading-relaxed text-ink">Follow up terminology cleanup.</span>
      </li>
      <li className="flex gap-3 items-start">
        <CheckCircle className="h-4 w-4 text-ink-subtle mt-0.5 shrink-0" />
        <span className="text-[13px] leading-relaxed text-ink">Export transcript after meeting ends.</span>
      </li>
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
    <div className="space-y-1">
      {participantsLoading ? <p className="text-[13px] text-ink-subtle">Loading participants...</p> : null}
      {participantsError ? <p className="text-[13px] text-red-600">Could not load participant controls.</p> : null}
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
  );
}

function MeetingControlBar({
  meetingEnabled,
  cameraEnabled,
  microphoneEnabled,
  isScreenSharing,
  layoutMode,
  onCopyText,
  roomCode,
  onToggleCamera,
  onToggleMicrophone,
  onToggleScreenShare,
  onLayoutChange,
}: {
  room: TranslationRoomDto;
  meetingEnabled: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  isScreenSharing: boolean;
  layoutMode: MeetingLayoutMode;
  roomCode: string;
  onCopyText: (value: string, label: string) => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onToggleScreenShare: () => void;
  onLayoutChange: (layout: MeetingLayoutMode) => void;
}) {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);

  return (
    <div className="flex h-12 items-center gap-1.5 rounded-full border border-border/50 bg-surface-1/80 px-2 shadow-sm backdrop-blur-xl">
      <LiveKitTrackControls
        enabled={meetingEnabled}
        cameraEnabled={cameraEnabled}
        microphoneEnabled={microphoneEnabled}
        onToggleCamera={onToggleCamera}
        onToggleMicrophone={onToggleMicrophone}
      />
      
      <div className="h-6 w-[1px] bg-surface-3 mx-1" />

      <MeetControl
        label={isScreenSharing ? "Stop presenting" : "Present now"}
        active={isScreenSharing}
        icon={<Screencast className="h-[18px] w-[18px]" />}
        onClick={onToggleScreenShare}
      />
      
      <div className="h-6 w-[1px] bg-surface-3 mx-1" />
      
      <MeetControl 
        label="Copy room code" 
        icon={<Copy className="h-[18px] w-[18px]" />} 
        onClick={() => onCopyText(roomCode, "Room code")} 
      />

      <div className="relative">
        <MeetControl
          label="Layout options"
          icon={<Layout className="h-[18px] w-[18px]" />}
          onClick={() => setIsLayoutMenuOpen((current) => !current)}
        />
        {isLayoutMenuOpen ? (
          <div className="absolute bottom-14 right-0 z-50 w-44 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-lg">
            <LayoutOption label="Auto" value="auto" active={layoutMode === "auto"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
            <LayoutOption label="Grid" value="grid" active={layoutMode === "grid"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
            <LayoutOption label="Spotlight" value="spotlight" active={layoutMode === "spotlight"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
            <LayoutOption label="Sidebar" value="sidebar" active={layoutMode === "sidebar"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
          </div>
        ) : null}
      </div>
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
      className={`flex w-full items-center justify-between px-3 py-2 text-[13px] transition-colors ${active ? "bg-canvas text-ink font-medium" : "bg-surface-1 text-ink-muted hover:bg-canvas"}`}
    >
      {label}
      {active ? <CheckCircle className="h-3.5 w-3.5 text-ink" weight="fill" /> : null}
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
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const hasTracks = connectionState === ConnectionState.Connected && tracks.length > 0;

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
      <div className="relative h-full w-full p-2 bg-surface-1">
        <div className={`grid h-full gap-3 ${tracks.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          <TrackLoop tracks={tracks}>
            <ParticipantTile className="overflow-hidden rounded-xl !bg-surface-3 [&_.lk-participant-name]:text-ink [&_.lk-participant-name]:!bg-surface-1/80 [&_.lk-participant-name]:backdrop-blur" />
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
      <div className="grid h-full min-h-0 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_260px] bg-surface-1">
        <div className="relative min-h-0 overflow-hidden rounded-xl border border-border bg-surface-1">
          <video ref={screenVideoRef} className="h-full w-full object-contain" autoPlay muted playsInline />
          <div className="absolute left-4 top-4 rounded-md bg-surface-1/90 px-2 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur">
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
      <div className="relative h-full w-full overflow-hidden p-2 bg-surface-1">
        <div className="h-full overflow-hidden rounded-xl border border-border bg-surface-1">
          <video ref={screenVideoRef} className="h-full w-full object-contain" autoPlay muted playsInline />
        </div>
        <ConnectionBadge state={connectionState} />
      </div>
    );
  }

  if (effectiveLayout === "spotlight") {
    return (
      <div className="grid h-full min-h-0 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_240px] bg-surface-1">
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
      <div className="relative h-full min-h-0 p-2 bg-surface-1">
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
    <div className="flex w-full flex-col items-center justify-center px-6 py-20 bg-surface-2">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-3 text-2xl font-medium text-ink-muted shadow-sm">
        {initials(fallbackName)}
      </div>
      <p className="mt-4 max-w-xl truncate text-center text-[15px] font-medium text-ink">{fallbackName}</p>
      <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-subtle">
        {isJoining && <SpinnerGap className="h-3.5 w-3.5 animate-spin" />}
        {localMediaError || error || liveKitStateLabel(connectionState)}
      </p>
      {error && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-canvas shadow-sm"
        >
          Retry connection
        </button>
      )}
    </div>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  return (
    <div className="absolute right-4 top-4 rounded-md bg-surface-1/90 px-2 py-1 text-[11px] font-semibold text-ink-muted shadow-sm backdrop-blur">
      {liveKitStateLabel(state)}
    </div>
  );
}

function liveKitStateLabel(state: ConnectionState) {
  if (state === ConnectionState.Connected) return "Connected";
  if (state === ConnectionState.Connecting) return "Connecting";
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
    <div className="relative min-h-0 overflow-hidden rounded-xl border border-border bg-surface-3">
      {hasVideo ? (
        <video ref={videoRef} className="h-full w-full object-cover -scale-x-100" autoPlay muted playsInline />
      ) : (
        <div className="grid h-full min-h-[160px] place-items-center">
          <div className={`${featured ? "h-24 w-24 text-3xl" : "h-14 w-14 text-xl"} grid place-items-center rounded-full bg-slate-300 font-medium text-ink shadow-sm`}>
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
    <div className="relative min-h-[128px] overflow-hidden rounded-xl border border-border bg-surface-3">
      <div className="grid h-full place-items-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-300 text-xl font-medium text-ink shadow-sm">
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
      <div className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-md bg-surface-1/90 px-2 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur">
        {name}
      </div>
      <div className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-md bg-surface-1/90 text-ink shadow-sm backdrop-blur">
        {muted ? <MicrophoneSlash className="h-3.5 w-3.5" /> : <Microphone className="h-3.5 w-3.5" />}
      </div>
    </>
  );
}

function LocalMediaError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="absolute bottom-5 left-5 right-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 shadow-sm backdrop-blur">
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
          active={!microphoneEnabled}
          icon={microphoneEnabled ? <Microphone className="h-[18px] w-[18px]" /> : <MicrophoneSlash className="h-[18px] w-[18px]" />}
          onClick={onToggleMicrophone}
        />
        <MeetControl
          label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          active={!cameraEnabled}
          icon={cameraEnabled ? <VideoCamera className="h-[18px] w-[18px]" /> : <VideoCameraSlash className="h-[18px] w-[18px]" />}
          onClick={onToggleCamera}
        />
      </>
    );
  }

  return (
    <>
      <TrackToggle
        source={Track.Source.Microphone}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-2 data-[lk-enabled=false]:bg-red-50 data-[lk-enabled=false]:text-red-600"
      />
      <TrackToggle
        source={Track.Source.Camera}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-2 data-[lk-enabled=false]:bg-red-50 data-[lk-enabled=false]:text-red-600"
      />
    </>
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
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
        disabled
          ? "cursor-not-allowed bg-canvas text-ink-tertiary"
          : active
          ? "bg-surface-2 text-primary"
          : "bg-transparent text-ink-muted hover:bg-surface-2"
      }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}



function StatePanel({ title, description, icon }: { title: string; description: string; icon?: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-canvas text-ink">
      <div className="flex flex-col items-center gap-3 text-center">
        {icon || <SpinnerGap className="h-8 w-8 animate-spin text-ink-subtle" />}
        <h1 className="text-[15px] font-medium">{title}</h1>
        <p className="text-[13px] text-ink-subtle max-w-sm">{description}</p>
      </div>
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
    <div className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-canvas">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-primary/10 text-[10px] font-bold text-primary">
          {initials(participant.displayName)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{participant.displayName}</p>
          <p className="truncate text-[11px] text-ink-subtle capitalize">
            {participant.role.toString().toLowerCase()} · {participant.status.replace("_", " ")}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="grid h-6 w-6 place-items-center rounded-sm bg-canvas text-ink-subtle">
          {audioEnabled ? <Microphone className="h-3.5 w-3.5" /> : <MicrophoneSlash className="h-3.5 w-3.5" />}
        </span>
        {canManage && (
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            {participant.status === "waiting" && (
              <button onClick={() => runAction("admit")} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-surface-2 text-ink-muted" title="Admit">
                <UserCheck className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => runAction("audio")} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-surface-2 text-ink-muted" title="Toggle audio">
              {audioEnabled ? <MicrophoneSlash className="h-3.5 w-3.5" /> : <Microphone className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => runAction("kick")} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-red-50 text-red-600" title="Remove">
              <UserMinus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
