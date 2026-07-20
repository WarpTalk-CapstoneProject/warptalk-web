"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useJoinMeeting } from "@/hooks/use-meeting";
import {
  useStartTranslationRoom,
  useEndTranslationRoom,
  useLeaveTranslationRoom,
  useTranslationRoom,
  useTranslationRoomParticipants,
} from "@/hooks/use-translationRooms";
import { createHubConnection } from "@/lib/signalr";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { useUIStore } from "@/stores/ui-store";
import type { JoinMeetingResponseDto } from "@/types/meeting";
import type { ParticipantInfoDto, TranscriptSegmentDto, TranslationRoomStateDto, TranslationTextDto } from "@/types/realtime";
import type { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";

// Import Refactored Components
import { MeetingTopBar } from "@/components/rooms/live/meeting-top-bar";
import { MeetingControlBar, type MeetingLayoutMode } from "@/components/rooms/live/meeting-control-bar";
import { LiveKitMeetingStage } from "@/components/rooms/live/meeting-stage";
import { FilteredRoomAudio } from "@/components/rooms/live/filtered-room-audio";
import { MeetingSidePanel, type SidePanelMode } from "@/components/rooms/live/side-panel/meeting-side-panel";
import { WaitingRoomView, StatePanel } from "@/components/rooms/live/waiting-room-view";

function getJoinLink(code: string) {
  if (typeof window === "undefined") return code;
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

function isInstantRoom(room: TranslationRoomDto) {
  return ["instant", "group", "one_to_one", "webinar", "b2b_virtual_mic"].includes(room.translationRoomType);
}

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = params.id;
  const user = useAuthStore((state) => state.user);
  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const refetchParticipants = participantsQuery.refetch;
  const startRoom = useStartTranslationRoom();
  const endRoom = useEndTranslationRoom();
  const leaveRoom = useLeaveTranslationRoom(roomId);
  const { mutateAsync: joinMeetingAsync, isPending: isMeetingJoining } = useJoinMeeting();
  
  const autoStartedRef = useRef(false);
  const meetingJoinedRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  
  const [meetingSession, setMeetingSession] = useState<JoinMeetingResponseDto | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [warptalkStarted, setWarptalkStarted] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>("transcript");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localMediaError, setLocalMediaError] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [meetingLayout, setMeetingLayout] = useState<MeetingLayoutMode>("auto");

  // Read config from sessionStorage
  const savedDevices = typeof window !== 'undefined' ? JSON.parse(window.sessionStorage.getItem('warptalk.devices.preview') || '{}') : {};
  const savedJoinConfig = typeof window !== 'undefined' ? JSON.parse(window.sessionStorage.getItem('warptalk.join.preview') || '{}') : {};
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(savedDevices.cameraEnabled ?? savedJoinConfig.cameraEnabled ?? true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState<boolean>(savedDevices.microphoneEnabled ?? savedJoinConfig.microphoneEnabled ?? true);

  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const transcriptSegments = useTranslationRoomStore((state) => state.transcriptSegments);
  const setLiveState = useTranslationRoomStore((state) => state.setTranslationRoomState);
  const addLiveParticipant = useTranslationRoomStore((state) => state.addParticipant);
  const removeLiveParticipant = useTranslationRoomStore((state) => state.removeParticipant);
  const { rightSidebarOpen } = useUIStore();
  const addTranscriptSegment = useTranslationRoomStore((state) => state.addTranscriptSegment);
  const addOrMergeTranslationText = useTranslationRoomStore((state) => state.addOrMergeTranslationText);
  const resetLiveRoom = useTranslationRoomStore((state) => state.reset);
  const addChatMessage = useTranslationRoomStore((state) => state.addChatMessage);

  const isPreviewRoom = roomId.startsWith("preview-");
  const room = roomQuery.data ?? (isPreviewRoom ? getPreviewLiveRoom(roomId) : undefined);
  const refetchRoom = roomQuery.refetch;
  const apiParticipants = participantsQuery.data ?? (isPreviewRoom ? getPreviewLiveParticipants(roomId) : []);
  const role = useWorkspaceRole();
  const isHost = Boolean(room?.isHost || (user?.id && room?.hostId === user.id) || role === "admin" || role === "owner");
  const participants = liveParticipants.length ? mergeParticipants(apiParticipants, liveParticipants) : apiParticipants;
  const activeCount = participants.filter((participant) => !["left", "removed", "kicked"].includes(participant.status)).length;
  const joinLink = room?.translationRoomCode ? getJoinLink(room.translationRoomCode) : "";
  const liveSegments = useMemo(() => dedupeSegments(transcriptSegments), [transcriptSegments]);
  
  const canConnectMeeting =
    Boolean(room) &&
    room?.status !== "ended" &&
    room?.status !== "cancelled" &&
    room?.status !== "expired" &&
    room?.status !== "failed";
    
  const displayName = savedJoinConfig.displayName || user?.fullName || user?.email || "Participant";
  const sourceLanguage = savedJoinConfig.speakLanguage || room?.sourceLanguage || "vi";
  const targetLanguage = savedJoinConfig.listenLanguage || room?.targetLanguages?.[0] || "en";

  function retryMeetingConnection() {
    if (!room?.id || !canConnectMeeting) return;
    meetingJoinedRef.current = true;
    setMeetingSession(null);

    void joinMeetingAsync({ translationRoomId: room.id, displayName })
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
        // Removed autoStartedRef reset to prevent infinite loops if start fails
      },
    });
  }, [isHost, room, startRoom]);

  useEffect(() => {
    if (!room?.id || !canConnectMeeting || meetingJoinedRef.current) return;
    meetingJoinedRef.current = true;

    const translationRoomId = room.id;
    queueMicrotask(() => {
      void joinMeetingAsync({ translationRoomId, displayName })
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
    if (!roomId) return;
    resetLiveRoom();
    const connection = createHubConnection("/hubs/translation-room");

    connection.on("TranslationRoomStarted", (state: TranslationRoomStateDto) => setLiveState(state));
    connection.on("ParticipantJoined", (participant: ParticipantInfoDto) => {
      addLiveParticipant(participant);
      void refetchParticipants();
    });
    connection.on("ParticipantLeft", (userId: string) => {
      removeLiveParticipant(userId);
      void refetchParticipants();
    });
    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => addTranscriptSegment(segment));
    connection.on("TranslationTextReceived", (translation: TranslationTextDto) => addOrMergeTranslationText(translation));
    connection.on("TranslationRoomEnded", () => refetchRoom());

    // BR-159: Backend initiated disconnections
    connection.on("ForceDisconnected", (reason?: string) => {
      toast.error(reason || "This room has been forcibly closed or you were disconnected from another device.");
      router.push("/rooms");
    });
    
    connection.on("ParticipantKicked", () => {
      toast.error("You have been permanently removed from this room.");
      router.push("/rooms");
    });

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
  }, [addLiveParticipant, addOrMergeTranslationText, addTranscriptSegment, refetchParticipants, refetchRoom, removeLiveParticipant, resetLiveRoom, displayName, roomId, setLiveState, sourceLanguage, targetLanguage]);

  useEffect(() => {
    if (!roomId) return;
    const chatConnection = createHubConnection("/api/v1/meetings/chat-hub");
    chatConnection.on("ChatMessageHidden", (messageId: string) => {
      useTranslationRoomStore.getState().hideChatMessage(messageId);
    });

    chatConnection.on("ChatMessageReceived", (message: import("@/types/realtime").ChatMessageDto) => {
      addChatMessage(message);
    });

    chatConnection
      .start()
      .then(() => chatConnection.invoke("JoinMeetingRoom", roomId).catch(() => undefined))
      .catch(() => undefined);

    return () => {
      chatConnection.stop().catch(() => undefined);
    };
  }, [roomId, addChatMessage]);

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

  async function handleExit(action: "leave" | "end") {
    try {
      if (isPreviewRoom) {
        toast.success("Preview room ended.");
        router.push("/rooms");
        return;
      }
      if (action === "end") {
        if (room?.status !== "ended" && room?.status !== "cancelled") {
          await endRoom.mutateAsync(roomId);
        }
        toast.success("Room ended.");
      } else {
        if (room?.status !== "ended" && room?.status !== "cancelled") {
          await leaveRoom.mutateAsync();
        }
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
    if (!room?.id || isPreviewRoom) {
      setWarptalkStarted(true);
      toast.success("WarpTalk realtime translation started.");
      return;
    }
    startRoom.mutate(room.id, {
      onSuccess: () => {
        setWarptalkStarted(true);
        toast.success("WarpTalk realtime translation started.");
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Failed to start translation.");
      }
    });
  }

  function handleStopWarptalk() {
    setWarptalkStarted(false);
    toast.success("WarpTalk realtime translation stopped.");
  }

  if (roomQuery.isLoading && !isPreviewRoom) {
    return <StatePanel title="Loading room..." description="Fetching room details from the TranslationRoom service." />;
  }

  if (meetingSession?.isWaitingRoom) {
    return <WaitingRoomView onRetry={retryMeetingConnection} />;
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
                currentUserId={user?.id}
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
              <FilteredRoomAudio targetLanguage={targetLanguage} />

              {/* Floating Control Bar */}
              <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 transition-opacity hover:opacity-100">
                <MeetingControlBar
                  meetingEnabled={Boolean(meetingSession?.token)}
                  cameraEnabled={cameraEnabled}
                  microphoneEnabled={microphoneEnabled}
                  isScreenSharing={Boolean(screenStream)}
                  layoutMode={meetingLayout}
                  roomCode={room.translationRoomCode}
                  joinLink={joinLink}
                  onCopyText={copyText}
                  onToggleCamera={() => setCameraEnabled((current) => !current)}
                  onToggleMicrophone={() => setMicrophoneEnabled((current) => !current)}
                  onToggleScreenShare={handleToggleScreenShare}
                  onLayoutChange={setMeetingLayout}
                />
              </div>
            </div>
          </section>

          {rightSidebarOpen && (
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
              meetingStarted={room?.status === "in_progress"}
            />
          )}
        </main>
      </LiveKitRoom>
    </div>
  );
}

// Helpers
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
