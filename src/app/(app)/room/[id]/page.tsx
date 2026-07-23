"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { HubConnectionState } from "@microsoft/signalr";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { resolveTranscriptSpeakerName } from "@/lib/transcript-display";
import { useJoinMeeting } from "@/hooks/use-meeting";
import {
  useStartTranslationRoom,
  useEndTranslationRoom,
  useLeaveTranslationRoom,
  useSetVoiceCloneConsent,
  useTranslationRoom,
  useTranslationRoomParticipants,
} from "@/hooks/use-translationRooms";
import { createHubConnection } from "@/lib/signalr";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { JoinMeetingResponseDto } from "@/types/meeting";
import type { ParticipantInfoDto, TranscriptSegmentDto, TranslationRoomStateDto, TranslationTextDto, VoiceOptionDto } from "@/types/realtime";
import type { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";

// Import Refactored Components
import { MeetingTopBar } from "@/components/rooms/live/meeting-top-bar";
import { MeetingControlBar, type MeetingLayoutMode } from "@/components/rooms/live/meeting-control-bar";
import { LiveKitMeetingStage } from "@/components/rooms/live/meeting-stage";
import { FilteredRoomAudio } from "@/components/rooms/live/filtered-room-audio";
import { TrackProcessorsController, writeTrackEffectsPreferences } from "@/hooks/use-track-processors";
import { LiveSubtitleOverlay } from "@/components/rooms/live/live-subtitle-overlay";
import { MeetingSidePanel, type SidePanelMode } from "@/components/rooms/live/side-panel/meeting-side-panel";
import { WaitingRoomView, StatePanel } from "@/components/rooms/live/waiting-room-view";
import { ReactionOverlay, type FloatingReaction } from "@/components/rooms/live/reaction-overlay";

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
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const roomId = params.id;
  const user = useAuthStore((state) => state.user);
  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const refetchParticipants = participantsQuery.refetch;
  const startRoom = useStartTranslationRoom();
  const endRoom = useEndTranslationRoom();
  const leaveRoom = useLeaveTranslationRoom(roomId);
  const setVoiceCloneConsent = useSetVoiceCloneConsent(roomId);
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
  // Local-only tile pin (WT-03) — clicking a tile toggles it; overridden by spotlight below.
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  // Host-forced spotlight, synced to every viewer via TranslationRoomHub.SpotlightChanged.
  const [spotlightedUserId, setSpotlightedUserId] = useState<string | null>(null);
  // TranslationRoomHub.RaiseHand broadcasts via OthersInGroup, so the caller tracks its
  // own raised state locally — the store's raisedHands only ever holds OTHER userIds.
  const [handRaised, setHandRaisedState] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const reactionIdRef = useRef(0);

  // Read config from sessionStorage
  const savedDevices = typeof window !== 'undefined' ? JSON.parse(window.sessionStorage.getItem('warptalk.devices.preview') || '{}') : {};
  const savedJoinConfig = typeof window !== 'undefined' ? JSON.parse(window.sessionStorage.getItem('warptalk.join.preview') || '{}') : {};
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(savedDevices.cameraEnabled ?? savedJoinConfig.cameraEnabled ?? true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState<boolean>(savedDevices.microphoneEnabled ?? savedJoinConfig.microphoneEnabled ?? true);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState<boolean>(savedDevices.noiseSuppressionEnabled ?? savedJoinConfig.noiseSuppressionEnabled ?? true);
  const [backgroundBlurEnabled, setBackgroundBlurEnabled] = useState<boolean>(savedDevices.backgroundBlurEnabled ?? savedJoinConfig.backgroundBlurEnabled ?? false);

  function handleToggleNoiseSuppression() {
    setNoiseSuppressionEnabled((current) => {
      const next = !current;
      writeTrackEffectsPreferences({ noiseSuppressionEnabled: next });
      return next;
    });
  }

  function handleToggleBackgroundBlur() {
    setBackgroundBlurEnabled((current) => {
      const next = !current;
      writeTrackEffectsPreferences({ backgroundBlurEnabled: next });
      return next;
    });
  }

  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const transcriptSegments = useTranslationRoomStore((state) => state.transcriptSegments);
  const setLiveState = useTranslationRoomStore((state) => state.setTranslationRoomState);
  const addLiveParticipant = useTranslationRoomStore((state) => state.addParticipant);
  const removeLiveParticipant = useTranslationRoomStore((state) => state.removeParticipant);
  const raisedHands = useTranslationRoomStore((state) => state.raisedHands);
  const setHandRaisedInStore = useTranslationRoomStore((state) => state.setHandRaised);
  const { rightSidebarOpen, setLeftSidebarOpen } = useUIStore();

  useEffect(() => {
    setLeftSidebarOpen(false);
  }, [setLeftSidebarOpen]);

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
  // Only the actual host may START the room. Workspace admins/owners get host-like
  // UI privileges (isHost) but the backend rejects a start from anyone whose id != room.hostId
  // with 403, so the auto-start below must gate on true host identity — not workspace role.
  const isRoomHost = Boolean(room?.isHost || (user?.id && room?.hostId === user.id));
  const participants = liveParticipants.length ? mergeParticipants(apiParticipants, liveParticipants) : apiParticipants;
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);
  const activeCount = participants.filter((participant) => !["left", "removed", "kicked"].includes(participant.status)).length;
  const joinLink = room?.translationRoomCode ? getJoinLink(room.translationRoomCode) : "";
  // Store only ever holds OTHER users' raised hands (RaiseHand broadcasts via
  // OthersInGroup) — merge in this viewer's own local toggle so badges render
  // consistently everywhere (tiles, people panel) regardless of whose row it is.
  const raisedHandUserIds = useMemo(() => {
    const ids = new Set(raisedHands);
    if (handRaised && user?.id) ids.add(user.id);
    return ids;
  }, [raisedHands, handRaised, user?.id]);
  const liveSegments = useMemo(() => dedupeSegments(transcriptSegments), [transcriptSegments]);
  // Transcript history persists whether or not translation is currently running:
  // "Stop Translation" only halts new live captions (LiveSubtitleOverlay below); it must
  // NOT wipe what was already transcribed. Segments stay in the store until the room is
  // left. Preview rooms fall back to sample content when nothing real has arrived yet.
  const panelSegments = isPreviewRoom && !liveSegments.length ? getPreviewTranscriptSegments() : liveSegments;
  
  const canConnectMeeting =
    Boolean(room) &&
    room?.status !== "ended" &&
    room?.status !== "cancelled" &&
    room?.status !== "expired" &&
    room?.status !== "failed";
    
  const displayName = savedJoinConfig.displayName || user?.fullName || user?.email || "Participant";
  const roomSourceLanguage = room?.sourceLanguage || "auto";
  const sourceLanguage = savedJoinConfig.speakLanguage || "auto";
  // Listen (output) language is now a live, user-changeable choice — see the media bar's
  // language dropdown + TranslationRoomHub.SetListenLanguage — instead of a value fixed
  // for the whole meeting at setup time. State auto-initializes ONCE (guarded by the
  // null check in the effect below) from the saved join config or the room's configured
  // targets; after that, a manual pick always wins even as `room` refetches.
  const [listenLanguage, setListenLanguageState] = useState<string | null>(
    savedJoinConfig.listenLanguage ? normalizeLanguageCode(savedJoinConfig.listenLanguage) : null
  );
  useEffect(() => {
    if (listenLanguage || !room) return;
    const initial =
      room.targetLanguages?.find((language) => normalizeLanguageCode(language) !== normalizeLanguageCode(roomSourceLanguage)) ||
      room.targetLanguages?.[0] ||
      "en";
    setListenLanguageState(normalizeLanguageCode(initial));
  }, [listenLanguage, room, roomSourceLanguage]);
  const targetLanguage = listenLanguage || "en";

  // Read inside the TranslationTextReceived handler below instead of closing over
  // targetLanguage directly — the gateway broadcasts every listener's target language to
  // the whole room group (see AiResultConsumerService.ConsumeTranslationResultsAsync), so
  // without this filter a Vietnamese listener would render every other participant's
  // Chinese/Japanese/English translation bubbles too ("loạn ngôn ngữ"). A ref keeps the
  // filter reading the latest value without forcing the SignalR effect to reconnect on
  // every language change.
  const targetLanguageRef = useRef(targetLanguage);
  useEffect(() => {
    targetLanguageRef.current = targetLanguage;
  }, [targetLanguage]);

  // Live handle to the translation-room hub connection — set inside the SignalR effect
  // below, read here so a dropdown pick can call SetListenLanguage without tearing down
  // and reconnecting the whole hub connection (which would wipe transcriptSegments/chat
  // history via resetLiveRoom() and re-broadcast ParticipantJoined for no reason).
  const translationConnectionRef = useRef<import("@microsoft/signalr").HubConnection | null>(null);
  // Last listen language actually sent to the hub — skips a redundant SetListenLanguage
  // call when this effect re-runs without the value having changed.
  const appliedListenLanguageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!listenLanguage || appliedListenLanguageRef.current === listenLanguage) return;
    appliedListenLanguageRef.current = listenLanguage;

    let cancelled = false;
    (async () => {
      // The hub connection may still be mid-handshake (e.g. this is the freshly-resolved
      // room default, arriving a beat after the SignalR connection kicked off) — retry
      // briefly rather than silently dropping the language on the floor. Same backoff
      // shape as the join retry below.
      for (const delay of [0, 300, 800, 1500]) {
        if (cancelled) return;
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        const connection = translationConnectionRef.current;
        if (connection?.state === HubConnectionState.Connected) {
          try {
            await connection.invoke("SetListenLanguage", roomId, listenLanguage);
          } catch {
            toast.error("Could not update listen language.");
          }
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listenLanguage, roomId]);

  // Which TTS voice this listener wants to hear the AI interpreter speak in — like
  // listenLanguage, a live, in-meeting-changeable choice (media bar voice dropdown +
  // TranslationRoomHub.SetVoicePreference), NOT set up front outside the meeting.
  // null = no preference, use the automatic per-speaker default (see
  // TTSWorker._resolve_voice_variants). A real Cartesia voice id when set.
  const [voicePreference, setVoicePreference] = useState<string | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<VoiceOptionDto[]>([]);

  // Voices are language-specific (Cartesia's own voice table), so switching listen
  // language must both clear any voice pick made for the PREVIOUS language (it may not
  // even exist for the new one) and refetch the picker's option list for the new one.
  useEffect(() => {
    setVoicePreference(null);
    setVoiceCatalog([]);

    let cancelled = false;
    (async () => {
      for (const delay of [0, 300, 800, 1500]) {
        if (cancelled) return;
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        const connection = translationConnectionRef.current;
        if (connection?.state === HubConnectionState.Connected) {
          try {
            const catalog = await connection.invoke<VoiceOptionDto[]>("GetVoiceCatalog", targetLanguage);
            if (!cancelled) setVoiceCatalog(catalog ?? []);
          } catch {
            // Non-critical — the picker just shows no extra options; the automatic
            // per-speaker default voice keeps working regardless.
          }
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetLanguage]);

  // Last voice preference actually sent to the hub (including "" for "cleared") — null
  // means "nothing sent yet", distinct from "" ("explicitly cleared"), so a fresh
  // mount doesn't fire a no-op SetVoicePreference("") before the user has touched
  // anything.
  const appliedVoicePreferenceRef = useRef<string | null>(null);

  useEffect(() => {
    if (appliedVoicePreferenceRef.current === voicePreference) return;
    appliedVoicePreferenceRef.current = voicePreference;

    let cancelled = false;
    (async () => {
      for (const delay of [0, 300, 800, 1500]) {
        if (cancelled) return;
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        const connection = translationConnectionRef.current;
        if (connection?.state === HubConnectionState.Connected) {
          try {
            await connection.invoke("SetVoicePreference", roomId, voicePreference || "");
          } catch {
            toast.error("Could not update voice preference.");
          }
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [voicePreference, roomId]);

  // Choices for the media bar's language dropdown: the room's spoken language plus every
  // configured target — always includes whatever is currently selected so a value coming
  // from an older/ad-hoc join config never renders as a dropdown option with no match.
  const availableListenLanguages = useMemo(() => {
    const codes = new Set<string>();
    if (room?.sourceLanguage) codes.add(normalizeLanguageCode(room.sourceLanguage));
    room?.targetLanguages?.forEach((language) => codes.add(normalizeLanguageCode(language)));
    codes.add(normalizeLanguageCode(targetLanguage));
    return Array.from(codes);
  }, [room?.sourceLanguage, room?.targetLanguages, targetLanguage]);

  // Every OTHER participant's speak language, normalized — lets FilteredRoomAudio mute a
  // real participant's raw microphone track for a listener whose chosen language differs
  // from that speaker's, so the listener hears ONLY the AI interpreter dub instead of the
  // original layered underneath it. speakLanguage/targetLanguage can each independently be
  // a bare code ("vi") or locale-tagged ("vi-VN") depending on where the value came from —
  // normalizeLanguageCode (this file's, not @/lib/languages' — that one doesn't strip
  // locale tags) is what makes the comparison correct regardless of which form either side
  // happens to be in.
  const speakerLanguageByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const participant of participants) {
      if (participant.speakLanguage) {
        map[participant.userId] = normalizeLanguageCode(participant.speakLanguage);
      }
    }
    return map;
  }, [participants]);
  const targetLanguageNormalized = normalizeLanguageCode(targetLanguage);

  function handleChangeListenLanguage(language: string) {
    const normalizedLanguage = normalizeLanguageCode(language);
    setListenLanguageState(normalizedLanguage);
    try {
      const config = JSON.parse(window.sessionStorage.getItem("warptalk.join.preview") || "{}");
      window.sessionStorage.setItem(
        "warptalk.join.preview",
        JSON.stringify({ ...config, listenLanguage: normalizedLanguage })
      );
    } catch {
      // Non-critical — worst case the picked language doesn't survive a page refresh.
    }
  }

  /** voiceId "" (or falsy) clears the preference, back to the automatic per-speaker default. */
  function handleChangeVoicePreference(voiceId: string) {
    setVoicePreference(voiceId || null);
  }

  // Whether THIS participant has consented to have their OWN voice cloned for dubbing
  // (see TranslationRoomAudioRouteController.SetVoiceCloneConsent). Local-only: there's
  // no cheap way to derive "is my consent currently on" without an extra fetch that
  // cross-references the audio-routes list against my own participant id, so this
  // resets to false on refresh/rejoin even if the server-side consent from an earlier
  // visit is technically still on — a known, accepted display-only limitation (voice
  // cloning itself keeps working correctly either way; only the toggle's initial
  // display can be stale until the participant touches it again).
  const [voiceCloneEnabled, setVoiceCloneEnabled] = useState(false);

  function handleChangeVoiceCloneConsent(enabled: boolean) {
    const previous = voiceCloneEnabled;
    setVoiceCloneEnabled(enabled); // optimistic
    setVoiceCloneConsent.mutate(enabled, {
      onError: () => {
        setVoiceCloneEnabled(previous);
        toast.error("Could not update voice clone consent.");
      },
    });
  }

  // Transcript-only mode: this listener wants captions but no audio at all (neither
  // the AI dub nor a same-language original mic) — see FilteredRoomAudio's
  // voiceEnabled prop. Purely a client-side track-subscription choice, so it's free to
  // flip live in-meeting just like listenLanguage/voicePreference, and persists the
  // same way (join-preview sessionStorage) so it survives a refresh.
  const [voiceEnabled, setVoiceEnabledState] = useState<boolean>(savedJoinConfig.voiceEnabled ?? true);

  function handleChangeVoiceEnabled(enabled: boolean) {
    setVoiceEnabledState(enabled);
    try {
      const config = JSON.parse(window.sessionStorage.getItem("warptalk.join.preview") || "{}");
      window.sessionStorage.setItem(
        "warptalk.join.preview",
        JSON.stringify({ ...config, voiceEnabled: enabled })
      );
    } catch {
      // Non-critical — worst case the picked mode doesn't survive a page refresh.
    }
  }

  useRegisterAssistantContext(
    room
      ? {
          pageType: "in_meeting",
          entityId: room.id,
          workspaceId: activeWorkspaceId ?? undefined,
          snapshot: {
            title: room.title,
            status: room.status,
            participantCount: String(activeCount),
            sourceLanguage: roomSourceLanguage,
          },
        }
      : null
  );

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
    if (!room || !isRoomHost || autoStartedRef.current) return;
    if (room.status !== "waiting" || !isInstantRoom(room)) return;

    autoStartedRef.current = true;
    startRoom.mutate(room.id, {
      onSuccess: () => toast.success("Room is live."),
      onError: () => {
        // Removed autoStartedRef reset to prevent infinite loops if start fails
      },
    });
  }, [isRoomHost, room, startRoom]);

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
    translationConnectionRef.current = connection;

    connection.on("TranslationRoomStarted", (state: TranslationRoomStateDto) => setLiveState(state));
    connection.on("ParticipantJoined", (participant: ParticipantInfoDto) => {
      addLiveParticipant(participant);
      void refetchParticipants();
    });
    connection.on("ParticipantLeft", (userId: string) => {
      removeLiveParticipant(userId);
      void refetchParticipants();
    });
    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) =>
      addTranscriptSegment({
        ...segment,
        speakerName: resolveTranscriptSpeakerName(segment, participantsRef.current),
      })
    );
    connection.on("TranslationTextReceived", (translation: TranslationTextDto) => {
      // Only render the translation into MY chosen listen language — the gateway fans
      // out every participant's target language to the whole room group, so without this
      // check the transcript panel mixes in every other listener's language too.
      if (normalizeLanguageCode(translation.targetLang) !== normalizeLanguageCode(targetLanguageRef.current)) {
        return;
      }
      addOrMergeTranslationText(translation);
    });
    connection.on("TranslationRoomEnded", () => refetchRoom());

    connection.on("HandRaised", (userId: string, isRaised: boolean) => {
      setHandRaisedInStore(userId, isRaised);
    });
    connection.on("ReactionReceived", (userId: string, emoji: string) => {
      reactionIdRef.current += 1;
      setReactions((current) => [...current, { id: `reaction-${reactionIdRef.current}`, emoji }]);
    });
    connection.on("SpotlightChanged", (targetUserId: string, on: boolean) => {
      setSpotlightedUserId(on ? targetUserId : null);
    });

    // BR-159: Backend initiated disconnections
    connection.on("ForceDisconnected", (reason?: string) => {
      toast.error(reason || "This room has been forcibly closed or you were disconnected from another device.");
      router.push(`/${activeWorkspaceSlug || 'workspace'}/rooms`);
    });
    
    connection.on("ParticipantKicked", () => {
      toast.error("You have been permanently removed from this room.");
      router.push(`/${activeWorkspaceSlug || 'workspace'}/rooms`);
    });

    let cancelled = false;
    const retryDelays = [0, 500, 1500, 3000];

    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const joinCurrentRoom = () =>
      // targetLanguageRef.current (not the closed-over targetLanguage) so a language
      // picked via the dropdown before a reconnect (e.g. after a network drop) is what
      // gets rejoined with, and so this effect's dependency array below doesn't need
      // targetLanguage — including it there would tear down and recreate this whole
      // connection (wiping transcriptSegments/chat via resetLiveRoom()) on every language
      // change instead of just calling SetListenLanguage.
      connection
        .invoke("JoinTranslationRoom", roomId, displayName, sourceLanguage, targetLanguageRef.current)
        .catch(() => undefined);
    const startAndJoin = async () => {
      for (const delay of retryDelays) {
        if (cancelled) return;
        if (delay) await wait(delay);
        try {
          await connection.start();
          if (!cancelled) await joinCurrentRoom();
          return;
        } catch {
          // Token refresh can race the initial SignalR negotiate; retry quietly.
        }
      }
    };

    connection.onreconnected(() => {
      void joinCurrentRoom();
    });

    void startAndJoin();

    return () => {
      cancelled = true;
      connection.stop().catch(() => undefined);
      if (translationConnectionRef.current === connection) {
        translationConnectionRef.current = null;
      }
      resetLiveRoom();
    };
    // targetLanguage intentionally excluded — see joinCurrentRoom's comment above;
    // runtime language changes go through SetListenLanguage, not a reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLiveParticipant, addOrMergeTranslationText, addTranscriptSegment, refetchParticipants, refetchRoom, removeLiveParticipant, resetLiveRoom, displayName, roomId, setLiveState, setHandRaisedInStore, sourceLanguage]);

  useEffect(() => {
    if (!roomId) return;
    const chatConnection = createHubConnection("/api/v1/meetings/chat-hub");
    chatConnection.on("ChatMessageHidden", (messageId: string) => {
      useTranslationRoomStore.getState().hideChatMessage(messageId);
    });

    chatConnection.on("ChatMessageReceived", (message: import("@/types/realtime").ChatMessageDto) => {
      addChatMessage(message);
    });

    let cancelled = false;
    const retryDelays = [0, 500, 1500, 3000];
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const joinChatRoom = () => chatConnection.invoke("JoinMeetingRoom", roomId).catch(() => undefined);
    const startAndJoinChat = async () => {
      for (const delay of retryDelays) {
        if (cancelled) return;
        if (delay) await wait(delay);
        try {
          await chatConnection.start();
          if (!cancelled) await joinChatRoom();
          return;
        } catch {
          // Token refresh can race the initial SignalR negotiate; retry quietly.
        }
      }
    };

    chatConnection.onreconnected(() => {
      void joinChatRoom();
    });

    void startAndJoinChat();

    return () => {
      cancelled = true;
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
        router.push(`/${activeWorkspaceSlug || 'workspace'}/rooms`);
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
      router.push(`/${activeWorkspaceSlug || 'workspace'}/rooms`);
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

  function handleToggleRaiseHand() {
    const next = !handRaised;
    setHandRaisedState(next);
    const connection = translationConnectionRef.current;
    if (connection?.state !== HubConnectionState.Connected) return;
    connection.invoke("RaiseHand", roomId, next).catch(() => {
      setHandRaisedState(!next);
      toast.error("Could not update raised hand.");
    });
  }

  function handleSendReaction(emoji: string) {
    const connection = translationConnectionRef.current;
    if (connection?.state !== HubConnectionState.Connected) return;
    connection.invoke("SendReaction", roomId, emoji).catch(() => {
      toast.error("Could not send reaction.");
    });
  }

  function handleReactionExpired(id: string) {
    setReactions((current) => current.filter((reaction) => reaction.id !== id));
  }

  function handlePinParticipant(userId: string) {
    setPinnedUserId((current) => (current === userId ? null : userId));
  }

  function handleToggleSpotlight(userId: string) {
    const connection = translationConnectionRef.current;
    if (connection?.state !== HubConnectionState.Connected) return;
    const next = spotlightedUserId !== userId;
    connection.invoke("SpotlightParticipant", roomId, userId, next).catch(() => {
      toast.error("Could not update spotlight.");
    });
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
                pinnedUserId={pinnedUserId}
                onPinParticipant={handlePinParticipant}
                spotlightedUserId={spotlightedUserId}
                raisedHandUserIds={raisedHandUserIds}
                onRetry={retryMeetingConnection}
              />
              <FilteredRoomAudio
                targetLanguageNormalized={targetLanguageNormalized}
                speakerLanguageByUserId={speakerLanguageByUserId}
                voicePreference={voicePreference}
                voiceEnabled={voiceEnabled}
              />
              <TrackProcessorsController
                noiseSuppressionEnabled={noiseSuppressionEnabled}
                backgroundBlurEnabled={backgroundBlurEnabled}
              />

              {/* Live captions — real pipeline segments only */}
              <LiveSubtitleOverlay enabled={warptalkStarted} />

              {/* Emoji reactions — TranslationRoomHub.ReactionReceived */}
              <ReactionOverlay reactions={reactions} onReactionExpired={handleReactionExpired} />

              {/* Floating Control Bar */}
              <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 transition-opacity hover:opacity-100">
                <MeetingControlBar
                  meetingEnabled={Boolean(meetingSession?.token)}
                  cameraEnabled={cameraEnabled}
                  microphoneEnabled={microphoneEnabled}
                  noiseSuppressionEnabled={noiseSuppressionEnabled}
                  backgroundBlurEnabled={backgroundBlurEnabled}
                  isScreenSharing={Boolean(screenStream)}
                  layoutMode={meetingLayout}
                  roomCode={room.translationRoomCode}
                  joinLink={joinLink}
                  isHost={isHost}
                  warptalkStarted={warptalkStarted}
                  listenLanguage={targetLanguage}
                  availableListenLanguages={availableListenLanguages}
                  voicePreference={voicePreference}
                  voiceCatalog={voiceCatalog}
                  voiceCloneEnabled={voiceCloneEnabled}
                  voiceEnabled={voiceEnabled}
                  handRaised={handRaised}
                  onCopyText={copyText}
                  onToggleCamera={() => setCameraEnabled((current) => !current)}
                  onToggleMicrophone={() => setMicrophoneEnabled((current) => !current)}
                  onToggleNoiseSuppression={handleToggleNoiseSuppression}
                  onToggleBackgroundBlur={handleToggleBackgroundBlur}
                  onToggleScreenShare={handleToggleScreenShare}
                  onLayoutChange={setMeetingLayout}
                  onStartWarptalk={handleStartWarptalk}
                  onStopWarptalk={handleStopWarptalk}
                  onChangeListenLanguage={handleChangeListenLanguage}
                  onChangeVoicePreference={handleChangeVoicePreference}
                  onChangeVoiceCloneConsent={handleChangeVoiceCloneConsent}
                  onChangeVoiceEnabled={handleChangeVoiceEnabled}
                  onToggleRaiseHand={handleToggleRaiseHand}
                  onSendReaction={handleSendReaction}
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
              segments={panelSegments}
              onCopyText={copyText}
              joinLink={joinLink}
              meetingStarted={room?.status === "in_progress"}
              chatTargetLanguage={targetLanguage}
              raisedHandUserIds={raisedHandUserIds}
              spotlightedUserId={spotlightedUserId}
              onToggleSpotlight={handleToggleSpotlight}
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

function normalizeLanguageCode(language: string) {
  return language.split("-")[0]?.toLowerCase() || language.toLowerCase();
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
