"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LiveKitRoom, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { RoomEvent } from "livekit-client";
import { HubConnectionState } from "@microsoft/signalr";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { resolveTranscriptSpeakerName } from "@/lib/transcript-display";
import { useJoinMeeting, useSetMuteOnEntry, useSetRecording, useSetRoomLock } from "@/hooks/use-meeting";
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
import { pollsQueryKey } from "@/hooks/use-polls";
import { questionsQueryKey } from "@/hooks/use-qa";
import type { PollDto, PollTally } from "@/types/poll";
import type { QuestionDto } from "@/types/question";
import { BreakoutSetupModal } from "@/components/rooms/live/breakout-setup-modal";
import { LanguagePickerModal } from "@/components/rooms/live/language-picker-modal";
import { fetchMyBreakoutAssignment, useEndBreakouts } from "@/hooks/use-breakouts";
import type { BreakoutAssignmentRelay } from "@/types/breakout";

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
  const queryClient = useQueryClient();
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
  // Shown once, right after this participant's LiveKit session is established (host and
  // participant alike) — a dismissible nudge to pick speak/listen language up front
  // instead of relying on a later dropdown pick or the "auto" default. Ref guards against
  // re-showing on a later meetingSession change (reconnect, breakout token swap).
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const languagePickerShownRef = useRef(false);

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

  const handleNoiseSuppressionError = useCallback(() => {
    setNoiseSuppressionEnabled(false);
    writeTrackEffectsPreferences({ noiseSuppressionEnabled: false });
    toast.error("Enhanced noise suppression is unavailable.", {
      description: "Browser noise suppression remains enabled.",
    });
  }, []);

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
  const updateParticipantSpeakLanguage = useTranslationRoomStore((state) => state.updateParticipantSpeakLanguage);
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
  // WT-08: HostChanged (broadcast after MeetingRoomService.HandleHostOfflineAsync elects a
  // replacement) overrides the room DTO's original host once it fires — the DTO itself is
  // never refetched just for this, so without this override a promoted participant's
  // host-only UI would stay hidden until their next full room refetch.
  const [liveHostUserId, setLiveHostUserId] = useState<string | null>(null);
  const isHost = Boolean(
    (liveHostUserId ? user?.id === liveHostUserId : room?.isHost || (user?.id && room?.hostId === user.id)) ||
      role === "admin" ||
      role === "owner"
  );
  // Only the actual host may START the room. Workspace admins/owners get host-like
  // UI privileges (isHost) but the backend rejects a start from anyone whose id != room.hostId
  // with 403, so the auto-start below must gate on true host identity — not workspace role.
  const isRoomHost = Boolean(
    liveHostUserId ? user?.id === liveHostUserId : room?.isHost || (user?.id && room?.hostId === user.id)
  );

  // WT-04/WT-06: host controls + recording state, synced live via TranslationRoomHub's
  // RoomLockChanged/RecordingStateChanged broadcasts (see the SignalR effect below).
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [muteOnEntryEnabled, setMuteOnEntryEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const setLockMutation = useSetRoomLock(roomId);
  const setMuteOnEntryMutation = useSetMuteOnEntry(roomId);
  const setRecordingMutation = useSetRecording(roomId);

  // Breakout rooms (scoped-down): `breakoutState` describes THIS viewer's own current
  // assignment/connection (drives the LiveKit token swap + top-bar countdown chip below).
  // `breakoutsRunning` is room-wide — true from the first BreakoutsStarted broadcast to the
  // last BreakoutsEnded one, regardless of whether THIS viewer has an assignment (e.g. the
  // host, who stays in the main room) — drives the host-controls flyout's active state.
  const [showBreakoutSetup, setShowBreakoutSetup] = useState(false);
  const [breakoutsRunning, setBreakoutsRunning] = useState(false);
  const [breakoutState, setBreakoutState] = useState<{
    active: boolean;
    label: string | null;
    startedAt: string | null;
    durationSeconds: number | null;
  }>({ active: false, label: null, startedAt: null, durationSeconds: null });
  const breakoutActiveRef = useRef(false);
  useEffect(() => {
    breakoutActiveRef.current = breakoutState.active;
  }, [breakoutState.active]);
  // The main room's own LiveKit session, remembered so BreakoutsEnded can reconnect back to
  // it — only updated while NOT in a breakout (see the LiveKitRoom's token-swap comment
  // further down for why simply swapping `meetingSession.token` is enough to move the
  // LiveKitRoom component between provider rooms without a full remount).
  const mainMeetingSessionRef = useRef<JoinMeetingResponseDto | null>(null);
  useEffect(() => {
    if (!breakoutState.active) {
      mainMeetingSessionRef.current = meetingSession;
    }
  }, [meetingSession, breakoutState.active]);
  const endBreakoutsMutation = useEndBreakouts(roomId);

  // WT-08: application-level reconnect state — the hub connection itself already
  // auto-reconnects at the transport level (see createHubConnection/withAutomaticReconnect),
  // this just reflects that + LiveKit's own reconnect cycle in a single user-facing banner.
  const [isSignalRReconnecting, setIsSignalRReconnecting] = useState(false);
  const [isLiveKitReconnecting, setIsLiveKitReconnecting] = useState(false);
  const isReconnecting = isSignalRReconnecting || isLiveKitReconnecting;
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
  // Spoken (source) language is now a live, user-changeable choice too — the counterpart
  // to listenLanguage below — via the media bar's speak-language dropdown +
  // TranslationRoomHub.SetSpeakLanguage, instead of a value fixed for the whole meeting at
  // setup time. Initializes once from the saved join config (or "auto" if never set); after
  // that a manual pick always wins.
  const [sourceLanguage, setSourceLanguageState] = useState<string>(
    savedJoinConfig.speakLanguage ? normalizeLanguageCode(savedJoinConfig.speakLanguage) : "auto"
  );
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

  // Read inside joinCurrentRoom/the reconnect handler below instead of closing over
  // sourceLanguage directly — same reasoning as targetLanguageRef above: a live
  // speak-language change goes through SetSpeakLanguage, not a hub reconnect, so the
  // main SignalR effect's dependency array must not include sourceLanguage either.
  const sourceLanguageRef = useRef(sourceLanguage);
  useEffect(() => {
    sourceLanguageRef.current = sourceLanguage;
  }, [sourceLanguage]);
  // Last speak language actually sent to the hub — mirrors appliedListenLanguageRef.
  const appliedSpeakLanguageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sourceLanguage || sourceLanguage === "auto" || appliedSpeakLanguageRef.current === sourceLanguage) return;
    appliedSpeakLanguageRef.current = sourceLanguage;

    let cancelled = false;
    (async () => {
      for (const delay of [0, 300, 800, 1500]) {
        if (cancelled) return;
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        const connection = translationConnectionRef.current;
        if (connection?.state === HubConnectionState.Connected) {
          try {
            await connection.invoke("SetSpeakLanguage", roomId, sourceLanguage);
          } catch {
            toast.error("Could not update speak language.");
          }
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceLanguage, roomId]);

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

  function handleChangeSpeakLanguage(language: string) {
    const normalizedLanguage = normalizeLanguageCode(language);
    setSourceLanguageState(normalizedLanguage);
    try {
      const config = JSON.parse(window.sessionStorage.getItem("warptalk.join.preview") || "{}");
      window.sessionStorage.setItem(
        "warptalk.join.preview",
        JSON.stringify({ ...config, speakLanguage: normalizedLanguage })
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
        // WT-04: default the local mic to muted when the host has mute-on-entry enabled.
        if (session.muteOnEntry) setMicrophoneEnabled(false);
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

  const retryMeetingConnectionRef = useRef(retryMeetingConnection);
  useEffect(() => {
    retryMeetingConnectionRef.current = retryMeetingConnection;
  }, [retryMeetingConnection]);

  useEffect(() => {
    if (!room?.id || !canConnectMeeting || meetingJoinedRef.current) return;
    meetingJoinedRef.current = true;

    const translationRoomId = room.id;
    queueMicrotask(() => {
      void joinMeetingAsync({ translationRoomId, displayName })
        .then((session) => {
          setMeetingError(null);
          setMeetingSession(session);
          // WT-04: default the local mic to muted when the host has mute-on-entry enabled.
          if (session.muteOnEntry) setMicrophoneEnabled(false);
        })
        .catch((error) => {
          setMeetingSession(null);
          setMeetingError(error instanceof Error ? error.message : "Could not connect to the LiveKit meeting.");
        });
    });
  }, [canConnectMeeting, joinMeetingAsync, room?.id]);

  useEffect(() => {
    if (languagePickerShownRef.current) return;
    if (!meetingSession?.token || isPreviewRoom) return;
    languagePickerShownRef.current = true;
    setShowLanguagePicker(true);
  }, [meetingSession, isPreviewRoom]);

  function handleConfirmLanguagePicker(speak: string, listen: string) {
    handleChangeSpeakLanguage(speak);
    handleChangeListenLanguage(listen);
  }

  useEffect(() => {
    if (!roomId) return;
    resetLiveRoom();
    const connection = createHubConnection("/hubs/translation-room");
    translationConnectionRef.current = connection;

    connection.on("TranslationRoomStarted", (state: TranslationRoomStateDto) => {
      setLiveState(state);
      void refetchRoom().then(() => {
        retryMeetingConnectionRef.current();
      });
    });
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
    // Live speak-language change from ANOTHER participant — keeps speakerLanguageByUserId
    // (and therefore FilteredRoomAudio's mute-real-mic-if-different-language logic) correct
    // without waiting for a refetchParticipants() round-trip.
    connection.on("ParticipantSpeakLanguageChanged", (userId: string, speakLanguage: string) => {
      updateParticipantSpeakLanguage(userId, speakLanguage);
    });

    // WT-04
    connection.on("RoomLockChanged", (locked: boolean) => {
      setIsRoomLocked(locked);
    });
    connection.on("ForceMuted", () => {
      setMicrophoneEnabled(false);
      toast.error("You were muted by the host.");
    });
    // WT-06
    connection.on("RecordingStateChanged", (recording: boolean) => {
      setIsRecording(recording);
    });
    // WT-08
    connection.on("HostChanged", (newHostUserId: string) => {
      setLiveHostUserId(newHostUserId);
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

    // Polls + Q&A (WT-14/15) — PollsService/QuestionsService relay these via Redis into this
    // hub (see TranslationRoomRedisSubscriberService); polls-panel.tsx/qa-panel.tsx read the
    // same query-cache keys via usePolls/useQuestions, so writing here is all that's needed
    // to keep every open panel instance in sync, including the panel that isn't mounted
    // right now (tab not selected) — the cache persists independent of mount state.
    connection.on("PollCreated", (poll: PollDto) => {
      queryClient.setQueryData<PollDto[]>(pollsQueryKey(roomId), (current) =>
        current?.some((p) => p.id === poll.id) ? current : [...(current ?? []), poll]
      );
    });
    connection.on("PollVoted", (pollId: string, tally: PollTally) => {
      queryClient.setQueryData<PollDto[]>(pollsQueryKey(roomId), (current) =>
        (current ?? []).map((poll) =>
          poll.id === pollId
            ? { ...poll, options: poll.options.map((option) => ({ ...option, voteCount: tally[option.id] ?? option.voteCount })) }
            : poll
        )
      );
    });
    connection.on("PollClosed", (pollId: string, finalResult: PollDto) => {
      queryClient.setQueryData<PollDto[]>(pollsQueryKey(roomId), (current) =>
        (current ?? []).map((poll) => (poll.id === pollId ? finalResult : poll))
      );
    });
    connection.on("QuestionAsked", (question: QuestionDto) => {
      queryClient.setQueryData<QuestionDto[]>(questionsQueryKey(roomId), (current) =>
        current?.some((q) => q.id === question.id) ? current : [...(current ?? []), question]
      );
    });
    connection.on("QuestionUpvoted", (questionId: string, upvoteCount: number) => {
      queryClient.setQueryData<QuestionDto[]>(questionsQueryKey(roomId), (current) =>
        (current ?? []).map((question) => (question.id === questionId ? { ...question, upvoteCount } : question))
      );
    });
    connection.on("QuestionAnswered", (questionId: string) => {
      queryClient.setQueryData<QuestionDto[]>(questionsQueryKey(roomId), (current) =>
        (current ?? []).map((question) =>
          question.id === questionId ? { ...question, status: "answered", answeredAt: new Date().toISOString() } : question
        )
      );
    });

    // Breakout rooms (scoped-down) — BreakoutsStarted/BreakoutsEnded relayed by
    // BreakoutsService via the same Redis command channel Polls/Q&A above use (see
    // TranslationRoomRedisSubscriberService on the Gateway). Assignments carries no LiveKit
    // token (see BreakoutAssignmentRelayDto's doc on the backend) — an assigned client mints
    // its own via GET .../breakouts/my-assignment, then swaps meetingSession.token to move
    // the already-mounted <LiveKitRoom> from the main room to the sub-room in place (see
    // useLiveKitRoom's connect/token effect: changing `token` while `connect` stays true
    // just calls room.connect() again with the new token, no remount needed).
    connection.on("BreakoutsStarted", (assignments: BreakoutAssignmentRelay[] | null, durationSeconds: number | null, startedAt: string | null) => {
      setBreakoutsRunning(true);
      const mine = user?.id ? (assignments ?? []).find((a) => a.userId === user.id) : undefined;
      if (!mine) return;

      setBreakoutState({ active: true, label: mine.label, startedAt, durationSeconds });
      void fetchMyBreakoutAssignment(roomId)
        .then((info) => {
          setMeetingSession({
            token: info.token,
            providerRoomName: info.providerRoomName,
            participantIdentity: info.participantIdentity,
            isWaitingRoom: false,
            muteOnEntry: false,
          });
          toast.success(`You've been moved to ${mine.label}.`);
        })
        .catch(() => {
          toast.error("Could not join your breakout room.");
          setBreakoutState({ active: false, label: null, startedAt: null, durationSeconds: null });
        });
    });
    connection.on("BreakoutsEnded", () => {
      setBreakoutsRunning(false);
      if (!breakoutActiveRef.current) return;

      setBreakoutState({ active: false, label: null, startedAt: null, durationSeconds: null });
      if (mainMeetingSessionRef.current) {
        setMeetingSession(mainMeetingSessionRef.current);
      }
      toast.success("Breakout rooms ended — you're back in the main room.");
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
        .invoke("JoinTranslationRoom", roomId, displayName, sourceLanguageRef.current, targetLanguageRef.current)
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

    // WT-08: the hub connection auto-reconnects at the transport level (see
    // createHubConnection), but SignalR has no memory of prior group membership across a
    // reconnect — a NEW connection id is issued, so the client must explicitly rejoin the
    // room's group, and re-apply any non-default listen language / voice preference it had
    // set (read from the "last applied" refs so this doesn't depend on stale closed-over
    // state).
    connection.onreconnecting(() => {
      setIsSignalRReconnecting(true);
    });

    connection.onreconnected(() => {
      setIsSignalRReconnecting(false);
      void (async () => {
        await joinCurrentRoom();

        const currentListenLanguage = appliedListenLanguageRef.current;
        if (currentListenLanguage) {
          try {
            await connection.invoke("SetListenLanguage", roomId, currentListenLanguage);
          } catch {
            // Best-effort — the client's own local listenLanguage state is unaffected.
          }
        }

        const currentVoicePreference = appliedVoicePreferenceRef.current;
        if (currentVoicePreference) {
          try {
            await connection.invoke("SetVoicePreference", roomId, currentVoicePreference);
          } catch {
            // Best-effort — the client's own local voicePreference state is unaffected.
          }
        }

        const currentSpeakLanguage = appliedSpeakLanguageRef.current;
        if (currentSpeakLanguage) {
          try {
            await connection.invoke("SetSpeakLanguage", roomId, currentSpeakLanguage);
          } catch {
            // Best-effort — the client's own local sourceLanguage state is unaffected.
          }
        }
      })();
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
    // targetLanguage/sourceLanguage intentionally excluded — see joinCurrentRoom's comment
    // above; runtime language changes go through SetListenLanguage/SetSpeakLanguage, not a
    // reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLiveParticipant, addOrMergeTranslationText, addTranscriptSegment, refetchParticipants, refetchRoom, removeLiveParticipant, resetLiveRoom, displayName, queryClient, roomId, setLiveState, setHandRaisedInStore, updateParticipantSpeakLanguage, user?.id]);

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

  // WT-04: room lock is confirmed via the RoomLockChanged broadcast the REST call triggers
  // (see MeetingRoomService.SetLockAsync) — no optimistic local update needed.
  function handleToggleLock(locked: boolean) {
    setLockMutation.mutate(locked, {
      onError: () => toast.error("Could not update room lock."),
    });
  }

  function handleToggleMuteOnEntry(enabled: boolean) {
    const previous = muteOnEntryEnabled;
    setMuteOnEntryEnabled(enabled); // optimistic — not broadcast live, see MeetingRoomService.SetMuteOnEntryAsync
    setMuteOnEntryMutation.mutate(enabled, {
      onError: () => {
        setMuteOnEntryEnabled(previous);
        toast.error("Could not update mute-on-entry.");
      },
    });
  }

  function handleMuteAll() {
    const connection = translationConnectionRef.current;
    if (connection?.state !== HubConnectionState.Connected) return;
    connection.invoke("MuteAll", roomId).catch(() => {
      toast.error("Could not mute all participants.");
    });
  }

  // WT-06: recording state is confirmed via the RecordingStateChanged broadcast (see
  // MeetingRoomService.SetRecordingAsync) — no optimistic local update needed.
  function handleToggleRecording() {
    const action = isRecording ? "stop" : "start";
    setRecordingMutation.mutate(action, {
      onSuccess: (state) => {
        setIsRecording(state.recording);
        toast.success(state.recording ? "Recording started." : "Recording stopped.");
      },
      onError: () =>
        toast.error(action === "start" ? "Could not start recording." : "Could not stop recording."),
    });
  }

  // Breakout rooms: local state updates happen from the BreakoutsStarted/BreakoutsEnded hub
  // broadcasts (see the SignalR effect above), not optimistically here — same pattern as
  // room lock/recording.
  function handleEndBreakoutRooms() {
    endBreakoutsMutation.mutate(undefined, {
      onError: () => toast.error("Could not end breakout rooms."),
    });
  }

  function handleBreakoutFinalMinute() {
    toast("Returning to the main room soon.", { description: "The host can also end breakouts early from the host controls menu." });
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
        serverUrl={
          process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace("localhost", typeof window !== "undefined" ? window.location.hostname : "localhost")
        }
        connect={Boolean(meetingSession?.token)}
        data-lk-theme="default"
        className="flex min-h-0 flex-1 flex-col !bg-transparent !text-ink [&_.lk-participant-placeholder]:!bg-surface-2 [&_.lk-participant-placeholder_svg]:!text-ink-muted [&_.lk-participant-tile]:!bg-surface-1"
      >
        <LiveKitReconnectWatcher
          onReconnecting={() => setIsLiveKitReconnecting(true)}
          onReconnected={() => setIsLiveKitReconnecting(false)}
        />

        <MeetingTopBar
          room={room}
          isHost={isHost}
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          onExit={handleExit}
          warptalkStarted={warptalkStarted}
          isLocked={isRoomLocked}
          breakoutInfo={
            breakoutState.active
              ? { label: breakoutState.label ?? "", startedAt: breakoutState.startedAt, durationSeconds: breakoutState.durationSeconds }
              : null
          }
          onBreakoutFinalMinute={handleBreakoutFinalMinute}
        />

        {isReconnecting ? (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Reconnecting…
          </div>
        ) : null}

        {isRecording ? (
          <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-1.5 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            This meeting is being recorded
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1 gap-4 p-4 pt-0">
          <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-sm">
            <div className="relative flex-1 min-h-0 w-full">
              {isRecording ? (
                <div className="absolute left-4 top-4 z-30 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  REC
                </div>
              ) : null}
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
                onNoiseSuppressionError={handleNoiseSuppressionError}
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
                  speakLanguage={sourceLanguage}
                  availableSpeakLanguages={availableListenLanguages}
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
                  onChangeSpeakLanguage={handleChangeSpeakLanguage}
                  onChangeVoicePreference={handleChangeVoicePreference}
                  onChangeVoiceCloneConsent={handleChangeVoiceCloneConsent}
                  onChangeVoiceEnabled={handleChangeVoiceEnabled}
                  onToggleRaiseHand={handleToggleRaiseHand}
                  onSendReaction={handleSendReaction}
                  isLocked={isRoomLocked}
                  muteOnEntry={muteOnEntryEnabled}
                  isRecording={isRecording}
                  recordingPending={setRecordingMutation.isPending}
                  onToggleLock={isHost ? handleToggleLock : undefined}
                  onToggleMuteOnEntry={isHost ? handleToggleMuteOnEntry : undefined}
                  onMuteAll={isHost ? handleMuteAll : undefined}
                  onToggleRecording={isHost ? handleToggleRecording : undefined}
                  breakoutActive={breakoutsRunning}
                  onOpenBreakoutSetup={isHost ? () => setShowBreakoutSetup(true) : undefined}
                  onEndBreakoutRooms={isHost ? handleEndBreakoutRooms : undefined}
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
              connection={translationConnectionRef.current}
            />
          )}
        </main>
      </LiveKitRoom>

      {isHost ? (
        <BreakoutSetupModal
          open={showBreakoutSetup}
          onOpenChange={setShowBreakoutSetup}
          roomId={roomId}
          participants={participants}
        />
      ) : null}

      <LanguagePickerModal
        open={showLanguagePicker}
        onOpenChange={setShowLanguagePicker}
        availableLanguages={availableListenLanguages}
        defaultSpeakLanguage={sourceLanguage !== "auto" ? sourceLanguage : undefined}
        defaultListenLanguage={listenLanguage ?? undefined}
        onConfirm={handleConfirmLanguagePicker}
        onSkip={() => {
          // No-op: leaving speak/listen exactly as they already are (STT auto-detect +
          // the room's default listen language) IS the existing pre-modal behavior.
        }}
      />
    </div>
  );
}

// Helpers

// WT-08: useRoomContext() only works INSIDE <LiveKitRoom>'s provider tree — RoomDetailPage
// itself renders <LiveKitRoom> rather than being inside it, so this tiny child component is
// what actually reaches the LiveKit Room instance to observe RoomEvent.Reconnecting/
// Reconnected, mirroring how prior rounds' LiveKit-aware components (e.g. FilteredRoomAudio)
// are children of <LiveKitRoom> rather than living in the parent page.
function LiveKitReconnectWatcher({ onReconnecting, onReconnected }: { onReconnecting: () => void; onReconnected: () => void }) {
  const room = useRoomContext();

  useEffect(() => {
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected, onReconnected);
    return () => {
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected, onReconnected);
    };
  }, [room, onReconnecting, onReconnected]);

  return null;
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
