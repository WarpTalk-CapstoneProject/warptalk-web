"use client";

/**
 * Builds the value `BridgeWidgetProvider` hands to every slot of the Meet widget. WT-525.
 *
 * The hub and auth code moved here from the old desktop-transcript page, so the page is now only
 * routing and the sign-in state. See widget-context.tsx for the contract itself.
 *
 * THE POPUP'S HUB CONNECTION NEVER JOINS THE ROOM GROUP, AND MUST NOT
 *   Every room broadcast — TranscriptSegmentReceived, TranslationTextReceived, TranscriptPaused,
 *   TranscriptResumed, TranslationRoomEnded — goes to the SignalR group `translationRoom:{id}`, and
 *   the only way into that group is `JoinTranslationRoom`. Calling it from this window would be
 *   destructive, not merely redundant (TranslationRoomHub, gateway):
 *
 *     - BR-159-014 allows one connection per (room, user). A second join sends the FIRST one
 *       `ForceDisconnected("You have joined from another device.")`, and the main window answers
 *       that by stopping and showing "joined from another device or tab" — the popup would push
 *       the user out of the meeting it floats over.
 *     - When a joined connection drops, OnDisconnectedAsync treats it as the user leaving: it
 *       publishes participant-offline and deletes their languages, speak language and voice
 *       preference from Redis. Closing this window would take those from the live meeting.
 *
 *   So the connection is started and never joined. That keeps `hub.invoke("SetSpeakLanguage" |
 *   "SetListenLanguage" | "SetVoicePreference", roomId, …)` working — the gateway keys those by
 *   the caller's user id, not by group — and it means NO room broadcast reaches this window.
 *   The handlers below are registered anyway, so the day a join-free "watch" method exists on the
 *   hub (or the main window relays its snapshot over IPC, the Phase 2 relay step) they are live
 *   without further changes. Until then they are silent, and the old page was silent too: it
 *   registered TranscriptSegmentReceived on a connection that was never in the group.
 *
 * WHAT ANSWERS INSTEAD, UNTIL THEN
 *   The server's own records, read over REST on a slow poll (SAVED_TRANSCRIPT_REFRESH_MS):
 *     - the saved transcript — segments plus their translations — merged in front of anything
 *       live with `buildCatchUpTranscript`, the same merge the in-meeting panel uses for a late
 *       joiner, so a line that ever does arrive live replaces its saved copy instead of doubling;
 *     - the transcript pause windows, through `resolveTranscriptPause`, the same rule the meeting
 *       uses. With no broadcast ever arriving, the window list is what answers.
 *   TODO(WT-525 relay / backend): replace the poll with room events once this window can receive
 *   them without joining — a join-free hub method, or the main window's `bridge:session-state`.
 *
 * WT-901: THE MAIN WINDOW SAYS IT FIRST
 *   Translation running, the transcript pause and room-host now also arrive over the relay
 *   snapshot, the moment the main window's state changes. Where the snapshot carries one, it wins
 *   over the poll; where it does not (no main window, or one too old to send it), the poll is the
 *   answer as before. The poll keeps running either way — it is also how the transcript itself is
 *   read, and it is the fallback the moment the main window goes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HubConnection } from "@microsoft/signalr";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  transcriptPauseWindowsKey,
  useTranscriptByRoom,
  useTranscriptCleanSentences,
  useTranscriptPauseWindows,
  useTranscriptSegments,
  useTranscriptTranslations,
} from "@/hooks/use-transcripts";
import { mergeCleanSentences, upsertCleanSentence } from "@/lib/transcript/clean-transcript";
import { useTranslationRoom, useTranslationRoomSessions } from "@/hooks/use-translationRooms";
import {
  normalizeLanguageCode,
  resolveListenLanguage,
  resolveSpeakLanguage,
} from "@/lib/language/participant-language-preference";
import {
  activateBridgeRoom,
  readVirtualAudioStatus,
  watchMeetMicState,
  type MeetMicState,
  type VirtualAudioStatus,
} from "@/lib/desktop/bridge";
import { bridgeModeSupport } from "@/lib/meeting/bridge-audio-mode";
import { canControlBridge, resolveBridgeRole } from "@/lib/meeting/bridge-capturer";
import { BRIDGE_STAND_IN_USER_ID } from "@/lib/meeting/bridge-far-side-language";
import { isExternalBridge } from "@/lib/meeting/meeting-types";
import { canJoinTranslationRoom } from "@/lib/meeting/translation-room-access";
import {
  bridgeWidgetAudioMode,
  bridgeWidgetBridgeRole,
  bridgeWidgetIsRoomHost,
  bridgeWidgetMeetingStatus,
  bridgeWidgetRoomEnded,
  bridgeWidgetTranscriptPauseState,
  bridgeWidgetTranslationState,
  canOfferCaptureTakeover,
  canRelayAudioMode,
} from "@/lib/meeting/bridge-widget-relay";
import { resolveTranscriptPause } from "@/lib/meeting/transcript-pause";
import { createHubConnection } from "@/lib/realtime/signalr";
import { buildCatchUpTranscript } from "@/lib/transcript/transcript-catch-up";
import { translationRoomService } from "@/services/translation-room.service";
import { useAuthStore } from "@/stores/auth-store";
import type { TranscriptCleanSentenceEventDto, TranscriptSegmentDto } from "@/types/realtime";

import { useBridgeWidgetRelayClient } from "./settings/use-bridge-widget-relay-client";
import type {
  BridgeWidgetCarryState,
  BridgeWidgetConnectionState,
  BridgeWidgetState,
  BridgeWidgetTranslationStatus,
} from "./widget-context";

/**
 * How long the popup waits for the main window to answer after asking it to carry the room before
 * it says so and offers "Show WarpTalk". Mounting a meeting (room read, token, hub) takes a few
 * seconds on a cold window; much longer than this and the user is looking at a dead control.
 */
const CARRY_ANSWER_TIMEOUT_MS = 10_000;

/**
 * How often the saved transcript and the pause windows are re-read while this window is visible.
 *
 * Ten seconds, not the three the participants list uses, because of the budget it shares. The
 * gateway rate-limits an IP at 100 requests a minute and answers a refusal with a bodyless 503
 * that reads exactly like an outage (see persistent-meeting-session's participants poll). This
 * window and the main one are the same IP: the main window already spends ~20/min on
 * participants and ~12/min on sessions, and this window spends ~12/min on sessions. Three reads
 * every 10s adds 18/min; at 3s it would add 60 and put a live meeting over the limit.
 */
const SAVED_TRANSCRIPT_REFRESH_MS = 10_000;

export function useBridgeWidgetState(roomId: string): BridgeWidgetState {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  // A boolean, not the token: the hub reads a fresh token through its own factory, so a token
  // refresh must not tear the connection down and rebuild it.
  const signedIn = useAuthStore((state) => Boolean(state.accessToken));

  // ── room, host, translation ──────────────────────────────────────────────

  const relay = useBridgeWidgetRelayClient(roomId);
  const relayView = relay.view;

  const { data: room, refetch: refetchRoom } = useTranslationRoom(roomId);
  const { data: sessions } = useTranslationRoomSessions(roomId);
  const polledStarted = (sessions ?? []).some((session) => session.status === "ACTIVE");
  const translation = bridgeWidgetTranslationState(relayView, { started: polledStarted });
  const translationStarted = translation.started;
  // `undefined` covers a failed first read too: a sessions request that errored has not told us
  // translation is ready, it has told us nothing — unless the main window has.
  const translationStatus: BridgeWidgetTranslationStatus = translationStarted
    ? "translating"
    : sessions === undefined
      ? translation.mirrored
        ? "ready"
        : "unknown"
      : sessions.length > 0
        ? "stopped"
        : "ready";
  // Both halves, as every other host check in the app does it — or,
  // better, the main window's `isRoomHost`, which also follows a live host transfer.
  const isHost = bridgeWidgetIsRoomHost(
    relayView,
    Boolean(user?.id && room?.hostId === user.id) || room?.isHost === true,
  );
  const meetingStatus = bridgeWidgetMeetingStatus(relayView);
  /**
   * W4b: this desktop's role in the shared bridge room — the main window's answer (it heard the
   * claim, the heartbeats and any takeover), else the room record (lib/meeting/bridge-capturer).
   * `canControl` is the PO rule for Start/Stop, Pause/Resume and "They speak": host OR capturer.
   */
  const bridgeRole = bridgeWidgetBridgeRole(
    relayView,
    resolveBridgeRole({
      userId: user?.id,
      bridgeCapturerUserId: room?.bridgeCapturerUserId,
      isLegacyOwner: Boolean(room?.isHost || (user?.id && room?.hostId === user.id)),
    }),
  );
  const canControl = canControlBridge({ isRoomHost: isHost, bridgeRole });
  const canOfferTakeover = canOfferCaptureTakeover(relayView);
  /**
   * Translation has never run in this room — the sessions list answered, and it is empty. The
   * popup's first screen (the language step with one Start) is for exactly this. Not while the
   * list is unknown: a room started before must not flash the step while its sessions load.
   */
  const neverStarted = sessions !== undefined && sessions.length === 0 && !translationStarted;

  /**
   * The popup does not end the meeting (PO, 2026-10-01): a bridge room ends when its Google Meet
   * conference does, which the backend learns from Google, or from the main window's own End. The
   * popup only notices that it has — the room record says ENDED — and then shows EndedView.
   *
   * The room is re-read on the slow tick below only while no main window is connected: one that is
   * running the meeting says `host-gone` the moment the meeting closes, and that re-reads it at once.
   *
   * W4a: the main window also SAYS so (`roomEnded` on the snapshot), the instant its meeting
   * ends, and its app shell keeps saying it after the meeting has unmounted. Latched per room: the
   * meeting's own `host-gone` lands between the two and clears the snapshot, and the popup must
   * not flicker back to the dock for that moment — a room does not un-end.
   */
  const relayEnded = bridgeWidgetRoomEnded(relayView);
  const [endedLatchRoomId, setEndedLatchRoomId] = useState<string | null>(null);
  if (relayEnded && endedLatchRoomId !== roomId) setEndedLatchRoomId(roomId);
  const ended = room?.status === "ended" || relayEnded || endedLatchRoomId === roomId;
  const relayStatus = relayView.status;
  useEffect(() => {
    if (relayStatus === "no-host" && roomId && signedIn) void refetchRoom();
  }, [relayStatus, roomId, signedIn, refetchRoom]);

  /**
   * W4b: NO DEAD END. A popup nobody answers (the trigger, the tray or the room page opened it for
   * a room the main window is not running) asks the main window to CARRY the room — the same
   * `activateBridgeRoom` Start uses, answered by the shell with `openMeeting` — so the relay host
   * exists and the language, Text | Voice and voice controls work. Once per room. The shell will
   * not swap out a native meeting for it; then, or off the desktop, the popup says so and offers
   * "Show WarpTalk" (`carry: "failed"`).
   */
  const [carry, setCarry] = useState<{ roomId: string; state: BridgeWidgetCarryState } | null>(null);
  const carryState: BridgeWidgetCarryState = carry?.roomId === roomId ? carry.state : "idle";
  const roomType = room?.translationRoomType;
  const roomStatus = room?.status;
  useEffect(() => {
    if (relayStatus !== "no-host" || !roomId || !signedIn || ended || carryState !== "idle") return;
    if (!roomType || !roomStatus) return;
    if (!isExternalBridge(roomType) || !canJoinTranslationRoom(roomStatus)) return;
    setCarry({ roomId, state: "asking" });
    void activateBridgeRoom(roomId).then((asked) => {
      if (!asked) {
        setCarry((current) => (current?.roomId === roomId ? { roomId, state: "failed" } : current));
      }
    });
  }, [relayStatus, roomId, signedIn, ended, carryState, roomType, roomStatus]);
  // Asked, and still nobody after a while: say so. An answer arriving later still connects.
  useEffect(() => {
    if (carryState !== "asking" || relayStatus === "connected") return;
    const timer = window.setTimeout(
      () => setCarry((current) => (current?.roomId === roomId ? { roomId, state: "failed" } : current)),
      CARRY_ANSWER_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [carryState, relayStatus, roomId]);
  // Told before the room record knows: bring the record up to date, so the rest of the popup that
  // reads `room` (and the slow tick, which stops once ended) agrees.
  useEffect(() => {
    if (relayEnded && roomId && signedIn) void refetchRoom();
  }, [relayEnded, roomId, signedIn, refetchRoom]);

  // ── hub ──────────────────────────────────────────────────────────────────

  const [connectionState, setConnectionState] = useState<BridgeWidgetConnectionState>("connecting");
  const [hub, setHub] = useState<HubConnection | null>(null);
  const [liveSegments, setLiveSegments] = useState<TranscriptSegmentDto[]>([]);
  /**
   * The last TranscriptPaused/TranscriptResumed broadcast, or null — see persistent-meeting-session,
   * which holds the same thing for the same reason. Null is "not told", not "running".
   */
  const [transcriptPauseEvent, setTranscriptPauseEvent] = useState<{ paused: boolean } | null>(
    null,
  );
  /**
   * Read by the segment handler, which is registered once. WT-605: the gateway broadcasts every
   * segment, paused or not, because captions run through a pause. This pane is a TRANSCRIPT, so a
   * segment that arrives while paused is not added — the same lane rule the in-meeting store
   * applies (see captionSegments in translationRoom-store).
   */
  const transcriptPausedRef = useRef(false);
  /** WT-716 tier 2 from the hub. Merged with the REST read below, highest revision per id. */
  const [liveCleanSentences, setLiveCleanSentences] = useState<TranscriptCleanSentenceEventDto[]>([]);

  useEffect(() => {
    if (!roomId || !signedIn) return;

    // createHubConnection rather than a builder of our own: it carries the app's single token
    // refresher and the reconnect policy that stops on a rejected token.
    const connection = createHubConnection("/hubs/translation-room");
    let disposed = false;

    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => {
      setLiveSegments((previous) => {
        // Segments are revised in place as recognition firms up, so replace rather than append.
        const index = previous.findIndex((existing) => existing.segmentId === segment.segmentId);
        if (index === -1 && transcriptPausedRef.current) return previous;
        if (index === -1) return [...previous, segment];
        const next = [...previous];
        next[index] = segment;
        return next;
      });
    });

    // WT-716 tier 2, registered on the same terms as the segment handler above: silent today,
    // because this connection never joins the room group (see the header), and live the moment a
    // join-free watch or the main window's relay exists. Until then the REST read below answers.
    connection.on("TranscriptCleanSentenceReceived", (sentence: TranscriptCleanSentenceEventDto) => {
      setLiveCleanSentences((previous) => upsertCleanSentence(previous, sentence));
    });

    // Both carry the room id and nothing else. Checked because the payload says which room, and
    // a window that ever does receive broadcasts should not be paused by somebody else's meeting.
    const applyTranscriptPause = (paused: boolean, pausedRoomId?: string) => {
      if (pausedRoomId && pausedRoomId !== roomId) return;
      transcriptPausedRef.current = paused;
      setTranscriptPauseEvent({ paused });
      // The broadcast decides the state; the refetch only fills in when the pause began.
      void queryClient.invalidateQueries({ queryKey: transcriptPauseWindowsKey(roomId) });
    };
    connection.on("TranscriptPaused", (id?: string) => applyTranscriptPause(true, id));
    connection.on("TranscriptResumed", (id?: string) => applyTranscriptPause(false, id));

    connection.onreconnecting(() => {
      if (!disposed) setConnectionState("reconnecting");
    });
    connection.onreconnected(() => {
      if (disposed) return;
      setConnectionState("live");
      // Anything that fired while the socket was down was never delivered, so the event held
      // here is a claim this window can no longer make — resolveTranscriptPause's header puts
      // that obligation on the caller. The window list answers again.
      setTranscriptPauseEvent(null);
      void queryClient.invalidateQueries({ queryKey: transcriptPauseWindowsKey(roomId) });
    });
    connection.onclose(() => {
      if (disposed) return;
      setConnectionState("failed");
      setHub(null);
    });

    connection
      .start()
      .then(() => {
        if (disposed) return;
        setConnectionState("live");
        setHub(connection);
      })
      .catch(() => {
        if (!disposed) setConnectionState("failed");
      });

    return () => {
      disposed = true;
      setHub(null);
      void connection.stop();
    };
  }, [roomId, signedIn, queryClient]);

  // ── transcript pause ─────────────────────────────────────────────────────

  const pauseWindowsQuery = useTranscriptPauseWindows(roomId);
  const transcriptPause = bridgeWidgetTranscriptPauseState(
    relayView,
    resolveTranscriptPause({
      windows: pauseWindowsQuery.data,
      event: transcriptPauseEvent,
    }),
  );
  useEffect(() => {
    transcriptPausedRef.current = transcriptPause.paused;
  }, [transcriptPause.paused]);

  // ── transcript ───────────────────────────────────────────────────────────

  // WT-587: an ephemeral meeting writes nothing down, so there is no saved transcript to read and
  // every attempt would 404. Absent reads as true, as it does everywhere else.
  const savesTranscript = room?.settings?.saveTranscript !== false;
  const savedTranscriptQuery = useTranscriptByRoom(savesTranscript ? roomId : undefined);
  const transcriptId = savedTranscriptQuery.data?.id;
  const savedSegmentsQuery = useTranscriptSegments(transcriptId);
  const savedTranslationsQuery = useTranscriptTranslations(transcriptId);
  // WT-716 tier 2. Polled with everything else this window reads, because no broadcast reaches it.
  const savedCleanSentencesQuery = useTranscriptCleanSentences(transcriptId);
  const cleanSentences = useMemo(
    () => mergeCleanSentences(savedCleanSentencesQuery.data ?? [], liveCleanSentences),
    [savedCleanSentencesQuery.data, liveCleanSentences],
  );

  const segments = useMemo(() => {
    // Saved translations keyed the way live segments carry them: by normalized target language.
    const translationsBySegment = new Map<string, Record<string, string>>();
    for (const translation of savedTranslationsQuery.data?.items ?? []) {
      const language = normalizeLanguageCode(translation.targetLanguage);
      if (!language || !translation.translatedText) continue;
      const entry = translationsBySegment.get(translation.segmentId) ?? {};
      entry[language] = translation.translatedText;
      translationsBySegment.set(translation.segmentId, entry);
    }

    return buildCatchUpTranscript(savedSegmentsQuery.data?.items ?? [], liveSegments).segments.map(
      (segment) => {
        // A live copy wins the merge, but TranscriptSegmentReceived never carries translations
        // (they arrive as a separate event), so without this a line that arrived live would lose
        // the translations its saved copy already had.
        if (segment.translations && Object.keys(segment.translations).length > 0) return segment;
        const saved = translationsBySegment.get(segment.segmentId);
        return saved ? { ...segment, translations: saved } : segment;
      },
    );
  }, [savedSegmentsQuery.data, savedTranslationsQuery.data, liveSegments]);

  const refetchTranscript = savedTranscriptQuery.refetch;
  const refetchSegments = savedSegmentsQuery.refetch;
  const refetchTranslations = savedTranslationsQuery.refetch;
  const refetchCleanSentences = savedCleanSentencesQuery.refetch;
  const refetchPauseWindows = pauseWindowsQuery.refetch;

  useEffect(() => {
    if (!roomId || !signedIn || ended) return;

    const tick = () => {
      // Hidden to the tray: nobody is reading, so nothing is worth a request.
      if (document.visibilityState === "hidden") return;
      if (relayStatus !== "connected") void refetchRoom();
      void refetchPauseWindows();
      if (!savesTranscript) return;
      if (!transcriptId) {
        // The transcript row is created when the meeting first starts, so a window opened before
        // that sees a 404 — an answer, and one worth asking again.
        void refetchTranscript();
        return;
      }
      void refetchSegments();
      void refetchTranslations();
      void refetchCleanSentences();
    };

    const interval = window.setInterval(tick, SAVED_TRANSCRIPT_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [
    roomId,
    signedIn,
    ended,
    savesTranscript,
    transcriptId,
    refetchTranscript,
    refetchSegments,
    refetchTranslations,
    refetchCleanSentences,
    refetchPauseWindows,
    refetchRoom,
    relayStatus,
  ]);

  // ── reader language ──────────────────────────────────────────────────────

  /**
   * This user's participant row, read ONCE.
   *
   * Not `useTranslationRoomParticipants`: that polls every 3s, which is 20 requests a minute from
   * this window on top of the main window's own 20, against the 100/min IP limit described at
   * SAVED_TRANSCRIPT_REFRESH_MS — to learn a language that only changes when this user changes
   * it, which `setReaderLanguage` already records. The key extends the participants key, so an
   * invalidation of that list still refreshes this read.
   */
  const participantsQuery = useQuery({
    queryKey: ["translationRooms", roomId, "participants", "bridge-widget"],
    queryFn: async () => {
      const { data } = await translationRoomService.participants(roomId);
      return data;
    },
    enabled: Boolean(roomId) && signedIn,
    staleTime: Infinity,
    retry: 1,
  });
  const currentUserId = user?.id;
  const myParticipant = useMemo(
    () =>
      currentUserId
        ? participantsQuery.data?.find((participant) => participant.userId === currentUserId)
        : undefined,
    [participantsQuery.data, currentUserId],
  );

  // ── the far side's language ──────────────────────────────────────────────

  /**
   * What the "External Meeting" stand-in speaks — the other side of the Meet call. Read from the
   * same one-shot participants read: the stand-in is a row like any other, and its language only
   * changes when the host changes it from this window's "They speak" picker, which records the
   * pick below. A pick from the MAIN window is not reflected here (this window receives no room
   * broadcasts); the pill then shows the last value it knew until the window is reopened.
   */
  const farSideParticipant = useMemo(
    () => participantsQuery.data?.find((participant) => participant.userId === BRIDGE_STAND_IN_USER_ID),
    [participantsQuery.data],
  );
  const [farSideLanguagePick, setFarSideLanguagePick] = useState<string | null>(null);
  const setFarSideLanguage = useCallback((code: string) => {
    setFarSideLanguagePick(normalizeLanguageCode(code) || null);
  }, []);
  const farSideLanguage =
    farSideLanguagePick ??
    (normalizeLanguageCode(farSideParticipant?.speakLanguage ?? undefined) || null);

  const [readerLanguagePick, setReaderLanguagePick] = useState<string | null>(null);
  const setReaderLanguage = useCallback((code: string) => {
    setReaderLanguagePick(normalizeLanguageCode(code) || null);
  }, []);

  const readerLanguage = useMemo(() => {
    if (readerLanguagePick) return readerLanguagePick;
    // Not before both have answered: resolving on the room alone would print a room default and
    // then flip to the user's own row a second later.
    if (!room || !participantsQuery.isFetched) return null;
    const speak = resolveSpeakLanguage({ participant: myParticipant?.speakLanguage }, room);
    return resolveListenLanguage({ participant: myParticipant?.listenLanguage }, room, speak);
  }, [readerLanguagePick, room, participantsQuery.isFetched, myParticipant]);

  // ── text-only bridge ─────────────────────────────────────────────────────

  /**
   * How Meet hears this user: the main window's answer, else the one-shot participant row. The row
   * is read once, so it can lag a switch made since — the main window's answer, when there is one,
   * is the one that counts.
   */
  const audioMode = bridgeWidgetAudioMode(
    relayView,
    myParticipant ? (myParticipant.isBridgeTextOnly === true ? "text" : "voice") : null,
  );
  const canSwitchAudioMode = canRelayAudioMode(relayView);

  /**
   * The desktop's device report, for which modes this machine can run. Read on open and again when
   * the popup regains focus — the user may have installed VB-CABLE meanwhile.
   */
  const [virtualAudioStatus, setVirtualAudioStatus] = useState<VirtualAudioStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void readVirtualAudioStatus().then((status) => {
        if (!cancelled) setVirtualAudioStatus(status);
      });
    };
    read();
    window.addEventListener("focus", read);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", read);
    };
  }, []);
  const modeSupport = useMemo(() => bridgeModeSupport(virtualAudioStatus), [virtualAudioStatus]);

  /**
   * Which microphone Meet records from (desktop #45). Watched only while a main window runs this
   * room and the meeting is not over: the desktop polls Core Audio for as long as anyone listens.
   */
  const [meetMicState, setMeetMicState] = useState<MeetMicState["state"] | null>(null);
  const watchMeetMic = relayView.status === "connected" && !ended;
  useEffect(() => {
    if (!watchMeetMic) return;
    const stop = watchMeetMicState((state) => setMeetMicState(state.state));
    return () => {
      stop?.();
      setMeetMicState(null);
    };
  }, [watchMeetMic]);

  // Memoized because it is a context value: a fresh object every render would re-render every
  // slot whenever anything above the provider did, including the WarpBot composer mid-keystroke.
  return useMemo(
    () => ({
      roomId,
      room,
      isHost,
      translationStarted,
      translationMirrored: translation.mirrored,
      translationStatus,
      transcriptPaused: transcriptPause.paused,
      transcriptPausedSince: transcriptPause.since,
      transcriptPauseKnown: transcriptPause.known,
      transcriptPauseMirrored: transcriptPause.mirrored,
      segments,
      cleanSentences,
      connectionState,
      hub,
      relay,
      relayConnected: relayView.status === "connected",
      carry: relayView.status === "connected" ? ("idle" as const) : carryState,
      bridgeRole,
      canControl,
      canOfferTakeover,
      neverStarted,
      meetingConnection: meetingStatus.connection,
      meetingError: meetingStatus.meetingError,
      idleReaped: meetingStatus.idleReaped,
      sessionDisplaced: meetingStatus.sessionDisplaced,
      creditsSuspended: meetingStatus.creditsSuspended,
      creditsSuspendedReason: meetingStatus.creditsSuspendedReason,
      readerLanguage,
      setReaderLanguage,
      farSideLanguage,
      setFarSideLanguage,
      ended,
      audioMode,
      canSwitchAudioMode,
      modeSupport,
      meetMic: meetMicState,
    }),
    [
      roomId,
      room,
      isHost,
      translationStarted,
      translation.mirrored,
      translationStatus,
      transcriptPause.paused,
      transcriptPause.since,
      transcriptPause.known,
      transcriptPause.mirrored,
      segments,
      cleanSentences,
      connectionState,
      hub,
      relay,
      relayView.status,
      carryState,
      bridgeRole,
      canControl,
      canOfferTakeover,
      neverStarted,
      meetingStatus.connection,
      meetingStatus.meetingError,
      meetingStatus.idleReaped,
      meetingStatus.sessionDisplaced,
      meetingStatus.creditsSuspended,
      meetingStatus.creditsSuspendedReason,
      readerLanguage,
      setReaderLanguage,
      farSideLanguage,
      setFarSideLanguage,
      ended,
      audioMode,
      canSwitchAudioMode,
      modeSupport,
      meetMicState,
    ],
  );
}
