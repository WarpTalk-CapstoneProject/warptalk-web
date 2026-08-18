"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  useRoomContext,
  useTrackToggle,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState, RoomEvent, Track } from "livekit-client";
import { HubConnectionState } from "@microsoft/signalr";
import {
  ArrowsOut,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  VideoCamera,
  VideoCameraSlash,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import {
  dedupeTranscriptSegments,
  resolveTranscriptSpeakerName,
} from "@/lib/transcript/transcript-display";
import {
  useJoinMeeting,
  useSetMuteOnEntry,
  useSetRecording,
  useSetRoomLock,
} from "@/hooks/use-meeting";
import {
  useStartTranslationRoom,
  useResumeTranslationRoom,
  useStopTranslation,
  sessionsKey,
  useEndTranslationRoom,
  useLeaveTranslationRoom,
  useRefreshDubVoice,
  useFlashMode,
  useSetFlashMode,
  useNoiseReduction,
  useSetNoiseReduction,
  useSetVoiceCloneConsent,
  useTranslationRoom,
  useTranslationRoomParticipants,
  useJoinTranslationRoomByCode,
  useTranslationRoomSessions,
} from "@/hooks/use-translationRooms";
import { createHubConnection } from "@/lib/realtime/signalr";
import { getLanguageName } from "@/lib/language/languages";
import { holdsSeat } from "@/lib/meeting/room-occupancy";
import { playNotificationCue } from "@/lib/notifications/notification-sounds";
import { useAuthStore } from "@/stores/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  markLanguagePickerShown,
  wasLanguagePickerShown,
} from "@/lib/meeting/language-picker-shown";
import { liveMeetingPath } from "@/lib/workspace/workspace-routes";
import { bottomChromeInset, MIN_DOCK_SIZE } from "@/lib/meeting/mini-dock-position";
import { mergeParticipants } from "@/lib/meeting/merge-participants";
import { hasDubAudience } from "@/lib/meeting/dub-audience";
import { applyLiveHostRole } from "@/lib/meeting/host-role-override";
import { roomOccupancy } from "@/lib/meeting/room-occupancy";
import { resolveVoicePreference } from "@/lib/voice/voice-preference";
import { useDubVoice, useSetDubVoice, useVoiceProfiles } from "@/hooks/use-voice-profiles";
import { buildMeetingEndedPath } from "@/lib/meeting/meeting-navigation";
import type { JoinMeetingResponseDto } from "@/types/meeting";
import type {
  AiSuggestionDto,
  ParticipantInfoDto,
  TranscriptSegmentDto,
  TranslationRoomStateDto,
  TranslationTextDto,
  VoiceOptionDto,
  VoiceCloneStateDto,
} from "@/types/realtime";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";

// Import Refactored Components
import {
  MeetingExitControl,
  MeetingStageTimer,
} from "@/components/rooms/live/meeting-top-bar";
import {
  MeetingControlBar,
  type MeetingLayoutMode,
} from "@/components/rooms/live/meeting-control-bar";
import { LiveKitMeetingStage } from "@/components/rooms/live/meeting-stage";
import { FilteredRoomAudio } from "@/components/rooms/live/filtered-room-audio";
import {
  TrackProcessorsController,
  writeTrackEffectsPreferences,
} from "@/hooks/use-track-processors";
import {
  JOIN_PREVIEW_KEY,
  readMeetingJoinState,
  readMeetingMediaPreferences,
} from "@/lib/meeting/meeting-join-state";
import {
  isResolvedSpeakLanguage,
  resolveListenLanguage,
  resolveSpeakLanguage,
} from "@/lib/language/participant-language-preference";
import { waitForReadyConnection } from "@/lib/meeting/wait-for-hub-connection";
import {
  MINI_MEETING_IDLE_WARNING_MS,
  evaluateIdleMeeting,
  canConnectToRoom,
  isIdleReaped,
  isRestoredMeetingStale,
  shouldConnectMeeting,
} from "@/lib/meeting/meeting-session-lifecycle";
import { LiveSubtitleOverlay } from "@/components/rooms/live/live-subtitle-overlay";
import {
  MeetingSidePanel,
  type SidePanelMode,
} from "@/components/rooms/live/side-panel/meeting-side-panel";
import {
  WaitingRoomView,
  StatePanel,
} from "@/components/rooms/live/waiting-room-view";
import {
  ReactionOverlay,
  type FloatingReaction,
} from "@/components/rooms/live/reaction-overlay";
import { LanguagePickerModal } from "@/components/rooms/live/language-picker-modal";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useUpdateUserSettings, useUserSettings } from "@/hooks/use-user-settings";
import {
  shouldAskForLanguages,
  suggestLanguageProfile,
} from "@/lib/language/language-profile";
import {
  fetchMyBreakoutAssignment,
} from "@/hooks/use-breakouts";
import type { BreakoutAssignmentRelay } from "@/types/breakout";
import { MeetingTimer } from "@/components/rooms/live/meeting-timer";
import { describeLiveKitError } from "@/lib/meeting/livekit-error";
import { describeNoiseSuppressionFailure } from "@/lib/meeting/noise-suppression-failure";
import { buildCatchUpTranscript } from "@/lib/transcript/transcript-catch-up";
import { useTranscriptByRoom, useTranscriptSegments } from "@/hooks/use-transcripts";

function getJoinLink(code: string) {
  if (typeof window === "undefined") return code;
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

/** Coarse on purpose — this only has to be finer than the warning window. */
const MINI_MEETING_IDLE_POLL_MS = 5 * 1000;

/**
 * The only way anything outside <LiveKitRoom> may change what this participant publishes.
 * Published by <LocalMediaController>; null whenever the provider tree is not mounted.
 */
type LocalMediaControl = {
  setMicrophoneEnabled: (enabled: boolean) => void;
  setCameraEnabled: (enabled: boolean) => void;
  /** Resolves to what the share ended up as, so the caller can reflect a cancelled prompt. */
  setScreenShareEnabled: (enabled: boolean) => Promise<boolean>;
};

const MINI_TRAY_INSET = bottomChromeInset(MIN_DOCK_SIZE);

export function PersistentMeetingSession({
  roomId,
  compact,
  onMeetingClosed,
}: {
  roomId: string;
  compact: boolean;
  onMeetingClosed: () => void;
}) {
  const router = useRouter();
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const user = useAuthStore((state) => state.user);
  const [meetingSession, setMeetingSession] =
    useState<JoinMeetingResponseDto | null>(null);
  // Declared up here only because the participants poll below has to see it. The reaper that
  // sets it, and the reasoning behind its 15-minute budget, live next to `canConnectMeeting`.
  const [idleDisconnected, setIdleDisconnected] = useState(false);
  // Seeded to 0 rather than Date.now(): a clock read during render is impure, and the reaper
  // effect stamps it the moment it starts watching anyway.
  const lastInteractionRef = useRef(0);
  const idleWarningShownRef = useRef(false);
  const markMeetingInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    idleWarningShownRef.current = false;
  }, []);
  const meetingIsIdleReaped = isIdleReaped({ compact, idleDisconnected });
  // What we last knew about the room, so a lookup we could not make holds the line instead of
  // ending the call. State rather than a ref because it decides what renders. Starts false: a
  // room id restored from sessionStorage that has never resolved must not connect on the
  // strength of not knowing.
  const [wasConnectable, setWasConnectable] = useState(false);

  const roomQuery = useTranslationRoom(roomId);
  // The LiveKit disconnect is only half of what an abandoned tab costs. This query polls every
  // 3s — 20 requests a minute against a gateway that rate-limits an IP at 100/min and answers
  // rejections with a bodyless 503 that reads exactly like an outage. An idle-reaped session
  // therefore stops asking too; letting it keep polling would swap a billing leak for a
  // request leak.
  const participantsQuery = useTranslationRoomParticipants(
    roomId,
    meetingSession !== null &&
      !meetingSession.isWaitingRoom &&
      !meetingIsIdleReaped,
  );
  const refetchParticipants = participantsQuery.refetch;
  const startRoom = useStartTranslationRoom();
  const resumeRoom = useResumeTranslationRoom();
  const stopTranslation = useStopTranslation();
  const endRoom = useEndTranslationRoom();
  const leaveRoom = useLeaveTranslationRoom(roomId);
  const setVoiceCloneConsent = useSetVoiceCloneConsent(roomId);
  const refreshDubVoice = useRefreshDubVoice(roomId);
  // WT-B. Read by everyone in the room so a guest's switch sits where the host left it; written
  // only by the room host, which is what the server enforces too.
  const { data: flashModeEnabled = false } = useFlashMode(roomId);
  const setFlashMode = useSetFlashMode(roomId);
  // The caller's OWN microphone, not the room's. No host check anywhere on this one, deliberately:
  // it changes how this person is transcribed and nobody else's audio, and the server agrees — see
  // IMicrophoneNoiseReductionService for why gating it would be the bug.
  const { data: noiseReductionMode = "off" } = useNoiseReduction(roomId);
  const setNoiseReduction = useSetNoiseReduction(roomId);
  const { mutateAsync: joinMeetingAsync, isPending: isMeetingJoining } =
    useJoinMeeting();
  const { mutateAsync: registerParticipantAsync } = useJoinTranslationRoomByCode();
  const participantRegisteredRef = useRef(false);

  const meetingJoinedRef = useRef(false);
  // Set by handleExit("end") so this client ignores its own TranslationRoomEnded broadcast and
  // keeps the navigation it chose (the room's ended page) instead of being replaced onto the
  // rooms list. A ref, not state: the broadcast handler is installed once per connection and
  // must read the current value, not the one closed over at subscribe time.
  const endedByMeRef = useRef(false);
  // Imperative handle onto the LiveKit local participant, published by <LocalMediaController>
  // (a child of <LiveKitRoom>, because this component RENDERS the provider and so cannot read
  // it). Anything that must actually change what is being published — the host's ForceMuted
  // broadcast, for instance — goes through here rather than through React state.
  const localMediaControlRef = useRef<LocalMediaControl | null>(null);

  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [sidePanelMode, setSidePanelMode] =
    useState<SidePanelMode>("transcript");
  // Whether THIS participant is publishing a screen share. Previously a MediaStream held
  // in state, which was only ever a local preview: the stage renders everyone's share —
  // including our own — from the subscribed LiveKit track, so a second local copy served no
  // purpose beyond making an unpublished share look like a working one.
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [meetingLayout, setMeetingLayout] = useState<MeetingLayoutMode>("auto");
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  // Local-only tile pin (WT-03) — clicking a tile toggles it; overridden by spotlight below.
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  // Host-forced spotlight, synced to every viewer via TranslationRoomHub.SpotlightChanged.
  const [spotlightedUserId, setSpotlightedUserId] = useState<string | null>(
    null,
  );
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
  const savedJoinConfig =
    typeof window !== "undefined"
      ? readMeetingJoinState(window.sessionStorage, roomId)
      : {};
  // Fail closed until the browser has loaded preferences for this exact room. This
  // prevents LiveKit from briefly publishing tracks with SSR/default `true` values.
  const [mediaPreferencesHydrated, setMediaPreferencesHydrated] = useState(false);
  // WT-303: these are NOT a second switch for the camera and microphone. Before LiveKit is
  // connected they are the connect-time INTENT that feeds <LiveKitRoom video/audio> (seeded
  // from readMeetingMediaPreferences, still fail-closed). From SignalConnected onwards they
  // are a MIRROR of localParticipant.isCameraEnabled/isMicrophoneEnabled, written only by
  // <LocalMediaController> below.
  //
  // They used to be the thing the mini window's buttons wrote, which is why those buttons
  // changed an icon and nothing else: @livekit/components-react@2.9.21 reads the audio/video
  // props exclusively inside its RoomEvent.SignalConnected handler (see useLiveKitRoom.ts in
  // the shipped sourcemap), so a prop change after connect publishes nothing. Every user-facing
  // toggle now goes through localParticipant — <TrackToggle> in the full bar, useTrackToggle in
  // the mini bar — and these values follow it.
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);

  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] =
    useState(false);
  const [backgroundBlurEnabled, setBackgroundBlurEnabled] = useState(false);

  useEffect(() => {
    const preferences = readMeetingMediaPreferences(
      window.sessionStorage,
      roomId,
    );
    // sessionStorage is an external browser source and must be applied after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCameraEnabled(preferences.cameraEnabled);
    setMicrophoneEnabled(preferences.microphoneEnabled);
    setNoiseSuppressionEnabled(preferences.noiseSuppressionEnabled);
    setBackgroundBlurEnabled(preferences.backgroundBlurEnabled);
    setMediaPreferencesHydrated(true);
  }, [roomId]);

  function handleToggleNoiseSuppression() {
    setNoiseSuppressionEnabled((current) => {
      const next = !current;
      writeTrackEffectsPreferences({ noiseSuppressionEnabled: next });
      return next;
    });
  }

  /**
   * Enhanced noise suppression did not start. Put the toggle back down and say WHY. WT-427.
   *
   * This used to take no argument, so useTrackProcessors' careful distinction between "threw
   * while attaching" and "attached but refused to enable" was discarded one function later and
   * everybody got the same line: "enhanced suppression will retry after reload."
   *
   * For an unentitled LiveKit project that sentence is false — reloading cannot change it — and a
   * user told to reload will reload, repeatedly, and report the feature as broken. Which is the
   * report we got.
   */
  const handleNoiseSuppressionError = useCallback((error: unknown) => {
    setNoiseSuppressionEnabled(false);
    const failure = describeNoiseSuppressionFailure(error);
    toast.error(failure.title, { description: failure.detail });
  }, []);

  function handleToggleBackgroundBlur() {
    setBackgroundBlurEnabled((current) => {
      const next = !current;
      writeTrackEffectsPreferences({ backgroundBlurEnabled: next });
      return next;
    });
  }

  /**
   * Blur could not attach. Put the toggle back down and say so.
   *
   * Without this the switch stayed lit over an unblurred camera and nothing anywhere reported a
   * fault — the "background blur không còn lên nữa" report had no console error to go with it
   * because the rejection was never caught. A toggle that lies about the camera is worse than
   * one that admits it failed.
   */
  const handleBackgroundBlurError = useCallback(() => {
    setBackgroundBlurEnabled(false);
    writeTrackEffectsPreferences({ backgroundBlurEnabled: false });
    toast.error("Background blur is unavailable.", {
      description:
        "Your camera is publishing unblurred. Reload the meeting to try again.",
    });
  }, []);

  const liveParticipants = useTranslationRoomStore(
    (state) => state.participants,
  );
  const transcriptSegments = useTranslationRoomStore(
    (state) => state.transcriptSegments,
  );
  const setLiveState = useTranslationRoomStore(
    (state) => state.setTranslationRoomState,
  );
  const addLiveParticipant = useTranslationRoomStore(
    (state) => state.addParticipant,
  );
  const removeLiveParticipant = useTranslationRoomStore(
    (state) => state.removeParticipant,
  );
  // WT-354: the roster the hub hands a joiner on arrival. Without it the live list could only
  // ever contain people who joined AFTER this client did.
  const setLiveParticipants = useTranslationRoomStore(
    (state) => state.setParticipants,
  );
  const raisedHands = useTranslationRoomStore((state) => state.raisedHands);
  const setHandRaisedInStore = useTranslationRoomStore(
    (state) => state.setHandRaised,
  );
  const updateParticipantSpeakLanguage = useTranslationRoomStore(
    (state) => state.updateParticipantSpeakLanguage,
  );
  const updateParticipantListenLanguage = useTranslationRoomStore(
    (state) => state.updateParticipantListenLanguage,
  );
  const { rightSidebarOpen, setLeftSidebarOpen, setRightSidebarOpen } =
    useUIStore();

  useEffect(() => {
    setLeftSidebarOpen(false);
  }, [setLeftSidebarOpen]);

  const addTranscriptSegment = useTranslationRoomStore(
    (state) => state.addTranscriptSegment,
  );
  const addOrMergeTranslationText = useTranslationRoomStore(
    (state) => state.addOrMergeTranslationText,
  );
  const addSuggestion = useTranslationRoomStore((state) => state.addSuggestion);
  const resetLiveRoom = useTranslationRoomStore((state) => state.reset);
  const queryClient = useQueryClient();
  const addChatMessage = useTranslationRoomStore(
    (state) => state.addChatMessage,
  );

  const room = roomQuery.data;
  // The room is OPEN — somebody took the meeting live. This is what TRANSCRIPTION follows and
  // the only thing it follows: a live meeting is transcribed whether or not anyone has started
  // translation.
  const meetingLive = room?.status === "in_progress";
  const meetingLiveRef = useRef(meetingLive);
  useEffect(() => {
    meetingLiveRef.current = meetingLive;
  }, [meetingLive]);
  // Translation is running exactly while the room has an ACTIVE translation session — the row
  // Start Translation opens and Stop closes.
  //
  // This used to be `status === "in_progress"` as well, i.e. the same flag as above, and that is
  // the defect. Opening a room has not started translation since WT-339, so from the moment a
  // meeting went live the control bar already showed Stop: the host was never offered Start, the
  // backend never opened a session, the audio routes never left READY, and translation could not
  // begin at all. One flag for two features also made "transcript only" impossible to express —
  // there was no state in which the meeting was live and translation was not.
  const translationSessionsQuery = useTranslationRoomSessions(roomId, meetingLive);
  const translationStarted = (translationSessionsQuery.data ?? []).some(
    (session) => session.status === "ACTIVE",
  );
  const refetchRoom = roomQuery.refetch;
  // Memoized so the identity is stable across renders where the query result has not
  // changed — the language-resolution memos below key off it.
  const apiParticipants = useMemo(
    () => participantsQuery.data ?? [],
    [participantsQuery.data],
  );
  const role = useWorkspaceRole();
  // WT-08: HostChanged overrides the room DTO's original host once it fires — the DTO itself
  // is never refetched just for this, so without this override the new host's host-only UI
  // would stay hidden until their next full room refetch.
  //
  // WT-234: this now only ever arrives from an explicit TransferHostAsync. A host who simply
  // goes offline leaves the room host-less rather than handing control to whoever joined
  // first, so nobody's UI flips to host without someone deliberately granting it.
  const [liveHostUserId, setLiveHostUserId] = useState<string | null>(null);
  const isHost = Boolean(
    (liveHostUserId
      ? user?.id === liveHostUserId
      : room?.isHost || (user?.id && room?.hostId === user.id)) ||
    role === "admin" ||
    role === "owner",
  );
  // WT-428: read inside the hub's ParticipantWaiting callback, which is registered once and
  // would otherwise close over the first render's value — where isHost is still false because
  // the room query has not resolved. Same reasoning as currentUserIdRef.
  const isHostRef = useRef(isHost);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  // Only the actual host may START the room. Workspace admins/owners get host-like
  // UI privileges (isHost) but the backend rejects a start from anyone whose id != room.hostId
  // with 403, so the auto-start below must gate on true host identity — not workspace role.
  const isRoomHost = Boolean(
    liveHostUserId
      ? user?.id === liveHostUserId
      : room?.isHost || (user?.id && room?.hostId === user.id),
  );

  // WT-04/WT-06: host controls + recording state, synced live via TranslationRoomHub's
  // RoomLockChanged/RecordingStateChanged broadcasts (see the SignalR effect below).
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // WT-272: mute-on-entry is READ from the room's persisted setting, which the join response
  // already carries, and only overridden once this host actually toggles it (null = untouched).
  // It used to be plain `useState(false)`, so the flyout always opened claiming "off" no matter
  // how the room was configured; the host's first tap then re-sent the value the room already
  // had and visibly did nothing. Derived rather than synced in an effect so there is no
  // cascading render.
  //
  // There is no equivalent field for the lock — see the PR's BACKEND note: JoinMeetingResponse
  // does not report it, so `isRoomLocked` can still only be learned from a RoomLockChanged
  // broadcast that fires after somebody toggles it.
  const [muteOnEntryOverride, setMuteOnEntryOverride] = useState<boolean | null>(
    null,
  );
  const muteOnEntryEnabled =
    muteOnEntryOverride ?? Boolean(meetingSession?.muteOnEntry);
  const setLockMutation = useSetRoomLock(roomId);
  const setMuteOnEntryMutation = useSetMuteOnEntry(roomId);
  const setRecordingMutation = useSetRecording(roomId);

  // Breakout rooms (scoped-down): `breakoutState` describes THIS viewer's own current
  // assignment/connection (drives the LiveKit token swap + top-bar countdown chip below).
  // The host-facing breakout controls are gone with the feature; these handlers stay only so a
  // client already in a breakout still follows a BreakoutsEnded back to the main room.
  // `breakoutState` is per-viewer — it describes THIS viewer's own current
  // last BreakoutsEnded one, regardless of whether THIS viewer has an assignment (e.g. the
  // host, who stays in the main room) — drives the host-controls flyout's active state.
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
  // WT-357: the session as it is right now, for handlers registered once on the hub connection.
  // Distinct from mainMeetingSessionRef above, which deliberately freezes at the MAIN room's
  // session while a breakout is active — a handler asking "do I already hold a live session"
  // must be told about the session it actually holds.
  const currentMeetingSessionRef = useRef<JoinMeetingResponseDto | null>(null);
  useEffect(() => {
    currentMeetingSessionRef.current = meetingSession;
  }, [meetingSession]);

  // WT-08: application-level reconnect state — the hub connection itself already
  // auto-reconnects at the transport level (see createHubConnection/withAutomaticReconnect),
  // this just reflects that + LiveKit's own reconnect cycle in a single user-facing banner.
  const [isSignalRReconnecting, setIsSignalRReconnecting] = useState(false);
  const [isLiveKitReconnecting, setIsLiveKitReconnecting] = useState(false);
  const isReconnecting = isSignalRReconnecting || isLiveKitReconnecting;
  const mergedParticipants = liveParticipants.length
    ? mergeParticipants(apiParticipants, liveParticipants)
    : apiParticipants;
  // WT-358: the People panel prints role verbatim from the API list, and the live presence
  // payload carries no role — so without this a Transfer Host left the old host labelled Host
  // until the page was reloaded. The server has written both rows by now, so a later refetch
  // agrees with this rather than reverting it.
  const participants = applyLiveHostRole(mergedParticipants, liveHostUserId);
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);
  // WT-274: the same seat rule the room detail page and the meetings list read. This used to
  // count "everyone not left/removed/kicked", which includes the lobby and people who merely
  // disconnected — a fourth, private definition of presence in a codebase that now has one.
  const activeCount = roomOccupancy({
    capacity: room?.maxParticipants,
    participants,
  }).seatCount;
  const joinLink = room?.translationRoomCode
    ? getJoinLink(room.translationRoomCode)
    : "";
  // Store only ever holds OTHER users' raised hands (RaiseHand broadcasts via
  // OthersInGroup) — merge in this viewer's own local toggle so badges render
  // consistently everywhere (tiles, people panel) regardless of whose row it is.
  const raisedHandUserIds = useMemo(() => {
    const ids = new Set(raisedHands);
    if (handRaised && user?.id) ids.add(user.id);
    return ids;
  }, [raisedHands, handRaised, user]);
  const liveSegments = useMemo(
    () => dedupeTranscriptSegments(transcriptSegments),
    [transcriptSegments],
  );
  // Transcript history persists whether or not translation is currently running:
  // "Stop Translation" only halts new live captions (LiveSubtitleOverlay below); it must
  // NOT wipe what was already transcribed. Segments stay in the store until the room is
  // left.
  // What someone who joined late missed, in front of what they can hear for themselves.
  //
  // `transcriptSegments` only ever holds what arrived over SignalR since THIS browser
  // connected, so joining twenty minutes in showed an empty panel with nothing to indicate
  // that twenty minutes had happened. The segments were never lost — TranscriptService has
  // them and the room detail page already reads them — they were simply never handed to the
  // live panel. Merged on segment id, since the two sources key the same utterance
  // differently and merging on the wrong one duplicates every overlapping line.
  const savedTranscriptQuery = useTranscriptByRoom(roomId);
  const savedSegmentsQuery = useTranscriptSegments(savedTranscriptQuery.data?.id);
  const catchUp = useMemo(
    () => buildCatchUpTranscript(savedSegmentsQuery.data?.items ?? [], liveSegments),
    [savedSegmentsQuery.data, liveSegments],
  );
  const panelSegments = catchUp.segments;

  // Boolean(room) was the defect. `room` comes from a REST query, so a network failure — the
  // exact moment LiveKit is trying hardest to recover — made it undefined, which read as "the
  // meeting is over" and flipped connect to false. That runs room.disconnect() and aborts the
  // reconnection: "Abort connection attempt due to user initiated disconnect". LiveKit was not
  // failing to reconnect. We were killing it. Absence is not evidence; a 404 is.
  const canConnectMeeting = canConnectToRoom({
    status: room?.status,
    lookupErrorStatus: (roomQuery.error as { response?: { status?: number } } | null)
      ?.response?.status,
    wasConnectable,
  });

  // Adjusted during render rather than in an effect: React re-renders immediately with the new
  // value instead of painting one frame with the stale one, and it converges — once the two
  // agree nothing further is set. The same pattern the search dialog uses to reset itself.
  if (wasConnectable !== canConnectMeeting) {
    setWasConnectable(canConnectMeeting);
  }

  // WT-306 + billing: the mini window's idle reaper.
  //
  // A minimised session used to hold LiveKit open for as long as the tab existed, because
  // `connect` was `Boolean(token)` and a token, once issued, never goes away. LiveKit Cloud
  // bills connection-minutes by wall-clock presence, and the AI ingress bot counts a connected
  // human before it will idle-release itself, so one forgotten tab kept billing two or more
  // participants overnight and defeated the bot's own idle release.
  //
  // The budget itself lives in @/lib/meeting-session-lifecycle, next to the reasoning for it.
  // A warning toast a minute out offers a one-click reprieve, so the disconnect is never silent
  // to a person who is actually present.
  //
  // It only ever runs while `compact` is true. The full-size view is untouched — see the reset
  // effect on `compact` below.
  //
  // Reaping releases the LiveKit connection AND the 3s participants poll (see the query near
  // the top). It deliberately leaves the two SignalR hubs up: they are one long-lived socket
  // each rather than a poll, tearing them down would wipe the live transcript store via
  // resetLiveRoom(), and the translation hub is what delivers TranslationRoomEnded — the signal
  // that retires this session altogether.

  // Returning to the full meeting surface is itself an unambiguous "I am here": clear the idle
  // disconnect so <LiveKitRoom> reconnects, and never reap while the meeting owns the screen.
  useEffect(() => {
    if (compact) return;
    markMeetingInteraction();
    queueMicrotask(() => setIdleDisconnected(false));
  }, [compact, markMeetingInteraction]);

  useEffect(() => {
    if (!compact || idleDisconnected) return;

    markMeetingInteraction();

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
      "focus",
    ];
    for (const event of events) {
      window.addEventListener(event, markMeetingInteraction, { passive: true });
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") markMeetingInteraction();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = window.setInterval(() => {
      const action = evaluateIdleMeeting({
        now: Date.now(),
        lastInteractionAt: lastInteractionRef.current,
        alreadyWarned: idleWarningShownRef.current,
      });
      if (action === "disconnect") {
        setIdleDisconnected(true);
        toast.info("Meeting disconnected after 15 minutes minimised.", {
          description: "Reopen the meeting to rejoin.",
        });
        return;
      }
      if (action === "warn") {
        idleWarningShownRef.current = true;
        toast.warning("Still in the meeting?", {
          description:
            "The minimised meeting will disconnect in a minute to stop using your minutes.",
          duration: MINI_MEETING_IDLE_WARNING_MS,
          action: {
            label: "Stay connected",
            onClick: markMeetingInteraction,
          },
        });
      }
    }, MINI_MEETING_IDLE_POLL_MS);

    return () => {
      window.clearInterval(tick);
      for (const event of events) {
        window.removeEventListener(event, markMeetingInteraction);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [compact, idleDisconnected, markMeetingInteraction]);

  // WT-306: `activeRoomId` now survives a reload, so it can name a room that has since ended,
  // been cancelled, or that this account can no longer read. A restored id must not mount a
  // mini window onto a dead room — retire the session instead.
  const meetingRoomIsGone = isRestoredMeetingStale({
    compact,
    roomLoadFailed: roomQuery.isError,
    hasRoom: Boolean(roomQuery.data),
    canConnectRoom: canConnectMeeting,
  });
  useEffect(() => {
    if (!meetingRoomIsGone) return;
    onMeetingClosed();
  }, [meetingRoomIsGone, onMeetingClosed]);

  const displayName =
    savedJoinConfig.displayName ||
    user?.fullName ||
    user?.email ||
    "Participant";
  const roomSourceLanguage = room?.sourceLanguage || "auto";
  // In-session picks only — the media bar's speak/listen dropdowns and the language picker
  // modal. NOT seeded from session storage any more: that is one source among several, and
  // resolving them all in one place (see @/lib/participant-language-preference) is what
  // stops a room default from outranking a choice the user actually made. Starting at null
  // also keeps the first client render identical to SSR, which reading sessionStorage in a
  // useState initializer did not.
  const [speakLanguageOverride, setSpeakLanguageState] = useState<string | null>(
    null,
  );
  const [listenLanguageOverride, setListenLanguageState] = useState<
    string | null
  >(null);
  // This viewer's own row as the SERVER has it — written by the REST join with whatever they
  // picked on the join screen / setup modal. It is the authority whenever this tab has no
  // session storage for this room: direct navigation to /room/{id}, a reload, a second tab.
  // Without it the client had nothing but the room default to fall back on, and a room
  // created as [en, vi] (WT-297) then handed everyone a listen language of "vi".
  // WT-420: what the clone pipeline is doing to this participant's microphone. Nothing in a
  // meeting reported this before — the worker logged it, and a whole test session concluded
  // cloning was broken while it was logging score 1.0.
  const [cloneCaptureState, setCloneCaptureState] = useState<VoiceCloneStateDto | null>(null);
  // See VoiceCloneStateChanged: how long a clip refusal owns the status panel.
  const cloneRejectionHoldUntilRef = useRef(0);
  // Read inside the hub callback, which is registered once and would otherwise close over the
  // user id from the first render.
  const currentUserIdRef = useRef<string | undefined>(undefined);

  const currentUserId = user?.id;

  // In an effect, not during render: assigning a ref while rendering is a tearing hazard, and
  // this one exists purely so the hub callback below — registered once — does not close over the
  // user id from the first render.
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);
  const myParticipantRecord = useMemo(
    () =>
      currentUserId
        ? apiParticipants.find(
            (participant) => participant.userId === currentUserId,
          )
        : undefined,
    [apiParticipants, currentUserId],
  );
  const languageSources = useMemo(
    () => ({
      speak: {
        pick: speakLanguageOverride,
        saved: savedJoinConfig.speakLanguage,
        participant: myParticipantRecord?.speakLanguage,
      },
      listen: {
        pick: listenLanguageOverride,
        saved: savedJoinConfig.listenLanguage,
        participant: myParticipantRecord?.listenLanguage,
      },
    }),
    [
      speakLanguageOverride,
      listenLanguageOverride,
      savedJoinConfig.speakLanguage,
      savedJoinConfig.listenLanguage,
      myParticipantRecord,
    ],
  );
  // Spoken (source) language — a live, user-changeable choice via the media bar's
  // speak-language dropdown + TranslationRoomHub.SetSpeakLanguage. May still be the
  // "auto" sentinel for the first moments of a cold direct navigation, while both the room
  // and the participants query are in flight; isResolvedSpeakLanguage guards every place
  // that would otherwise send it onward.
  const sourceLanguage = resolveSpeakLanguage(languageSources.speak, room);

  // Whether anything this participant says is actually dubbed for somebody. Routes exist per
  // (speaker, listener) pair and only where the languages differ, so in a room where nobody
  // listens in another language there is no route out of them and Voice Clone cannot apply.
  // See lib/meeting/dub-audience.ts for the production case this came from.
  const voiceCloneHasAudience = useMemo(
    () => hasDubAudience(sourceLanguage, user?.id, participants),
    [sourceLanguage, user?.id, participants],
  );
  // Listen (output) language — see the media bar's language dropdown +
  // TranslationRoomHub.SetListenLanguage. Always concrete: a listener with no language has
  // nothing to receive.
  // sourceLanguage passed as the third argument: with nothing chosen, a participant hears the
  // language they speak rather than the room's other target. A default must not manufacture a
  // split — that is what made the merged picker invisible, because it reads a mismatched pair as
  // a deliberate choice.
  const listenLanguage = resolveListenLanguage(languageSources.listen, room, sourceLanguage);
  const targetLanguage = listenLanguage;

  // Read inside the TranslationTextReceived handler below instead of closing over
  // targetLanguage directly — the gateway broadcasts every listener's target language to
  // the whole room group (see AiResultConsumerService.ConsumeTranslationResultsAsync), so
  // without this filter a Vietnamese listener would render every other participant's
  // Chinese/Japanese/English translation bubbles too ("loạn ngôn ngữ"). A ref keeps the
  // filter reading the latest value without forcing the SignalR effect to reconnect on
  // every language change.
  /**
   * Tell a participant when the host starts translation, and what they have to do about it.
   *
   * A member has no Start button, so from their seat translation beginning is invisible: the
   * transcript simply stays empty until they happen to open Settings and pick the two languages.
   * That is the whole of "tưởng không dịch được" — nothing was broken, nobody had been asked.
   *
   * Fires on the TRANSITION into started, not on the state, so re-renders and the five-second
   * session poll cannot repeat it. Hosts are excluded: they pressed the button.
   */
  const announcedTranslationRef = useRef(false);
  useEffect(() => {
    if (!translationStarted) {
      announcedTranslationRef.current = false;
      return;
    }
    if (isRoomHost || announcedTranslationRef.current) return;
    announcedTranslationRef.current = true;

    playNotificationCue("translation-started");

    const needsLanguages = !sourceLanguage || !targetLanguage;
    toast.info("The host started translation.", {
      description: needsLanguages
        ? "Choose the language you speak and the one you want to hear — the control is next to Stop Translation."
        : `You are speaking ${getLanguageName(sourceLanguage)} and hearing ${getLanguageName(targetLanguage)}.`,
      duration: needsLanguages ? 12000 : 6000,
    });
  }, [translationStarted, isRoomHost, sourceLanguage, targetLanguage]);

  const targetLanguageRef = useRef(targetLanguage);
  useEffect(() => {
    targetLanguageRef.current = targetLanguage;
  }, [targetLanguage]);

  // Live handle to the translation-room hub connection — set inside the SignalR effect
  // below, read here so a dropdown pick can call SetListenLanguage without tearing down
  // and reconnecting the whole hub connection (which would wipe transcriptSegments/chat
  // history via resetLiveRoom() and re-broadcast ParticipantJoined for no reason).
  const translationConnectionRef = useRef<
    import("@microsoft/signalr").HubConnection | null
  >(null);

  // Publish the REAL mic state to the roster, whenever it changes and however it changed.
  //
  // Keyed on `microphoneEnabled` on purpose: LocalMediaController mirrors that state from the
  // LiveKit track itself (TrackMuted/TrackUnmuted), so a mute that arrived by any route — the
  // button, ForceMuted, the browser revoking the device — flows through here identically. This
  // is the missing publisher for the hub's ToggleMute: without it ParticipantMuteChanged never
  // fired and every roster showed the join-time icon forever.
  useEffect(() => {
    const connection = translationConnectionRef.current;
    if (!roomId || connection?.state !== HubConnectionState.Connected) return;
    connection.invoke("ToggleMute", roomId, !microphoneEnabled).catch(() => {
      // The roster icon is a courtesy; a failed sync must not surface as a meeting error.
    });
  }, [microphoneEnabled, roomId]);

  // Last listen language actually sent to the hub — skips a redundant SetListenLanguage
  // call when this effect re-runs without the value having changed.
  const appliedListenLanguageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!listenLanguage || appliedListenLanguageRef.current === listenLanguage)
      return;
    appliedListenLanguageRef.current = listenLanguage;

    let cancelled = false;
    (async () => {
      // The hub connection may still be mid-handshake (e.g. this is the freshly-resolved
      // room default, arriving a beat after the SignalR connection kicked off) — retry
      // briefly rather than silently dropping the language on the floor.
      //
      // WT-434: through the shared helper, whose cancellation survives the sleep. The
      // inlined loop here checked `cancelled` only before sleeping, so a value superseded
      // mid-wait was still sent — 300ms after mount, over the newer one.
      const connection = await waitForReadyConnection({
        getConnection: () => translationConnectionRef.current,
        isReady: (hub) => hub.state === HubConnectionState.Connected,
        isCancelled: () => cancelled,
      });
      if (!connection || cancelled) return;
      try {
        await connection.invoke("SetListenLanguage", roomId, listenLanguage);
      } catch {
        toast.error("Could not update listen language.");
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

  // Also the reconcile path for a join that had to go out before the participant record or
  // the room DTO had loaded: the moment either resolves sourceLanguage to a real language
  // this fires and overwrites whatever placeholder JoinTranslationRoom wrote into
  // translationRoom:{id}:speak_languages.
  useEffect(() => {
    if (
      !isResolvedSpeakLanguage(sourceLanguage) ||
      appliedSpeakLanguageRef.current === sourceLanguage
    )
      return;
    appliedSpeakLanguageRef.current = sourceLanguage;

    let cancelled = false;
    (async () => {
      // WT-434: see the listen effect above — this is the side whose stale resend put
      // speak=en on a Vietnamese speaker's row and fed STT the wrong hint.
      const connection = await waitForReadyConnection({
        getConnection: () => translationConnectionRef.current,
        isReady: (hub) => hub.state === HubConnectionState.Connected,
        isCancelled: () => cancelled,
      });
      if (!connection || cancelled) return;
      try {
        await connection.invoke("SetSpeakLanguage", roomId, sourceLanguage);
      } catch {
        toast.error("Could not update speak language.");
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
  const [voiceSelection, setVoiceSelection] = useState<{
    language: string;
    voiceId: string | null;
  } | null>(null);
  const [voiceCatalogState, setVoiceCatalogState] = useState<{
    language: string;
    items: VoiceOptionDto[];
  } | null>(null);
  const voiceCatalog = useMemo(
    () =>
      voiceCatalogState?.language === targetLanguage ? voiceCatalogState.items : [],
    [voiceCatalogState, targetLanguage],
  );

  // An in-room pick always wins; only when this user has made no choice for this language
  // does their saved Voice Profiles default apply. Derived rather than copied into state on
  // join, so switching listen language re-resolves on its own — see resolveVoicePreference
  // for the precedence rule and its tests.
  const { data: savedVoiceProfiles } = useVoiceProfiles();
  const voicePreference = useMemo(
    () =>
      resolveVoicePreference(
        voiceSelection,
        targetLanguage,
        savedVoiceProfiles,
        voiceCatalog,
      ),
    [voiceSelection, targetLanguage, savedVoiceProfiles, voiceCatalog],
  );

  // Voices are language-specific (Cartesia's own voice table), so switching listen
  // language must both clear any voice pick made for the PREVIOUS language (it may not
  // even exist for the new one) and refetch the picker's option list for the new one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const connection = await waitForReadyConnection({
        getConnection: () => translationConnectionRef.current,
        isReady: (hub) => hub.state === HubConnectionState.Connected,
        isCancelled: () => cancelled,
      });
      if (!connection || cancelled) return;
      try {
        const catalog = await connection.invoke<VoiceOptionDto[]>(
          "GetVoiceCatalog",
          targetLanguage,
        );
        if (!cancelled) {
          setVoiceCatalogState({
            language: targetLanguage,
            items: catalog ?? [],
          });
        }
      } catch {
        // Non-critical — the picker just shows no extra options; the automatic
        // per-speaker default voice keeps working regardless.
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
      // WT-434: same stale-resend hazard as the language effects — a voice pick superseded
      // during the handshake wait must not be sent late over the newer one.
      const connection = await waitForReadyConnection({
        getConnection: () => translationConnectionRef.current,
        isReady: (hub) => hub.state === HubConnectionState.Connected,
        isCancelled: () => cancelled,
      });
      if (!connection || cancelled) return;
      try {
        await connection.invoke(
          "SetVoicePreference",
          roomId,
          voicePreference || "",
        );
      } catch {
        toast.error("Could not update voice preference.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [voicePreference, roomId]);

  // Choices for the media bar's language dropdown: the room's spoken language plus every
  // configured target — always includes whatever is currently selected so a value coming
  // from an older/ad-hoc join config never renders as a dropdown option with no match.
  // Languages this participant added themselves, beyond the ones the room was configured
  // with. The room's configuration is what gets OFFERED, not a limit on who may speak: it
  // was chosen by whoever booked the meeting, before they knew who would turn up. Somebody
  // who speaks Korean in a Vietnamese/Japanese room adds Korean and is understood.
  //
  // Kept here rather than only in the current selection, so a language stays in the menu
  // after they switch off it — otherwise adding one, trying another, and going back would
  // mean finding it in the full list again every time.
  const [addedLanguages, setAddedLanguages] = useState<string[]>([]);

  const availableListenLanguages = useMemo(() => {
    const codes = new Set<string>();
    if (room?.sourceLanguage)
      codes.add(normalizeLanguageCode(room.sourceLanguage));
    room?.targetLanguages?.forEach((language) =>
      codes.add(normalizeLanguageCode(language)),
    );
    addedLanguages.forEach((language) => codes.add(language));
    codes.add(normalizeLanguageCode(targetLanguage));
    return Array.from(codes);
  }, [room, targetLanguage, addedLanguages]);

  /** Remember a pick that the room itself does not offer, so it stays in the menu. */
  const rememberAddedLanguage = useCallback(
    (language: string) => {
      const configured = new Set<string>();
      if (room?.sourceLanguage) configured.add(normalizeLanguageCode(room.sourceLanguage));
      room?.targetLanguages?.forEach((code) =>
        configured.add(normalizeLanguageCode(code)),
      );
      if (configured.has(language)) return;
      setAddedLanguages((current) =>
        current.includes(language) ? current : [...current, language],
      );
    },
    [room],
  );

  // Every OTHER participant's speak language, normalized — lets FilteredRoomAudio mute a
  // real participant's raw microphone track for a listener whose chosen language differs
  // from that speaker's, so the listener hears ONLY the AI interpreter dub instead of the
  // original layered underneath it. speakLanguage/targetLanguage can each independently be
  // a bare code ("vi") or locale-tagged ("vi-VN") depending on where the value came from —
  // normalizeLanguageCode is what makes the comparison correct regardless of which form
  // either side happens to be in. This file keeps its own copy (below) rather than using
  // @/lib/languages': audio routing must not start depending on the language registry, so
  // that an unlisted language degrades to "no dub" rather than to an unmuted raw mic.
  const speakerLanguageByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const participant of participants) {
      if (participant.speakLanguage) {
        map[participant.userId] = normalizeLanguageCode(
          participant.speakLanguage,
        );
      }
    }
    return map;
  }, [participants]);
  const targetLanguageNormalized = normalizeLanguageCode(targetLanguage);

  /**
   * Persist an in-meeting language pick so it survives a reload.
   *
   * `roomId` is stamped in deliberately: readMeetingJoinState discards the whole blob unless
   * its roomId matches this room, so a pick written into an empty/foreign config — the case
   * whenever someone reached the room without going through the join screen — used to be
   * dropped on the next read, and the participant fell back a tier.
   */
  const rememberJoinPreference = useCallback((patch: Record<string, string>) => {
    try {
      const config = JSON.parse(
        window.sessionStorage.getItem(JOIN_PREVIEW_KEY) || "{}",
      );
      window.sessionStorage.setItem(
        JOIN_PREVIEW_KEY,
        JSON.stringify({ ...config, ...patch, roomId }),
      );
    } catch {
      // Non-critical — worst case the picked language doesn't survive a page refresh.
    }
  }, [roomId]);

  // Memoised because the remembered-language effect depends on them: redefined every render,
  // they would restart that effect on every render for no reason.
  const handleChangeListenLanguage = useCallback((language: string) => {
    const normalizedLanguage = normalizeLanguageCode(language);
    setListenLanguageState(normalizedLanguage);
    rememberAddedLanguage(normalizedLanguage);
    rememberJoinPreference({ listenLanguage: normalizedLanguage });
  }, [rememberJoinPreference, rememberAddedLanguage]);

  const handleChangeSpeakLanguage = useCallback((language: string) => {
    const normalizedLanguage = normalizeLanguageCode(language);
    setSpeakLanguageState(normalizedLanguage);
    rememberAddedLanguage(normalizedLanguage);
    rememberJoinPreference({ speakLanguage: normalizedLanguage });
  }, [rememberJoinPreference, rememberAddedLanguage]);

  /** voiceId "" (or falsy) clears the preference, back to the automatic per-speaker default. */
  function handleChangeVoicePreference(voiceId: string) {
    setVoiceSelection({
      language: targetLanguage,
      voiceId: voiceId || null,
    });
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

  // HOW THIS PARTICIPANT SOUNDS — the opposite direction from voicePreference above.
  //
  // Server-backed, unlike voiceCloneEnabled beside it: this one is a user setting in AuthService
  // rather than a per-room flag, so it survives a refresh and is worth reading back.
  const { data: dubVoice } = useDubVoice();
  const setDubVoice = useSetDubVoice();

  // Only profiles with a provider voice behind them. An uploaded recording has none until it has
  // been cloned, and offering it would let somebody pick a voice that cannot be used — the same
  // silent nothing WT-396 exists to remove.
  const ownVoiceProfiles = useMemo(
    () =>
      (savedVoiceProfiles ?? [])
        .filter((profile) => profile.providerVoiceId && profile.isActive)
        .map((profile) => ({
          id: profile.id,
          name: profile.displayName || "My voice",
          voiceId: profile.providerVoiceId!,
        })),
    [savedVoiceProfiles],
  );

  /**
   * Pick the voice this participant is dubbed in, or null to be cloned live in the meeting.
   *
   * TWO CALLS, AND THE SECOND ONE IS THE POINT. The setting is written to AuthService, which
   * knows nothing about rooms; the AI pipeline learns it only from an AUDIO_ROUTES_UPDATED
   * payload that TranslationRoomService builds. Without the refresh the change is correct
   * everywhere except the meeting the person is standing in, until somebody joins or translation
   * is restarted and a publish happens for some unrelated reason.
   */
  function handleChangeDubVoice(voiceId: string | null) {
    setDubVoice.mutate(
      // A voice of your own is accepted without a language; a catalogue pick is validated
      // against one — see VoiceProfileService.IsVoiceChoosableByAsync.
      {
        voiceId,
        language: ownVoiceProfiles.some((profile) => profile.voiceId === voiceId)
          ? null
          : sourceLanguage,
      },
      {
        onSuccess: async () => {
          try {
            await refreshDubVoice.mutateAsync();
          } catch {
            // The choice IS saved; only its arrival in this meeting is late. Saying so beats
            // both silence and an error that implies the setting did not stick.
            toast.error("Saved, but this meeting may keep the old voice until you rejoin.");
            return;
          }
          toast.success(voiceId ? "Saved. You will be dubbed in this voice." : "Back to cloning your voice live.");
        },
        onError: () => toast.error("Could not change the voice you are dubbed in."),
      },
    );
  }

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

  // Off unless this listener has asked for it.
  //
  // It defaulted ON, so every join started synthesising into the room before anyone had
  // chosen anything — and because the dub takes a moment to come up, what you actually
  // experienced was silence, then a stranger's voice arriving unannounced. Turning a
  // synthetic voice on in someone's ears is a choice they should make, not one they should
  // have to undo.
  //
  // The saved preference still wins, so a listener who turned it on keeps it on across
  // refreshes and rejoins — the default only governs someone who has never said.
  //
  // Voice off now means "hear the real voices", not "hear nothing": see FilteredRoomAudio.
  const [voiceEnabled, setVoiceEnabledState] = useState<boolean>(
    savedJoinConfig.voiceEnabled ?? false,
  );

  function handleChangeVoiceEnabled(enabled: boolean) {
    setVoiceEnabledState(enabled);
    try {
      const config = JSON.parse(
        window.sessionStorage.getItem("warptalk.join.preview") || "{}",
      );
      window.sessionStorage.setItem(
        "warptalk.join.preview",
        JSON.stringify({ ...config, voiceEnabled: enabled }),
      );
    } catch {
      // Non-critical — worst case the picked mode doesn't survive a page refresh.
    }
  }

  useRegisterAssistantContext(
    room && !compact
      ? {
          pageType: "in_meeting",
          entityId: room.id,
          workspaceId: activeWorkspaceId ?? undefined,
          snapshot: {
            title: room.title,
            status: "live",
            participantCount: String(activeCount),
            sourceLanguage: roomSourceLanguage,
          },
        }
      : null,
  );

  const retryMeetingConnection = useCallback(() => {
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
        setMeetingError(
          error instanceof Error
            ? error.message
            : "Could not connect to the LiveKit meeting.",
        );
      });
  }, [
    canConnectMeeting,
    displayName,
    joinMeetingAsync,
    room,
    setMicrophoneEnabled,
  ]);

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
          setMeetingError(
            error instanceof Error
              ? error.message
              : "Could not connect to the LiveKit meeting.",
          );
        });
    });
  }, [canConnectMeeting, displayName, joinMeetingAsync, room?.id]);

  /**
   * Make sure this person exists as a PARTICIPANT of the translation room, not only as a
   * LiveKit peer.
   *
   * There are two joins and they are not the same thing:
   *
   *   POST /meetings/rooms/{id}/join     LiveKit token — puts you in the video grid
   *   POST /translation-rooms/join       creates your participant row
   *
   * The effect above calls only the first. The second used to happen exclusively on the
   * join-by-code path, i.e. the lobby — so anyone who arrived by clicking a notification or a
   * link went straight to /live with media and no participant row. The visible symptoms were a
   * People panel reading 1 while two faces were on screen, and Leave answering
   * "Participant not found." The invisible one is worse: no participant row means no audio
   * route, so that person was never transcribed OR translated, in a product whose entire
   * purpose is translating them.
   *
   * Safe to call unconditionally. JoinTranslationRoomAsync finds an existing participant and
   * updates it rather than inserting a second, and its capacity check explicitly does not
   * count a repeated join from someone who already holds a seat.
   *
   * A failure here is logged and not surfaced: the meeting itself is working, and a toast about
   * a registration the user never asked for would be noise they cannot act on. The roster
   * refetch below is what makes the fix visible.
   */
  useEffect(() => {
    if (!room?.translationRoomCode || !canConnectMeeting) return;
    if (participantRegisteredRef.current) return;
    participantRegisteredRef.current = true;

    void registerParticipantAsync({
      translationRoomCode: room.translationRoomCode,
      displayName,
      speakLanguage: sourceLanguage,
      listenLanguage: targetLanguage,
      // The device state this session actually has, so the roster does not claim a camera is on
      // for somebody who joined with it off.
      cameraEnabled,
      microphoneEnabled,
      speakerEnabled: true,
    })
      .then(() => refetchParticipants())
      .catch((error: unknown) => {
        // Reset so a later render can try again — a transient failure here costs this person
        // their translation for the whole meeting, which is too expensive to give up on once.
        participantRegisteredRef.current = false;
        console.warn("translation_room_participant_registration_failed", error);
      });
  }, [
    room?.translationRoomCode,
    canConnectMeeting,
    displayName,
    sourceLanguage,
    targetLanguage,
    cameraEnabled,
    microphoneEnabled,
    registerParticipantAsync,
    refetchParticipants,
  ]);

  /**
   * A soft cue when somebody new arrives.
   *
   * Keyed on a RISE in the seat count rather than on the roster changing, because the roster
   * object is replaced on every poll and by every mute, camera and language change — binding to
   * it would beep continuously through an ordinary meeting.
   *
   * The first count after mount is recorded silently: everyone already in the room when you
   * joined is not "somebody arriving", and announcing them would greet you with a burst of
   * beeps for a meeting already in progress.
   */
  const seatCountRef = useRef<number | null>(null);
  useEffect(() => {
    const seated = apiParticipants.filter((participant) =>
      holdsSeat(participant.status),
    ).length;

    const previous = seatCountRef.current;
    seatCountRef.current = seated;
    if (previous === null) return;
    if (seated > previous) playNotificationCue("participant-joined");
  }, [apiParticipants]);

  const userSettingsQuery = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const userSettings = userSettingsQuery.data;

  const languagesAreRemembered = !shouldAskForLanguages({
    settingsSpeak: userSettings?.defaultSpeakLanguage,
    settingsListen: userSettings?.defaultListenLanguage,
  });

  // What this user chose to SPEAK in past meetings, most recent first. Only fetched when we
  // are actually going to ask — for everyone who has answered once, this costs nothing.
  const languageHistoryQuery = useRoomHistory(
    userSettingsQuery.isSuccess && !languagesAreRemembered
      ? (activeWorkspaceId ?? null)
      : null,
  );
  const historySpeak = useMemo(() => {
    const rooms = languageHistoryQuery.data?.rooms ?? [];
    return rooms
      .flatMap((endedRoom) =>
        endedRoom.participants.filter(
          (participant) => participant.userId === user?.id,
        ),
      )
      .map((participant) => participant.speakLanguage)
      .filter((code): code is string => Boolean(code));
  }, [languageHistoryQuery.data, user?.id]);

  const suggestedLanguages = useMemo(
    () =>
      suggestLanguageProfile({
        settingsSpeak: userSettings?.defaultSpeakLanguage,
        settingsListen: userSettings?.defaultListenLanguage,
        historySpeak,
        locales: typeof navigator !== "undefined" ? navigator.languages : [],
        roomSpeak: isResolvedSpeakLanguage(sourceLanguage) ? sourceLanguage : null,
        roomListen: listenLanguage,
        available: availableListenLanguages,
      }),
    [
      userSettings?.defaultSpeakLanguage,
      userSettings?.defaultListenLanguage,
      historySpeak,
      sourceLanguage,
      listenLanguage,
      availableListenLanguages,
    ],
  );

  useEffect(() => {
    if (languagePickerShownRef.current) return;
    // ...and not already asked earlier in this tab, for this room.
    //
    // The ref alone is per COMPONENT INSTANCE, so anything that remounts this session asks
    // again: pressing "Return to meeting" from the mini dock re-enters /live, the instance is
    // rebuilt, the ref is a fresh `false`, and the language modal reappears over a meeting the
    // user is already in — "bấm return to meeting nó ra cái service modal tiếp". sessionStorage
    // is the right scope for the same reason the active meeting uses it: per tab, cleared when
    // the tab closes, never shared with a second tab that legitimately needs its own answer.
    if (wasLanguagePickerShown(roomId)) {
      languagePickerShownRef.current = true;
      return;
    }
    if (!meetingSession?.token) return;
    // Wait for the answer we may already have. Opening before the settings resolve is how a
    // remembered preference still gets asked for.
    if (!userSettingsQuery.isSuccess) return;

    languagePickerShownRef.current = true;
    markLanguagePickerShown(roomId);

    if (languagesAreRemembered) {
      // Applied silently. Being asked again is the product forgetting, which is the whole
      // complaint — the answer is on file, so use it.
      handleChangeSpeakLanguage(suggestedLanguages.speak);
      handleChangeListenLanguage(suggestedLanguages.listen);
      return;
    }

    queueMicrotask(() => setShowLanguagePicker(true));
  }, [
    meetingSession,
    userSettingsQuery.isSuccess,
    languagesAreRemembered,
    suggestedLanguages,
    handleChangeSpeakLanguage,
    handleChangeListenLanguage,
  ]);

  function handleConfirmLanguagePicker(speak: string, listen: string) {
    handleChangeSpeakLanguage(speak);
    handleChangeListenLanguage(listen);
    // Remembered, so the next meeting does not ask. Fire-and-forget: failing to save a
    // preference must not interrupt joining a call — the worst case is being asked once more.
    updateUserSettings.mutate({
      defaultSpeakLanguage: speak,
      defaultListenLanguage: listen,
    });
  }

  useEffect(() => {
    if (!roomId) return;
    resetLiveRoom();
    const connection = createHubConnection("/hubs/translation-room");
    translationConnectionRef.current = connection;

    connection.on(
      "TranslationRoomStarted",
      (state: TranslationRoomStateDto) => {
        // The first STT result can arrive before the REST refetch below resolves. Flip the
        // live gate synchronously so a participant who joined before the host does not drop
        // those first transcript/translation events.
        meetingLiveRef.current = true;
        setLiveState(state);
        // Start Translation is room-wide, so every client — not just the host's — has to learn
        // that a translation session is now open. This is the same fact the session poll would
        // notice seconds later; asking now is what makes the switch land at the same moment for
        // everyone, including FilteredRoomAudio's choice of dub over raw microphone.
        void queryClient.invalidateQueries({ queryKey: sessionsKey(roomId) });
        void refetchRoom().then(() => {
          // WT-357: only a client that does NOT already hold a live media session may re-join
          // here. retryMeetingConnection begins with setMeetingSession(null), which drops
          // `hasToken` and therefore <LiveKitRoom connect> — useLiveKitRoom then runs
          // room.disconnect(), stopping the camera and microphone tracks this participant is
          // publishing. That is what the report describes as "pressing Start Translation turns
          // the camera and mic off and the UI hitches": the devices were not toggled, the whole
          // media connection was torn down and rebuilt, for everyone in the room at once,
          // because the gateway broadcasts TranslationRoomStarted room-wide.
          //
          // The call still earns its place for the clients it was written for: somebody sitting
          // in the lobby holds an empty token (JoinMeetingResponse.IsWaitingRoom), and the room
          // starting is exactly when they need a real one. Everyone else already has one — a
          // translation session opening changes nothing about a LiveKit grant — and learns the
          // news from setLiveState, the sessions invalidation and the room refetch above.
          const session = currentMeetingSessionRef.current;
          if (session?.token && !session.isWaitingRoom) return;
          retryMeetingConnectionRef.current();
        });
      },
    );
    // Stop Translation, room-wide. The meeting is NOT over and the transcript keeps arriving —
    // deliberately nothing here touches meetingLiveRef. Only the answer to "is translation
    // running" changes, and that is read from the session list, so re-read it: for the host it
    // turns the button back into Start, and for everyone it releases FilteredRoomAudio's
    // preference for an interpreter dub that has stopped being produced.
    connection.on("TranslationStopped", () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey(roomId) });
    });
    // WT-354: who was already here. The hub sends this to the caller alone, once, immediately
    // after JoinTranslationRoom — every other participant event describes a CHANGE, so without a
    // starting point the live roster of a late joiner began empty and no later event could fill
    // it in. A host joining a meeting in progress saw a People panel containing only themselves.
    //
    // Replaces rather than merges: this IS the room as the server sees it, and anything already
    // in the store for this room predates the connection that just opened.
    connection.on("ParticipantRoster", (roster: ParticipantInfoDto[]) => {
      setLiveParticipants(roster);
      void refetchParticipants();
    });
    connection.on("ParticipantJoined", (participant: ParticipantInfoDto) => {
      addLiveParticipant(participant);
      void refetchParticipants();
    });
    // The other half of a wire that was never connected. The hub has carried ToggleMute /
    // ParticipantMuteChanged for months, and the store has carried updateParticipantMute — with
    // zero callers on either side. So the roster's mic icon showed whatever was true at join
    // (always unmuted) for the rest of the meeting: "e tắt mic a Tuấn nma icon vẫn là có". The
    // publisher for our own state is the effect on microphoneEnabled below.
    connection.on("ParticipantMuteChanged", (userId: string, isMuted: boolean) => {
      useTranslationRoomStore.getState().updateParticipantMute(userId, isMuted);
    });
    connection.on("ParticipantLeft", (userId: string) => {
      removeLiveParticipant(userId);
      void refetchParticipants();
    });
    connection.on(
      "TranscriptSegmentReceived",
      (segment: TranscriptSegmentDto) => {
        if (!meetingLiveRef.current) return;
        addTranscriptSegment({
          ...segment,
          speakerName: resolveTranscriptSpeakerName(
            segment,
            participantsRef.current,
          ),
        });
      },
    );
    connection.on(
      "TranslationTextReceived",
      (translation: TranslationTextDto) => {
        if (!meetingLiveRef.current) return;
        // Every language is kept, filed under its own key by addOrMergeTranslationText, and the
        // transcript panel renders the one matching this viewer's listen language.
        //
        // WT-371 Bug 4: this used to drop anything that did not match targetLanguageRef at the
        // instant of arrival, which made the transcript depend on WHEN the reader's listen
        // language finished resolving. On a cold navigation the room default stands in until the
        // participant row arrives, so the first lines of a meeting were admitted in the wrong
        // language and kept it — "English → Vietnamese" above "Vietnamese → English" in one
        // panel. Changing the language mid-meeting had the same effect from the other side:
        // everything already on screen stayed behind.
        //
        // Nothing extra crosses the network — the gateway fans all of them to the room group
        // regardless — and "loạn ngôn ngữ" is now prevented where it belongs, at render, by a
        // reader who knows their own language.
        addOrMergeTranslationText(translation);
      },
    );
    connection.on("AiSuggestionReceived", (suggestion: AiSuggestionDto) => {
      // Same gate the transcript handlers use: a suggestion belongs to a live segment, so
      // it has nothing to attach to once translation has stopped.
      if (!meetingLiveRef.current) return;
      // ...and the same language question the TranslationTextReceived handler above already
      // asks. Suggestions are fanned out to the whole room, so without this a viewer reading
      // in English was shown a suggestion written in Vietnamese because somebody else in the
      // room was listening in Vietnamese. Preferred rather than filtered — see addSuggestion.
      addSuggestion(suggestion, targetLanguageRef.current);
    });
    connection.on("TranslationRoomEnded", () => {
      void refetchRoom();
      // The client that pressed "End meeting" is inside handleExit, on its way to the room's
      // ended page. This broadcast goes to the whole group INCLUDING that client, so without
      // this guard the replace() below raced handleExit's push() and could land the host back
      // on the rooms list — exactly the last screen of the demo, decided by whichever
      // navigation happened to resolve second.
      if (endedByMeRef.current) return;
      toast.info("This meeting has ended.");
      onMeetingClosed();
      // WT-449: the same wrap-up page the host lands on, not the rooms list.
      //
      // Ending a meeting used to send the host to /ended — recording, summary, artifacts and
      // the feedback dialog — and everybody ELSE to a list of rooms. So the one screen built to
      // close a meeting out was shown only to the person who least needed asking, and every
      // other participant's meeting simply vanished mid-sentence. The artifacts on that page
      // are readable by every participant, and the feedback being collected is theirs.
      router.replace(buildMeetingEndedPath(activeWorkspaceSlug, roomId));
    });

    // The host's Approve in the People panel is a REST call (PATCH .../participants/{id}/admit)
    // that flipped the row and invalidated the HOST's participants query — nothing reached the
    // admitted user at all. Their own participantsQuery is deliberately disabled while
    // isWaitingRoom, and their roomQuery has no refetchInterval, so they sat on the "Waiting for
    // Host" spinner until they happened to press Refresh Status. It only looked like it worked
    // because a subsequent Start Translation fires TranslationRoomStarted, which re-joins them;
    // admit-without-a-later-start left them stuck.
    //
    // TranslationRoomParticipantService now publishes ParticipantAdmitted on the same Redis
    // channel RoomEnded/RoomStarted use, and the Gateway relays it to the room group. Every
    // waiting client is already in that group (JoinTranslationRoom runs regardless of waiting
    // state), so the admitted one re-runs its join here without touching anything.
    connection.on("ParticipantAdmitted", (admittedUserId: string) => {
      if (!user?.id || admittedUserId !== user.id) return;
      void refetchRoom().then(() => {
        retryMeetingConnectionRef.current();
      });
    });

    // WT-428 (Linear): the knock. Broadcast to the whole room group; only the HOST acts on it —
    // a toast naming who is at the door, plus an immediate roster refetch so the People panel's
    // Approve button appears now rather than on the next 3s poll. Non-hosts ignore it: they can
    // neither admit nor deny, and a toast they cannot act on is noise.
    connection.on(
      "ParticipantWaiting",
      (waitingUserId: string, waitingDisplayName: string) => {
        if (!isHostRef.current || waitingUserId === currentUserIdRef.current) return;
        toast.info(
          `${waitingDisplayName || "Someone"} is waiting to join — approve them from the People panel.`,
        );
        void queryClient.invalidateQueries({
          queryKey: ["translationRooms", roomId, "participants"],
        });
      },
    );

    connection.on("HandRaised", (userId: string, isRaised: boolean) => {
      setHandRaisedInStore(userId, isRaised);
    });
    connection.on("ReactionReceived", (userId: string, emoji: string) => {
      reactionIdRef.current += 1;
      setReactions((current) => [
        ...current,
        { id: `reaction-${reactionIdRef.current}`, emoji },
      ]);
    });
    connection.on("SpotlightChanged", (targetUserId: string, on: boolean) => {
      setSpotlightedUserId(on ? targetUserId : null);
    });
    // Live speak-language change from ANOTHER participant — keeps speakerLanguageByUserId
    // (and therefore FilteredRoomAudio's mute-real-mic-if-different-language logic) correct
    // without waiting for a refetchParticipants() round-trip.
    connection.on(
      "ParticipantSpeakLanguageChanged",
      (userId: string, speakLanguage: string) => {
        updateParticipantSpeakLanguage(userId, speakLanguage);
      },
    );
    // The listen half. The hub has broadcast this ("ParticipantLanguageChanged" — the event
    // predates the speak/listen split, hence the unqualified name) for as long as the speak
    // one, and nothing here listened. hasDubAudience() reads the OTHERS' listen languages, so
    // without this handler the Voice panel's "Nobody is listening in another language" line
    // was frozen at whatever the participants query returned at join — in the 16 Aug test it
    // sat on "nobody is listening" through every language change the partner made, while the
    // backend had already regenerated the routes. The one fact that would have told the team
    // the mesh was fine was the one fact that never updated.
    connection.on(
      "ParticipantLanguageChanged",
      (userId: string, listenLanguage: string) => {
        updateParticipantListenLanguage(userId, listenLanguage);
      },
    );

    // WT-420. Broadcast to the whole room because the payload names its own speaker and the
    // gateway has no userId -> connection map; only the state about YOU is kept, because the only
    // person who can act on "your microphone is too quiet" is you.
    connection.on("VoiceCloneStateChanged", (state: VoiceCloneStateDto) => {
      if (!state?.speakerId || state.speakerId !== currentUserIdRef.current) return;
      // A rejection must survive long enough to be read. The worker's sliding window keeps
      // capturing after it refuses a clip, so the very next `capturing` event — often under a
      // second later — replaced the refusal on screen. What the speaker saw was the bar filling
      // to 20s, snapping back and filling again, with the reason flashing by unreadably: "thu
      // xong 1 lần 20s r, r revert lại thu lại tiếp". The refusal holds the panel for a few
      // seconds; the capture that continues underneath catches the display up afterwards.
      if (state.reason?.startsWith("clip_rejected:")) {
        cloneRejectionHoldUntilRef.current = Date.now() + 6_000;
        setCloneCaptureState(state);
        return;
      }
      if (state.reason === "capturing" && Date.now() < cloneRejectionHoldUntilRef.current) {
        return;
      }
      setCloneCaptureState(state);
    });

    // WT-04
    connection.on("RoomLockChanged", (locked: boolean) => {
      setIsRoomLocked(locked);
    });
    connection.on("ForceMuted", () => {
      // Must reach the published track, not just React state — state is a mirror now, and a
      // "host muted you" that only repainted an icon was the same lie WT-303 reports.
      localMediaControlRef.current?.setMicrophoneEnabled(false);
      setMicrophoneEnabled(false);
      toast.error("You were muted by the host.");
    });
    // WT-06
    connection.on("RecordingStateChanged", (recording: boolean) => {
      // Announce the transition, not the state. This fires on every participant, including the
      // host who pressed the button — they get their own confirmation from the mutation, so
      // only tell the people who did not ask for it.
      setIsRecording((wasRecording) => {
        if (recording !== wasRecording) {
          toast[recording ? "info" : "success"](
            recording
              ? "This meeting is now being recorded."
              : "Recording stopped.",
          );
        }
        return recording;
      });
    });
    // WT-08
    connection.on("HostChanged", (newHostUserId: string) => {
      setLiveHostUserId(newHostUserId);
    });

    // BR-159: Backend initiated disconnections
    connection.on("ForceDisconnected", (reason?: string) => {
      toast.error(
        reason ||
          "This room has been forcibly closed or you were disconnected from another device.",
      );
      onMeetingClosed();
      // WT-348, same reason as handleExit — and it matters more here. A push left /live one Back
      // press away for someone the SERVER just removed: they would land straight back on the
      // page that reconnects them, to be disconnected again. An involuntary exit is the last
      // navigation that should stay in history.
      router.replace(`/${activeWorkspaceSlug || "workspace"}/rooms`);
    });

    connection.on("ParticipantKicked", () => {
      toast.error("You have been permanently removed from this room.");
      onMeetingClosed();
      router.replace(`/${activeWorkspaceSlug || "workspace"}/rooms`);
    });

    // Breakout rooms (scoped-down) — BreakoutsStarted/BreakoutsEnded are relayed by
    // BreakoutsService through TranslationRoomRedisSubscriberService on the Gateway.
    // Assignments carries no LiveKit
    // token (see BreakoutAssignmentRelayDto's doc on the backend) — an assigned client mints
    // its own via GET .../breakouts/my-assignment, then swaps meetingSession.token to move
    // the already-mounted <LiveKitRoom> from the main room to the sub-room in place (see
    // useLiveKitRoom's connect/token effect: changing `token` while `connect` stays true
    // just calls room.connect() again with the new token, no remount needed).
    connection.on(
      "BreakoutsStarted",
      (
        assignments: BreakoutAssignmentRelay[] | null,
        durationSeconds: number | null,
        startedAt: string | null,
      ) => {
        const mine = user?.id
          ? (assignments ?? []).find((a) => a.userId === user.id)
          : undefined;
        if (!mine) return;

        setBreakoutState({
          active: true,
          label: mine.label,
          startedAt,
          durationSeconds,
        });
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
            setBreakoutState({
              active: false,
              label: null,
              startedAt: null,
              durationSeconds: null,
            });
          });
      },
    );
    connection.on("BreakoutsEnded", () => {
      if (!breakoutActiveRef.current) return;

      setBreakoutState({
        active: false,
        label: null,
        startedAt: null,
        durationSeconds: null,
      });
      if (mainMeetingSessionRef.current) {
        setMeetingSession(mainMeetingSessionRef.current);
      }
      toast.success("Breakout rooms ended — you're back in the main room.");
    });

    let cancelled = false;
    const retryDelays = [0, 500, 1500, 3000];

    const wait = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));
    const joinCurrentRoom = () =>
      // targetLanguageRef.current (not the closed-over targetLanguage) so a language
      // picked via the dropdown before a reconnect (e.g. after a network drop) is what
      // gets rejoined with, and so this effect's dependency array below doesn't need
      // targetLanguage — including it there would tear down and recreate this whole
      // connection (wiping transcriptSegments/chat via resetLiveRoom()) on every language
      // change instead of just calling SetListenLanguage.
      connection
        .invoke(
          "JoinTranslationRoom",
          roomId,
          displayName,
          // Never the "auto" sentinel. The hub writes this straight into
          // translationRoom:{id}:speak_languages, where a literal "auto" makes
          // _language_hint_for_stt return None and lets STT free-run — which is how a
          // Vietnamese speaker's transcript came back tagged "en". "auto" is not a choice
          // anyone can make (neither the picker modal nor the media bar offers it), so
          // sending it asserted a decision the user never took. When nothing is known yet
          // we send "" — the same "no hint" STT already understands, but without the fake
          // decision — and the SetSpeakLanguage effect above reconciles the instant a real
          // language resolves.
          isResolvedSpeakLanguage(sourceLanguageRef.current)
            ? sourceLanguageRef.current
            : "",
          targetLanguageRef.current,
        )
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
            await connection.invoke(
              "SetListenLanguage",
              roomId,
              currentListenLanguage,
            );
          } catch {
            // Best-effort — the client's own local listenLanguage state is unaffected.
          }
        }

        const currentVoicePreference = appliedVoicePreferenceRef.current;
        if (currentVoicePreference) {
          try {
            await connection.invoke(
              "SetVoicePreference",
              roomId,
              currentVoicePreference,
            );
          } catch {
            // Best-effort — the client's own local voicePreference state is unaffected.
          }
        }

        const currentSpeakLanguage = appliedSpeakLanguageRef.current;
        if (currentSpeakLanguage) {
          try {
            await connection.invoke(
              "SetSpeakLanguage",
              roomId,
              currentSpeakLanguage,
            );
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
  }, [
    addLiveParticipant,
    addOrMergeTranslationText,
    addSuggestion,
    addTranscriptSegment,
    refetchParticipants,
    refetchRoom,
    removeLiveParticipant,
    setLiveParticipants,
    resetLiveRoom,
    displayName,
    roomId,
    setLiveState,
    setHandRaisedInStore,
    updateParticipantSpeakLanguage,
    user?.id,
    onMeetingClosed,
  ]);

  // WT-248 removed the auto-start that used to live here. WT-183 had added it because a room
  // stayed "Waiting" in the Meetings list while the host was already inside — but starting to
  // record and translate a conversation without being asked is not a display fix, and the
  // report was that translation began before anyone chose to begin it.
  //
  // The status it was papering over is handled where it actually goes wrong: entering a room
  // nobody has started now lands in the lobby (WT-232), where "Start meeting" calls the same
  // endpoint this effect did. A host who reaches the live surface directly still has the
  // control bar's "Start Translation", which runs the identical mutation via
  // handleStartWarptalk below. Either way a person decides, and the room leaves "Waiting"
  // because someone started it.

  useEffect(() => {
    if (!roomId) return;
    const chatConnection = createHubConnection("/api/v1/meetings/chat-hub");
    chatConnection.on("ChatMessageHidden", (messageId: string) => {
      useTranslationRoomStore.getState().hideChatMessage(messageId);
    });

    chatConnection.on(
      "ChatMessageReceived",
      (message: import("@/types/realtime").ChatMessageDto) => {
        addChatMessage(message);
      },
    );

    // The backend has always broadcast this the moment a WarpBot request starts being
    // worked on; nothing bound it, so the seconds an OpenAI tool-calling loop takes looked
    // exactly like being ignored. The realtime-event contract had it listed as "emitted,
    // never handled" with the note that the panel showed its own optimistic state — it did
    // not, and there was no such state anywhere in the chat panel.
    chatConnection.on("ChatAssistantResponsePending", () => {
      // A second, confirming trigger. The chat panel already sets this optimistically the
      // moment somebody sends an @agent mention, because waiting for this round trip leaves
      // the send looking ignored — and when the answer is fast, this signal arrives and is
      // cleared in the same breath, so nothing is ever seen. The panel owns the deadline.
      useTranslationRoomStore.getState().setAssistantState("thinking");
    });

    let cancelled = false;
    const retryDelays = [0, 500, 1500, 3000];
    const wait = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));
    const joinChatRoom = () =>
      chatConnection.invoke("JoinMeetingRoom", roomId).catch(() => undefined);
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
      // Backfill what the socket missed. The chat panel loads its history ONCE and lives on
      // ChatMessageReceived after that, so anything broadcast while the hub was down — a
      // WarpBot answer, somebody else's message — was lost to this client for good. The
      // store merges rather than replaces, so live messages that arrived first survive.
      void queryClient.invalidateQueries({ queryKey: ["meeting-chat", roomId] });
    });

    void startAndJoinChat();

    return () => {
      cancelled = true;
      // Leaving the room while WarpBot is thinking must not carry the state into the next
      // one — the answer, if it comes, belongs to a conversation this client has left.
      useTranslationRoomStore.getState().setAssistantState("idle");
      chatConnection.stop().catch(() => undefined);
    };
  }, [roomId, addChatMessage, queryClient]);

  // A second camera capture lived here, opened straight off navigator.mediaDevices in parallel
  // with LiveKit's own. It fed `localStream`, which fed a <video ref={localVideoRef}> in
  // meeting-stage that had already been deleted — so it lit the camera LED, held a second
  // capture of the same device, and rendered nothing. Removed rather than reconnected:
  // LiveKit's camera publication is the picture, and it is the only capture that should exist.

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    toast.success(`${label} copied.`);
  }

  async function handleExit(action: "leave" | "end") {
    try {
      if (action === "end") {
        // Claim the end BEFORE the mutation: TranslationRoomService publishes RoomEnded to
        // Redis inside EndTranslationRoomAsync, so the TranslationRoomEnded broadcast can reach
        // this same client before `await endRoom.mutateAsync` even resolves. Setting the flag
        // afterwards would lose the race the flag exists to settle.
        endedByMeRef.current = true;
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
      onMeetingClosed();
      // WT-348: replace, not push. Leaving used to push the rooms list on top of /live, so the
      // live URL stayed one Back press away — and /live's own guard (WT-366) only turns away
      // rooms that have ENDED. Leave a meeting the others are still in, press Back, and the page
      // happily called openMeeting() again: language modal, fresh LiveKit connection, back in the
      // call you just walked out of. Replacing the entry means Back goes where the user came
      // from, which is the room, not into it.
      router.replace(
        action === "end"
          ? buildMeetingEndedPath(activeWorkspaceSlug, roomId)
          : `/${activeWorkspaceSlug || "workspace"}/rooms`,
      );
    } catch (error) {
      // The end never landed, so this client is not the one that ended the room after all —
      // let a later TranslationRoomEnded broadcast redirect it like any other participant.
      endedByMeRef.current = false;
      toast.error(
        error instanceof Error ? error.message : "Could not leave the room.",
      );
    }
  }

  // Published through LiveKit, not captured locally.
  //
  // This used to call getDisplayMedia() itself, keep the MediaStream in React state and
  // announce "Screen sharing started" — while never publishing anything. The sharer saw
  // their own screen; everyone else saw them as a participant with the camera off, which
  // is exactly what was reported. The stage already subscribes to Track.Source.ScreenShare,
  // so only the publish half was missing.
  async function handleToggleScreenShare() {
    const control = localMediaControlRef.current;
    if (!control) {
      toast.error("The meeting is not connected yet.");
      return;
    }

    const next = !isScreenSharing;
    const applied = await control.setScreenShareEnabled(next);
    setIsScreenSharing(applied);
    if (applied) toast.success("Screen sharing started.");
    else if (!next) toast.success("Screen sharing stopped.");
  }

  // Opening the ROOM and starting TRANSLATION are two different acts since WT-339, and this
  // button is the second one.
  //
  // It used to send an already-live room to /start (`room.status === "paused" ? resumeRoom :
  // startRoom`), which since WT-339 is the endpoint that deliberately does NOT start
  // translation: it takes the routes to READY and stops, because it no longer opens a
  // TranslationRoomSession. So pressing Start Translation in a live meeting did nothing
  // whatsoever — no session, no BROADCASTING routes, no translation — and reported success.
  // /resume is the only path that opens a session, and it accepts IN_PROGRESS precisely so it
  // can serve as Start.
  //
  // A room that is not open yet is still opened first. That is normally the lobby's job
  // (WT-232), but this button is reachable without going through it, and failing with "invalid
  // state" would be a worse answer than doing the obvious thing.
  async function handleStartWarptalk() {
    if (!room?.id) return;
    try {
      if (room.status !== "in_progress" && room.status !== "paused") {
        await startRoom.mutateAsync(room.id);
      }
      await resumeRoom.mutateAsync(room.id);
      setSidePanelMode("transcript");
      setRightSidebarOpen(true);
      toast.success("WarpTalk realtime translation started.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start translation.",
      );
    }
  }

  // Stops TRANSLATION. The meeting keeps running and so does the transcript.
  //
  // This used to pause the ROOM, which the AI workers read as "ignore this room's microphone" —
  // so stopping translation also stopped transcription, and a room that had once translated
  // could never get back to transcript-only. Pausing the whole meeting is still a real thing to
  // want; it is simply not what this button says.
  function handleStopWarptalk() {
    if (!room?.id) return;
    stopTranslation.mutate(room.id, {
      onSuccess: () => {
        toast.success("Translation stopped. The transcript keeps running.");
      },
      onError: (error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to stop translation.",
        );
      },
    });
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

  // WT-246 added a minimise button, whose whole implementation was to navigate away — the
  // session lives in the app layout and keeps its LiveKit connection across routes, so the
  // floating panel appears by itself the moment the route is not the live one. The button is
  // gone at the owner's request; leaving the room route still produces the panel, which is
  // what happened before the button existed.

  function handleToggleSpotlight(userId: string) {
    const connection = translationConnectionRef.current;
    if (connection?.state !== HubConnectionState.Connected) return;
    const next = spotlightedUserId !== userId;
    connection
      .invoke("SpotlightParticipant", roomId, userId, next)
      .catch(() => {
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
    const previous = muteOnEntryOverride;
    setMuteOnEntryOverride(enabled); // optimistic — not broadcast live, see MeetingRoomService.SetMuteOnEntryAsync
    setMuteOnEntryMutation.mutate(enabled, {
      onError: () => {
        setMuteOnEntryOverride(previous);
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

  // RECORDING IS NEVER STARTED FOR YOU.
  //
  // It used to start on its own for the room's host, on the argument that a summary's timestamps
  // need a recording to jump to. That reasoning was about the product's convenience and the cost
  // was somebody else's: every meeting was recorded whether or not anyone had decided to record
  // it, and the only notice was a toast that appeared after the fact. Consent to being recorded
  // is not something a default gets to assume, and the meeting record is perfectly usable without
  // it — the transcript and the summary come from the audio pipeline, not from the egress file.
  //
  // The button in the host controls is now the only way a recording starts (handleToggleRecording
  // below). Do not reintroduce an effect here: an automatic start is indistinguishable, from the
  // outside, from a deliberate one.

  // WT-06: recording state is confirmed via the RecordingStateChanged broadcast (see
  // MeetingRoomService.SetRecordingAsync) — no optimistic local update needed.
  function handleToggleRecording() {
    const action = isRecording ? "stop" : "start";
    setRecordingMutation.mutate(action, {
      onSuccess: (state) => {
        setIsRecording(state.recording);
        toast.success(
          state.recording ? "Recording started." : "Recording stopped.",
        );
      },
      onError: () =>
        toast.error(
          action === "start"
            ? "Could not start recording."
            : "Could not stop recording.",
        ),
    });
  }

  if (roomQuery.isLoading) {
    return (
      <StatePanel
        title="Loading room..."
        description="Fetching room details."
      />
    );
  }

  if (meetingSession?.isWaitingRoom) {
    return <WaitingRoomView onRetry={retryMeetingConnection} />;
  }

  if (roomQuery.isError || !room) {
    return (
      <StatePanel
        icon={<WarningCircle className="h-8 w-8" />}
        title="Room unavailable"
        description="The room does not exist or your account cannot access it."
      />
    );
  }

  if (!mediaPreferencesHydrated) {
    return (
      <StatePanel
        title="Preparing devices..."
        description="Applying your camera and microphone choices."
      />
    );
  }

  // A token, once issued, is never withdrawn, so `Boolean(token)` alone made `connect` true
  // forever — that is what kept a minimised tab publishing to LiveKit (and kept the AI ingress
  // bot counting a human) until the browser was closed. Presence is now conditional on the room
  // still being joinable — canConnectMeeting, the same gate the initial join uses, so a
  // persisted-but-ended room can never reconnect — and on the minimised session not having been
  // idle-reaped. Flipping this to false makes useLiveKitRoom run room.disconnect()
  // ("disconnecting because connect is false"); flipping it back reconnects and re-applies the
  // audio/video props via SignalConnected.
  const shouldConnectLiveKit = shouldConnectMeeting({
    hasToken: Boolean(meetingSession?.token),
    canConnectRoom: canConnectMeeting,
    idleReaped: meetingIsIdleReaped,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-ink font-sans selection:bg-surface-3">
      <LiveKitRoom
        video={cameraEnabled}
        audio={
          microphoneEnabled
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                voiceIsolation: true,
                autoGainControl: true,
                channelCount: 1,
              }
            : false
        }
        token={meetingSession?.token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(
          "localhost",
          typeof window !== "undefined"
            ? window.location.hostname
            : "localhost",
        )}
        connect={shouldConnectLiveKit}
        // `meetingError` was declared, passed to the stage, and gated the Retry button — and
        // nothing ever called setMeetingError. So every failure to connect rendered as
        // "Waiting for LiveKit" with no message and no retry, indistinguishable from a slow
        // join. This is the wire that was missing.
        onError={(error) => setMeetingError(describeLiveKitError(error))}
        onConnected={() => setMeetingError(null)}
        data-lk-theme="default"
        className="flex min-h-0 flex-1 flex-col !bg-transparent !text-ink [&_.lk-participant-placeholder]:!bg-surface-1 [&_.lk-participant-placeholder_svg]:!text-ink-muted [&_.lk-participant-tile]:!bg-surface-1"
      >
        <LiveKitReconnectWatcher
          onReconnecting={() => setIsLiveKitReconnecting(true)}
          onReconnected={() => setIsLiveKitReconnecting(false)}
        />

        <LocalMediaController
          controlRef={localMediaControlRef}
          onCameraEnabledChange={setCameraEnabled}
          onMicrophoneEnabledChange={setMicrophoneEnabled}
        />

        <FilteredRoomAudio
          targetLanguageNormalized={targetLanguageNormalized}
          speakerLanguageByUserId={speakerLanguageByUserId}
          voicePreference={voicePreference}
          voiceEnabled={voiceEnabled}
          // The language routing exists to prefer a dub over the original, so it must follow
          // the dub. Passing "the room is open" here is what this component's own doc warns
          // against — it muted mismatched speakers for a pipeline that had not been started.
          translationActive={translationStarted}
          localUserId={user?.id}
        />
        <TrackProcessorsController
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          backgroundBlurEnabled={backgroundBlurEnabled}
          onNoiseSuppressionError={handleNoiseSuppressionError}
          onBackgroundBlurError={handleBackgroundBlurError}
        />

        {!compact && isReconnecting ? (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Reconnecting…
          </div>
        ) : null}

        {/* The full-width red bar that used to sit here is gone. It repeated, in the loudest
            possible form and for the entire meeting, something the REC badge on the camera view
            already says — and it said it by taking a strip off the top of every participant's
            screen. Consent is a moment, not a permanent state: people are told once, by toast,
            when recording starts, and the badge is the standing reminder. */}

        {compact ? (
          // The whole window drags, not just a strip across the top. That strip existed
          // because it had to: it was the only thing carrying [data-mini-drag-handle], so it
          // could never be hidden or the window could never be moved again. The dock now
          // ignores pointer-downs that land on a control, which frees the chrome to be as
          // small as it likes.
          <div
            data-mini-meeting
            data-mini-drag-handle
            className="group relative h-full min-h-0 w-full cursor-grab overflow-hidden bg-surface-1 active:cursor-grabbing"
          >
            <LiveKitMeetingStage
              fallbackName={user?.fullName || user?.email || room.title}
              isJoining={isMeetingJoining}
              error={meetingError}
              // WT-246 asks to still see everyone while minimised. "auto" gives one large tile
              // with the rest as thumbnails, which at this size leaves the others unreadable —
              // a grid fits more faces into the same 360x220.
              layoutMode="grid"
              pinnedUserId={pinnedUserId}
              onPinParticipant={handlePinParticipant}
              spotlightedUserId={spotlightedUserId}
              raisedHandUserIds={raisedHandUserIds}
              // The tray is centred and nearly the full width of this window, so without this
              // the participant's name renders behind it.
              bottomInset={MINI_TRAY_INSET}
              onRetry={retryMeetingConnection}
            />

            {/* Status, and nothing else, at rest. What stood here was a full-width bar at 65%
                black — over a camera-off tile that the stage already renders as bg-white/95, so
                it was black on white in an app that is white throughout. Between it and the bar
                at the bottom, 92 of the window's 388 pixels were permanently chrome. */}
            <div className="pointer-events-none absolute left-2.5 top-2.5 z-30 flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur-md">
              <span
                className={`size-1.5 rounded-full ${isReconnecting ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`}
              />
              {isReconnecting ? (
                "Reconnecting"
              ) : (
                <MeetingTimer
                  createdAt={room.createdAt}
                  endedAt={room.endedAt}
                  className="!text-ink"
                />
              )}
            </div>

            {/* The room title is the one thing here that is not needed at a glance — you
                minimised this window, so you know which meeting it is. It comes back when the
                pointer does. */}
            <p className="pointer-events-none absolute inset-x-2.5 top-10 z-30 truncate text-[11px] font-medium text-ink opacity-0 drop-shadow-[0_1px_4px_rgba(255,255,255,0.9)] transition-opacity group-hover:opacity-100">
              {room.title}
            </p>

            {subtitlesEnabled ? (
              <div className="absolute inset-x-2 bottom-16 z-30 h-14 overflow-hidden">
                <LiveSubtitleOverlay
                  // Captions are the TRANSCRIPT in the caption lane (carrying the translation
                  // when there is one), so they follow the meeting being live, not translation.
                  enabled={meetingLive && subtitlesEnabled}
                />
              </div>
            ) : null}

            {idleDisconnected ? (
              <div
                data-mini-meeting-idle
                className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/80 px-5 text-center text-white"
              >
                <p className="text-[13px] font-semibold">Meeting disconnected</p>
                <p className="max-w-60 text-[11px] leading-relaxed text-white/70">
                  This minimised meeting was idle for 15 minutes, so it stopped
                  using your meeting minutes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    markMeetingInteraction();
                    setIdleDisconnected(false);
                  }}
                  className="mt-1 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-900 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  Rejoin meeting
                </button>
              </div>
            ) : null}

            {/*
              WT-303: these used to be plain setState buttons feeding <LiveKitRoom audio/video>,
              props that v2.9.21 only ever reads inside its SignalConnected handler — so the
              icon flipped and the track kept publishing. They now drive localParticipant
              through useTrackToggle, the identical mechanism <TrackToggle> gives the full-size
              bar, which is also why the two no longer disagree when the mini window is expanded.
            */}
            {/* One tray, in the app's own white glass, instead of two black bars and a third
                black circle floating on top of the first one. It carries its own hairline and
                shadow, which is why it holds its shape over a white camera-off panel and over
                a dark picture alike — black chrome managed neither. */}
            <div className="absolute inset-x-0 bottom-3 z-40 flex justify-center">
              <div className="flex items-center gap-0.5 rounded-full border border-black/[0.07] bg-white/88 p-1 shadow-[0_6px_22px_rgba(15,23,42,0.16)] backdrop-blur-xl">
                <MiniTrackToggle
                  source={Track.Source.Microphone}
                  enabledLabel="Turn off microphone"
                  disabledLabel="Turn on microphone"
                  enabledIcon={<Microphone className="size-[17px]" weight="fill" />}
                  disabledIcon={
                    <MicrophoneSlash className="size-[17px]" weight="bold" />
                  }
                />
                <MiniTrackToggle
                  source={Track.Source.Camera}
                  enabledLabel="Turn off camera"
                  disabledLabel="Turn on camera"
                  enabledIcon={<VideoCamera className="size-[17px]" weight="fill" />}
                  disabledIcon={
                    <VideoCameraSlash className="size-[17px]" weight="bold" />
                  }
                />

                <span className="mx-1 h-4 w-px bg-black/10" />

                <button
                  type="button"
                  aria-label="Return to meeting"
                  title="Return to meeting"
                  onClick={() => router.push(liveMeetingPath(activeWorkspaceSlug, roomId))}
                  className="grid size-8 place-items-center rounded-full text-ink transition hover:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ArrowsOut className="size-[17px]" weight="bold" />
                </button>

                {/* New here. Leaving a minimised meeting used to mean expanding it first, so
                    the quickest way out of a call was two steps through the thing you were
                    trying to leave. */}
                <button
                  type="button"
                  aria-label="Leave meeting"
                  title="Leave meeting"
                  onClick={() => void handleExit("leave")}
                  className="grid size-8 place-items-center rounded-full bg-red-600 text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <PhoneDisconnect className="size-[17px]" weight="fill" />
                </button>
              </div>
            </div>
          </div>
        ) : (
        <main
          data-meeting-content
          className="flex min-h-0 flex-1 gap-3 p-3 pt-0"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* No border on this frame. It drew a grey outline at radius 24 around a tile that
                rounds at 16, so the two curves never met and the square backing showed through
                as four grey wedges at the corners — read as a hairline box bolted onto the
                video. The rounding lives here and `overflow-hidden` clips the picture to it;
                the stage fills the frame square and lets this clip do the shaping. */}
            <section
              data-meeting-camera-view
              className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] bg-surface-1"
            >
              <MeetingStageTimer
                createdAt={room.createdAt}
                endedAt={room.endedAt}
              />
              {/* The minimise button sat here. Removed on the owner's call — the floating
                  window still appears on its own when you navigate away from the room, which
                  is how it worked before WT-246 added a button for it. */}
              <div className="relative min-h-0 w-full flex-1">
                {isRecording ? (
                  // Beside the timer, not floating between the pin and the signal meter.
                  // Recording state and elapsed time are the same kind of fact — "what is
                  // happening to this meeting right now" — and they belong together, in the
                  // corner the eye already goes to for the clock.
                  <div className="absolute left-4 top-[52px] z-30 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    REC
                  </div>
                ) : null}
                <LiveKitMeetingStage
                  fallbackName={user?.fullName || user?.email || room.title}
                  isJoining={isMeetingJoining}
                  error={meetingError}
                  layoutMode={meetingLayout}
                  pinnedUserId={pinnedUserId}
                  onPinParticipant={handlePinParticipant}
                  spotlightedUserId={spotlightedUserId}
                  raisedHandUserIds={raisedHandUserIds}
                  onRetry={retryMeetingConnection}
                />
                {/* Emoji reactions — TranslationRoomHub.ReactionReceived */}
                <ReactionOverlay
                  reactions={reactions}
                  onReactionExpired={handleReactionExpired}
                />
              </div>
            </section>

            {subtitlesEnabled ? (
              <div
                data-meeting-subtitle-lane
                className="relative flex h-[72px] shrink-0 items-center justify-center overflow-hidden"
              >
                <LiveSubtitleOverlay
                  // Captions are the TRANSCRIPT in the caption lane (carrying the translation
                  // when there is one), so they follow the meeting being live, not translation.
                  enabled={meetingLive && subtitlesEnabled}
                />
              </div>
            ) : null}

            <div
              data-meeting-bottom-dock
              className="relative z-40 flex min-h-12 min-w-0 shrink-0 items-center justify-center overflow-visible"
            >
              <div className="mx-auto flex max-w-full min-w-0 items-center gap-2 px-1 overflow-x-auto no-scrollbar">
                <div data-meeting-control-bar className="shrink-0">
                  <MeetingControlBar
                    meetingEnabled={Boolean(meetingSession?.token)}
                    cameraEnabled={cameraEnabled}
                    microphoneEnabled={microphoneEnabled}
                    noiseSuppressionEnabled={noiseSuppressionEnabled}
                    backgroundBlurEnabled={backgroundBlurEnabled}
                    isScreenSharing={isScreenSharing}
                    layoutMode={meetingLayout}
                    roomCode={room.translationRoomCode}
                    joinLink={joinLink}
                    isHost={isHost}
                    warptalkStarted={translationStarted}
                    subtitlesEnabled={subtitlesEnabled}
                    listenLanguage={targetLanguage}
                    availableListenLanguages={availableListenLanguages}
                    speakLanguage={sourceLanguage}
                    availableSpeakLanguages={availableListenLanguages}
                    voicePreference={voicePreference}
                    voiceCatalog={voiceCatalog}
                    voiceCloneEnabled={voiceCloneEnabled}
                    dubVoice={dubVoice ?? null}
                    ownVoiceProfiles={ownVoiceProfiles}
                    onChangeDubVoice={handleChangeDubVoice}
                    cloneCapture={cloneCaptureState}
                    voiceCloneHasAudience={voiceCloneHasAudience}
                    flashModeEnabled={flashModeEnabled}
                    // isRoomHost, not isHost, for the same reason /pause and /resume use it: the
                    // endpoint gates on the room's EFFECTIVE host, and a workspace admin — host-
                    // like everywhere else — would be handed a switch that answers 403.
                    onChangeFlashMode={
                      isRoomHost ? (enabled) => setFlashMode.mutate(enabled) : undefined
                    }
                    noiseReductionMode={noiseReductionMode}
                    // No isRoomHost gate, unlike flash mode directly above. This one is the
                    // caller's own microphone; the endpoint requires membership and writes only
                    // under the caller's own id, so every participant gets a working control.
                    onChangeNoiseReductionMode={(mode) => setNoiseReduction.mutate(mode)}
                    voiceEnabled={voiceEnabled}
                    handRaised={handRaised}
                    onCopyText={copyText}
                    onToggleCamera={() =>
                      setCameraEnabled((current) => !current)
                    }
                    onToggleMicrophone={() =>
                      setMicrophoneEnabled((current) => !current)
                    }
                    onToggleNoiseSuppression={handleToggleNoiseSuppression}
                    onToggleBackgroundBlur={handleToggleBackgroundBlur}
                    onToggleScreenShare={handleToggleScreenShare}
                    onLayoutChange={setMeetingLayout}
                    // isRoomHost, not isHost: /resume and /pause both reject a caller whose id is
                    // not the room's HostId, so a workspace admin — host-like everywhere else in
                    // this bar — would press Start and get "Unauthorized". The control bar's own
                    // prop doc is "omit to hide the control", so this hides it rather than
                    // offering a button that cannot work.
                    onStartWarptalk={
                      // WT-371: the room decides who may START translation. Stopping stays
                      // host-only below — opening a meeting up is not the same as letting
                      // anyone cut it off for everybody. The server enforces the same rule in
                      // TranslationRoomSessionService.CanStartSessionAsync; this only decides
                      // whether the control is offered.
                      isRoomHost || room?.settings?.participantsCanStartTranslation
                        ? handleStartWarptalk
                        : undefined
                    }
                    onStopWarptalk={isRoomHost ? handleStopWarptalk : undefined}
                    onToggleSubtitles={() =>
                      setSubtitlesEnabled((current) => !current)
                    }
                    onChangeListenLanguage={handleChangeListenLanguage}
                    onChangeSpeakLanguage={handleChangeSpeakLanguage}
                    // WT-434: a bar pick becomes the remembered profile. Only the language
                    // MODAL saved settings before, so a profile written by the old two-column
                    // UI (speak=vi, listen=en) was fossilized — every later meeting's
                    // remembered-language auto-apply resurrected the split however many times
                    // the user picked one language in the bar.
                    onLanguagePicked={(language) =>
                      updateUserSettings.mutate({
                        defaultSpeakLanguage: language,
                        defaultListenLanguage: language,
                      })
                    }
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
                    onToggleMuteOnEntry={
                      isHost ? handleToggleMuteOnEntry : undefined
                    }
                    onMuteAll={isHost ? handleMuteAll : undefined}
                    // Not gated on isHost, unlike the three host controls above it.
                    //
                    // Recording belongs to the room rather than to whoever booked it: the person
                    // who needs the transcript timestamped is usually not the person who created
                    // the meeting. MeetingRoomService.SetRecordingAsync accepts any participant
                    // (IsInMeetingAsync), and every participant is told the moment it starts or
                    // stops by the RecordingStateChanged toast above — that notice, not the
                    // permission check, is what makes this safe to open up.
                    onToggleRecording={handleToggleRecording}
                  />
                </div>
                <div data-meeting-exit-control className="shrink-0">
                  <MeetingExitControl
                    room={room}
                    isHost={isRoomHost}
                    onExit={handleExit}
                  />
                </div>
              </div>
            </div>
          </div>

          {rightSidebarOpen && (
            <MeetingSidePanel
              roomId={roomId}
              room={room}
              isHost={isHost}
              mode={sidePanelMode}
              onModeChange={setSidePanelMode}
              participants={participants}
              participantsLoading={participantsQuery.isLoading}
              participantsError={participantsQuery.isError}
              activeCount={activeCount}
              segments={panelSegments}
              missedCount={catchUp.missedCount}
              onCopyText={copyText}
              joinLink={joinLink}
              chatTargetLanguage={targetLanguage}
              raisedHandUserIds={raisedHandUserIds}
              spotlightedUserId={spotlightedUserId}
              onToggleSpotlight={handleToggleSpotlight}
            />
          )}
        </main>
        )}
      </LiveKitRoom>

      {!compact ? <LanguagePickerModal
        open={showLanguagePicker}
        onOpenChange={setShowLanguagePicker}
        availableLanguages={availableListenLanguages}
        defaultSpeakLanguage={suggestedLanguages.speak}
        defaultListenLanguage={suggestedLanguages.listen}
        onConfirm={handleConfirmLanguagePicker}
        onSkip={() => {
          // No-op: leaving speak/listen exactly as they already are (STT auto-detect +
          // the room's default listen language) IS the existing pre-modal behavior.
        }}
      /> : null}
    </div>
  );
}

// Helpers

// WT-08: useRoomContext() only works INSIDE <LiveKitRoom>'s provider tree —
// PersistentMeetingSession renders <LiveKitRoom> rather than being inside it, so this child is
// what actually reaches the LiveKit Room instance to observe RoomEvent.Reconnecting/
// Reconnected, mirroring how prior rounds' LiveKit-aware components (e.g. FilteredRoomAudio)
// are children of <LiveKitRoom> rather than living in the parent page.
function LiveKitReconnectWatcher({
  onReconnecting,
  onReconnected,
}: {
  onReconnecting: () => void;
  onReconnected: () => void;
}) {
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

/**
 * WT-303: the single place where "am I publishing my camera/microphone?" is answered.
 *
 * `localParticipant` is the truth. This component (a) hands the parent an imperative handle so
 * non-UI events like the host's ForceMuted can change what is actually published, and (b)
 * mirrors LiveKit's own state back into the parent's React state, so nothing downstream has to
 * keep a competing copy.
 *
 * Same reason LiveKitReconnectWatcher exists: PersistentMeetingSession RENDERS <LiveKitRoom>,
 * so it cannot call useRoomContext() itself.
 *
 * The mirror runs only while CONNECTED. On disconnect livekit reports the local participant as
 * having nothing enabled, and copying that back would rewrite the parent's state to
 * camera/mic-off — which is also the connect-time intent fed to <LiveKitRoom audio/video>, so
 * an idle disconnect would silently come back muted. Ignoring the disconnected window keeps the
 * last known live state as the intent for the next connect.
 */
function LocalMediaController({
  controlRef,
  onCameraEnabledChange,
  onMicrophoneEnabledChange,
}: {
  controlRef: React.RefObject<LocalMediaControl | null>;
  onCameraEnabledChange: (enabled: boolean) => void;
  onMicrophoneEnabledChange: (enabled: boolean) => void;
}) {
  const room = useRoomContext();

  useEffect(() => {
    const localParticipant = room.localParticipant;

    controlRef.current = {
      setMicrophoneEnabled: (enabled) => {
        void localParticipant.setMicrophoneEnabled(enabled).catch(() => {
          toast.error("Could not change your microphone.");
        });
      },
      setScreenShareEnabled: async (enabled) => {
        // LiveKit owns the whole flow: it prompts, creates the track AND publishes it.
        // The previous implementation called getDisplayMedia() directly and kept the
        // stream in React state, so the sharer saw their own screen and nobody else
        // received anything — the track was never on the wire.
        try {
          await localParticipant.setScreenShareEnabled(enabled);
          return enabled;
        } catch (error) {
          // Dismissing the browser's picker throws; that is a choice, not a failure.
          const aborted =
            error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "AbortError");
          if (!aborted) toast.error("Could not share your screen.");
          return false;
        }
      },
      setCameraEnabled: (enabled) => {
        void localParticipant.setCameraEnabled(enabled).catch(() => {
          toast.error("Could not change your camera.");
        });
      },
    };

    const mirror = () => {
      if (room.state !== ConnectionState.Connected) return;
      onMicrophoneEnabledChange(localParticipant.isMicrophoneEnabled);
      onCameraEnabledChange(localParticipant.isCameraEnabled);
    };

    mirror();
    room
      .on(RoomEvent.Connected, mirror)
      .on(RoomEvent.LocalTrackPublished, mirror)
      .on(RoomEvent.LocalTrackUnpublished, mirror)
      .on(RoomEvent.TrackMuted, mirror)
      .on(RoomEvent.TrackUnmuted, mirror);

    return () => {
      room
        .off(RoomEvent.Connected, mirror)
        .off(RoomEvent.LocalTrackPublished, mirror)
        .off(RoomEvent.LocalTrackUnpublished, mirror)
        .off(RoomEvent.TrackMuted, mirror)
        .off(RoomEvent.TrackUnmuted, mirror);
      controlRef.current = null;
    };
  }, [room, controlRef, onCameraEnabledChange, onMicrophoneEnabledChange]);

  return null;
}

/**
 * The mini window's mic/camera button. Reads and writes the LiveKit publication via
 * useTrackToggle — the same hook that backs <TrackToggle> in the full-size control bar — so
 * `enabled` is the published state and never a React guess about it.
 */
function MiniTrackToggle({
  source,
  enabledLabel,
  disabledLabel,
  enabledIcon,
  disabledIcon,
}: {
  source: Track.Source.Microphone | Track.Source.Camera;
  enabledLabel: string;
  disabledLabel: string;
  enabledIcon: React.ReactNode;
  disabledIcon: React.ReactNode;
}) {
  const { enabled, pending, toggle } = useTrackToggle({ source });

  return (
    <button
      type="button"
      data-mini-media-toggle={source}
      data-lk-enabled={enabled}
      aria-pressed={enabled}
      aria-label={enabled ? enabledLabel : disabledLabel}
      disabled={pending}
      onClick={() => void toggle()}
      // A muted track turns the button red rather than only swapping in a slashed glyph. At
      // 17px a slash is a detail you have to look for; a red button is a state you see.
      className={`grid size-8 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${enabled ? "text-ink hover:bg-black/[0.06]" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
    >
      {enabled ? enabledIcon : disabledIcon}
    </button>
  );
}

function normalizeLanguageCode(language: string) {
  return language.split("-")[0]?.toLowerCase() || language.toLowerCase();
}
