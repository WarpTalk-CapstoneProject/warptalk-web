"use client";

/**
 * The contract every slot of the Meet widget reads from. WT-525, Phase 2.
 *
 * THE WIDGET
 *   The desktop app opens `/desktop-transcript/{roomId}` in its own ~460×620 always-on-top
 *   window, floating over Google Meet. Meet owns the call — mic, camera, chat, leaving — so the
 *   widget carries only what WarpTalk adds: the transcript, WarpBot, starting and stopping
 *   translation, pausing the transcript, the reader's language and the voice settings.
 *
 * THE RULE THAT KEEPS PARALLEL WORK APART
 *   `WidgetShell` renders a fixed set of slot components and passes them NO props. Every slot
 *   reads what it needs from `useBridgeWidget()`. That is what lets each slot's owner change
 *   their own file without touching the shell or each other:
 *
 *     slot                     file                       owner
 *     TranscriptPane           transcript-pane.tsx        t2
 *     DockSessionControls      dock-session-controls.tsx  t3   Start/Stop, Pause transcript
 *     EndSessionButton         end-session.tsx            t3   header actions
 *     EndedView                ended-view.tsx             t3   replaces tabs + dock
 *     DockLanguagePill         dock-language-pill.tsx     t4
 *     SettingsFlyout           settings-flyout.tsx        t4   right end of the dock
 *     WarpBotPane              warpbot-pane.tsx           t5
 *
 *   A slot that needs something this context does not carry adds it HERE (and in
 *   use-bridge-widget-state.ts), never as a prop from the shell. Mutations — start, stop, pause,
 *   the dub voice — are the existing React Query hooks, called from the slot itself; the queries
 *   they invalidate are the same ones the state below is derived from, so there is one source of
 *   truth and nothing to keep in sync by hand.
 *
 * WHY THIS WINDOW CANNOT HOLD MEETING STATE OF ITS OWN
 *   It is a separate Electron BrowserWindow: it shares the origin (and so the session) with the
 *   main window, but not React state. The audio pipeline, the LiveKit connection and every
 *   `useState` of the meeting live in the main window. Everything here is therefore a server
 *   fact — sessions, pause windows, the saved transcript, the participant row — read over REST,
 *   plus this window's own hub connection.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { HubConnection } from "@microsoft/signalr";

import type { TranslationRoomDto } from "@/types/translationRoom";
import type { TranscriptSegmentDto } from "@/types/realtime";

import { useBridgeWidgetState } from "./use-bridge-widget-state";

export type BridgeWidgetConnectionState = "connecting" | "live" | "reconnecting" | "failed";

/**
 * What the header says about translation.
 *
 * `unknown` until the sessions query first answers: a "Ready" drawn before we know whether a
 * session is already running is a label that lies for a second and then changes its mind.
 */
export type BridgeWidgetTranslationStatus = "unknown" | "ready" | "translating" | "stopped";

export type BridgeWidgetState = {
  /** The translation room this window floats for — the `[roomId]` route segment. */
  roomId: string;
  /** `useTranslationRoom(roomId)`. Undefined until it answers, and if it fails. */
  room: TranslationRoomDto | undefined;
  /**
   * `user.id === room.hostId || room.isHost === true` — the same two halves as
   * bridge-overlay-controls.tsx. `isHost` alone is optional on the DTO, and a host whose payload
   * omitted it would be locked out of their own meeting. False while the room is loading.
   */
  isHost: boolean;

  /** True while any session from `useTranslationRoomSessions(roomId)` is ACTIVE. */
  translationStarted: boolean;
  /**
   * The same sessions query, read for the header: `ready` when no session has ever existed,
   * `translating` while one is ACTIVE, `stopped` when sessions exist and none is ACTIVE.
   */
  translationStatus: BridgeWidgetTranslationStatus;

  /**
   * Whether the written transcript is paused (WT-605). Translation, dubbing and captions keep
   * running through a pause — never present this as "translation paused".
   *
   * Source: `resolveTranscriptPause` over `useTranscriptPauseWindows(roomId)` and the
   * TranscriptPaused / TranscriptResumed broadcasts, exactly as persistent-meeting-session does
   * it. See `transcriptPauseKnown` and the group-membership note in use-bridge-widget-state.ts
   * for why, in this window, the window list is what actually answers.
   */
  transcriptPaused: boolean;
  /** ISO instant the pause in force began, or null (not paused, or learned from a broadcast). */
  transcriptPausedSince: string | null;
  /**
   * False until either source has answered. "Not told yet" is not "running": the in-meeting
   * panel shows no pause notice at all in that state, and a Pause button should not guess.
   */
  transcriptPauseKnown: boolean;

  /**
   * The transcript, oldest first, in the live wire shape. A segment revised by recognition
   * replaces its earlier copy by `segmentId`, never appends.
   *
   * `translations` is keyed by normalized language code; pick the reader's with
   * `resolveSegmentTranslation(segment, readerLanguage)` from lib/transcript/transcript-display.
   * `receivedAt` is absent on lines that came from the saved transcript.
   */
  segments: TranscriptSegmentDto[];

  /** This window's own connection to `/hubs/translation-room`. */
  connectionState: BridgeWidgetConnectionState;
  /**
   * The same connection, for slots that invoke hub methods:
   *
   *   hub.invoke("SetSpeakLanguage", roomId, code)
   *   hub.invoke("SetListenLanguage", roomId, code)
   *   hub.invoke("SetVoicePreference", roomId, voiceId)
   *
   * Null until the first successful start, and again once the connection has closed for good.
   * Invoke only while `connectionState === "live"` — during "reconnecting" the object is still
   * here and every invoke throws.
   *
   * These three are keyed by the caller's user id on the gateway, not by group membership, so
   * they work from this connection even though it never joins the room group. Two consequences
   * for whoever calls them (t4):
   *   - the main window keeps its own language in its own state and re-sends it on every hub
   *     reconnect, so a change made here can be overwritten by the main window later;
   *   - the gateway broadcasts ParticipantLanguageChanged to OthersInGroup, which includes the
   *     main window — about its own user id.
   */
  hub: HubConnection | null;

  /**
   * The language this user reads and hears, or null while it is not yet known.
   *
   * Resolved with the in-meeting precedence (lib/language/participant-language-preference):
   *   1. a pick made in this window through `setReaderLanguage`;
   *   2. this user's participant row (`listenLanguage`) from GET /translation-rooms/{id}/participants;
   *   3. the room default, which resolves to the participant's speak language before the room's
   *      other target (`resolveListenLanguage(…, room, resolveSpeakLanguage(…, room))`).
   * The main window's session-storage tier does not exist here: sessionStorage is per window.
   * Null until the room and the participant read have both answered, so the first value is the
   * real one rather than a room default that flips a second later.
   */
  readerLanguage: string | null;
  /**
   * Record a pick in this window. Local only — it does NOT tell the gateway; the caller invokes
   * SetListenLanguage / SetSpeakLanguage on `hub` itself. Normalized to a bare code ("vi").
   */
  setReaderLanguage: (code: string) => void;

  /**
   * True once this window has ended the session (t3's End flow calls `markEnded`). The shell then
   * swaps the tabs and dock for `EndedView`. Local to this window: a room ended from the main
   * window does not set it, because this window receives no room-group broadcasts.
   */
  ended: boolean;
  markEnded: () => void;
};

export const BridgeWidgetContext = createContext<BridgeWidgetState | null>(null);

export function BridgeWidgetProvider({
  roomId,
  children,
}: {
  roomId: string;
  children: ReactNode;
}) {
  const value = useBridgeWidgetState(roomId);
  return <BridgeWidgetContext.Provider value={value}>{children}</BridgeWidgetContext.Provider>;
}

/**
 * The widget's state, for any component under `BridgeWidgetProvider`.
 *
 * Throws outside it rather than returning a default: a slot rendered without the provider would
 * otherwise draw a confident "Ready" for a room it knows nothing about.
 */
export function useBridgeWidget(): BridgeWidgetState {
  const value = useContext(BridgeWidgetContext);
  if (!value) {
    throw new Error("useBridgeWidget must be used inside <BridgeWidgetProvider>.");
  }
  return value;
}
