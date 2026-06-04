"use client";

import type { ReactNode } from "react";
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
  Mic,
  MicOff,
  MoreVertical,
  PhoneOff,
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
  const [isParticipantPanelOpen, setIsParticipantPanelOpen] = useState(false);
  const [meetingSession, setMeetingSession] = useState<JoinMeetingResponseDto | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);

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

  if (roomQuery.isLoading && !isPreviewRoom) {
    return <StatePanel title="Loading room..." description="Fetching room details from the TranslationRoom service." />;
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
        <main className="grid h-full min-h-0 grid-rows-[64px_minmax(0,1fr)_72px] gap-3">
          <MeetingTopBar
            room={room}
            isHost={isHost}
            activeCount={activeCount}
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            onCopyText={copyText}
            joinLink={joinLink}
          />

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
                onRetry={retryMeetingConnection}
              />
              <RoomAudioRenderer />

              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-5 pb-5 pt-24">
                <CaptionWindow latestSegment={latestSegment ?? getPreviewTranscriptSegment()} />
              </div>
            </div>

            <MeetingSidePanel
              roomId={roomId}
              room={room}
              isHost={isHost}
              participants={participants}
              participantsLoading={participantsQuery.isLoading && !isPreviewRoom}
              participantsError={participantsQuery.isError && !isPreviewRoom}
              activeCount={activeCount}
              segments={liveSegments.length ? liveSegments : getPreviewTranscriptSegments()}
            />
          </section>

          <MeetingControlBar
            isHost={isHost}
            activeCount={activeCount}
            meetingEnabled={Boolean(meetingSession?.token)}
            roomCode={room.translationRoomCode}
            joinLink={joinLink}
            onCopyText={copyText}
            onExit={handleExit}
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
  participants,
  participantsLoading,
  participantsError,
  activeCount,
  segments,
}: {
  roomId: string;
  room: TranslationRoomDto;
  isHost: boolean;
  participants: TranslationRoomParticipantDto[];
  participantsLoading: boolean;
  participantsError: boolean;
  activeCount: number;
  segments: TranscriptSegmentDto[];
}) {
  return (
    <aside className="hidden min-h-0 grid-rows-[1fr_220px] gap-3 xl:grid">
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] border border-white/10 bg-[#f7f7f7] text-neutral-950 shadow-2xl">
        <div className="border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Live transcript</h2>
              <p className="text-xs text-neutral-500">Original and translated captions</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-neutral-950 text-white">
              <Captions className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto p-3">
          {segments.map((segment) => (
            <TranscriptBubble key={segment.segmentId} segment={segment} />
          ))}
        </div>
      </section>

      <section className="grid min-h-0 grid-cols-2 gap-3">
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
      </section>
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

function MeetingControlBar({
  isHost,
  roomCode,
  joinLink,
  activeCount,
  meetingEnabled,
  onCopyText,
  onExit,
  onToggleParticipants,
}: {
  isHost: boolean;
  roomCode: string;
  joinLink: string;
  activeCount: number;
  meetingEnabled: boolean;
  onCopyText: (value: string, label: string) => void;
  onExit: () => void;
  onToggleParticipants: () => void;
}) {
  return (
    <footer className="grid min-h-0 grid-cols-[1fr_auto_1fr] items-center rounded-[28px] border border-white/10 bg-[#1b1b1b] px-4 shadow-xl">
      <div className="hidden items-center gap-2 text-xs text-white/50 md:flex">
        <Clock className="h-4 w-4" />
        00:24:16
      </div>

      <div className="flex items-center justify-center gap-2">
        <MeetControl label="Copy invite" icon={<Link2 className="h-5 w-5" />} onClick={() => onCopyText(joinLink, "Invite link")} />
        <MeetControl label="Copy code" icon={<Copy className="h-5 w-5" />} onClick={() => onCopyText(roomCode, "Room code")} />
        <MeetControl label="Captions" active icon={<Captions className="h-5 w-5" />} onClick={() => undefined} />
        <LiveKitTrackControls enabled={meetingEnabled} />
        <MeetControl label="Share screen" icon={<ScreenShare className="h-5 w-5" />} onClick={() => undefined} />
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggleParticipants}
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

function CaptionWindow({ latestSegment }: { latestSegment?: TranscriptSegmentDto }) {
  if (!latestSegment) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl bg-black/45 px-5 py-4 text-center backdrop-blur">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-white/70">
          <Radio className="h-4 w-4" />
          Transcript will appear here when real audio is received.
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

function LiveKitMeetingStage({
  fallbackName,
  isJoining,
  error,
  onRetry,
}: {
  fallbackName: string;
  isJoining: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const connectionState = useConnectionState();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const hasTracks = tracks.length > 0;

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

  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-20">
      <div className="grid h-24 w-24 place-items-center rounded-full bg-[#3c4043] text-4xl font-semibold text-white shadow-lg">
        {initials(fallbackName)}
      </div>
      <p className="mt-4 max-w-xl truncate text-center text-lg font-medium text-white">{fallbackName}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-white/55">
        {isJoining && <Loader2 className="h-4 w-4 animate-spin" />}
        {error || liveKitStateLabel(connectionState)}
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

function LiveKitTrackControls({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return (
      <>
        <MeetControl label="Microphone" disabled icon={<Mic className="h-5 w-5" />} onClick={() => undefined} />
        <MeetControl label="Camera" disabled icon={<VideoIcon />} onClick={() => undefined} />
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
