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
 *       that by closing the meeting and navigating away — the popup would throw the user out of
 *       the meeting it floats over.
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
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HubConnection } from "@microsoft/signalr";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  transcriptPauseWindowsKey,
  useTranscriptByRoom,
  useTranscriptPauseWindows,
  useTranscriptSegments,
  useTranscriptTranslations,
} from "@/hooks/use-transcripts";
import { useTranslationRoom, useTranslationRoomSessions } from "@/hooks/use-translationRooms";
import {
  normalizeLanguageCode,
  resolveListenLanguage,
  resolveSpeakLanguage,
} from "@/lib/language/participant-language-preference";
import { resolveTranscriptPause } from "@/lib/meeting/transcript-pause";
import { createHubConnection } from "@/lib/realtime/signalr";
import { buildCatchUpTranscript } from "@/lib/transcript/transcript-catch-up";
import { translationRoomService } from "@/services/translation-room.service";
import { useAuthStore } from "@/stores/auth-store";
import type { TranscriptSegmentDto } from "@/types/realtime";

import type {
  BridgeWidgetConnectionState,
  BridgeWidgetState,
  BridgeWidgetTranslationStatus,
} from "./widget-context";

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

  const { data: room } = useTranslationRoom(roomId);
  const { data: sessions } = useTranslationRoomSessions(roomId);
  const translationStarted = (sessions ?? []).some((session) => session.status === "ACTIVE");
  // `undefined` covers a failed first read too: a sessions request that errored has not told us
  // translation is ready, it has told us nothing.
  const translationStatus: BridgeWidgetTranslationStatus = sessions === undefined
    ? "unknown"
    : translationStarted
      ? "translating"
      : sessions.length > 0
        ? "stopped"
        : "ready";
  // Both halves, as bridge-overlay-controls and every other host check in the app does it.
  const isHost = Boolean(user?.id && room?.hostId === user.id) || room?.isHost === true;

  const [ended, setEnded] = useState(false);
  const markEnded = useCallback(() => setEnded(true), []);

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
        if (index === -1) return [...previous, segment];
        const next = [...previous];
        next[index] = segment;
        return next;
      });
    });

    // Both carry the room id and nothing else. Checked because the payload says which room, and
    // a window that ever does receive broadcasts should not be paused by somebody else's meeting.
    const applyTranscriptPause = (paused: boolean, pausedRoomId?: string) => {
      if (pausedRoomId && pausedRoomId !== roomId) return;
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
  const transcriptPause = resolveTranscriptPause({
    windows: pauseWindowsQuery.data,
    event: transcriptPauseEvent,
  });

  // ── transcript ───────────────────────────────────────────────────────────

  // WT-587: an ephemeral meeting writes nothing down, so there is no saved transcript to read and
  // every attempt would 404. Absent reads as true, as it does everywhere else.
  const savesTranscript = room?.settings?.saveTranscript !== false;
  const savedTranscriptQuery = useTranscriptByRoom(savesTranscript ? roomId : undefined);
  const transcriptId = savedTranscriptQuery.data?.id;
  const savedSegmentsQuery = useTranscriptSegments(transcriptId);
  const savedTranslationsQuery = useTranscriptTranslations(transcriptId);

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
  const refetchPauseWindows = pauseWindowsQuery.refetch;

  useEffect(() => {
    if (!roomId || !signedIn || ended) return;

    const tick = () => {
      // Hidden to the tray: nobody is reading, so nothing is worth a request.
      if (document.visibilityState === "hidden") return;
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
    refetchPauseWindows,
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

  // Memoized because it is a context value: a fresh object every render would re-render every
  // slot whenever anything above the provider did, including the WarpBot composer mid-keystroke.
  return useMemo(
    () => ({
      roomId,
      room,
      isHost,
      translationStarted,
      translationStatus,
      transcriptPaused: transcriptPause.paused,
      transcriptPausedSince: transcriptPause.since,
      transcriptPauseKnown: transcriptPause.known,
      segments,
      connectionState,
      hub,
      readerLanguage,
      setReaderLanguage,
      ended,
      markEnded,
    }),
    [
      roomId,
      room,
      isHost,
      translationStarted,
      translationStatus,
      transcriptPause.paused,
      transcriptPause.since,
      transcriptPause.known,
      segments,
      connectionState,
      hub,
      readerLanguage,
      setReaderLanguage,
      ended,
      markEnded,
    ],
  );
}
