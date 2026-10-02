/**
 * Recording a bridged Google Meet call. WT-910.
 *
 * THE DECISION (PO, 2026-10-01)
 *   Google Meet refuses its own recording to most accounts, so WarpTalk records the call instead.
 *   For a bridge room that recording is ON BY DEFAULT and opt-out: the consent prompt that asks to
 *   listen to the browser carries a "Record this meeting" checkbox, checked, and the answer travels
 *   with the same press (bridge-capture-consent-relay's `decide`).
 *
 *   A NATIVE meeting keeps its rule unchanged: recording is never started for you there (see
 *   "RECORDING IS NEVER STARTED FOR YOU" in persistent-meeting-session.tsx). This module is the
 *   bridge-only exception, and it is an exception with an answer behind it — nothing here starts a
 *   recording that somebody was not shown a checkbox for.
 *
 * WHEN IT STARTS
 *   When CAPTURE starts — the inbound leg (the far side of the call) is open — not when translation
 *   starts. A call that is listened to and transcribed but never translated is still the meeting,
 *   and waiting for Start Translation would leave its first minutes out of the file exactly as
 *   WT-828 found it left them out of the transcript.
 *
 * WHY THE CHOICE CARRIES A TOKEN
 *   "Start once" has to survive re-renders, a reconnect of the inbound leg, and a host who stops
 *   the recording by hand: none of those may start it again. But a host who stops listening and
 *   then answers the question again, with the box checked, HAS asked again. So every answer is a
 *   new token, and an automatic start is attempted at most once per token. Stopping by hand does
 *   not change the token, so nothing restarts; a failed start does not either, so a refusal (quota,
 *   403) is one toast rather than a loop.
 *
 * WHAT THE POPUP IS TOLD
 *   The recording state lives in the main window (RecordingStateChanged on its hub connection; the
 *   popup's own connection never joins the room group). A small relay on its own BroadcastChannel
 *   mirrors it — the same shape as the consent relay, for the same reasons: main publishes whole
 *   snapshots, the popup sends intents, and main re-checks every intent against its own state,
 *   because any same-origin page can post on the channel and the popup can be stale.
 *
 * Pure on purpose: no React, no DOM, no channel, no LiveKit.
 */

import type { ArmMeetWindowCaptureResult } from "../desktop/bridge";

// ── the choice ───────────────────────────────────────────────────────────────

/** What the user answered about recording, for one room. */
export interface BridgeRecordChoice {
  roomId: string;
  record: boolean;
  /** A new number for every answer. See WHY THE CHOICE CARRIES A TOKEN. */
  token: number;
}

/** The choice after an answer. A different room starts its own count. */
export function nextBridgeRecordChoice(
  current: BridgeRecordChoice | null,
  answer: { roomId: string; record: boolean },
): BridgeRecordChoice {
  const previousToken = current && current.roomId === answer.roomId ? current.token : 0;
  return { roomId: answer.roomId, record: answer.record, token: previousToken + 1 };
}

// ── the automatic start ──────────────────────────────────────────────────────

export interface BridgeAutoRecordingInput {
  roomId: string;
  isBridgeRoom: boolean;
  /** The inbound leg — the far side of the call — is open and published. */
  inboundOpen: boolean;
  /** The room host or the bridge capturer (`canControlBridge`); the backend refuses anybody else. */
  canControl: boolean;
  choice: BridgeRecordChoice | null;
  /** The room is being recorded, as the server last said. */
  recording: boolean;
  /** An automatic start is already in flight. */
  starting: boolean;
  /** The token of the last answer an automatic start was attempted for in this room, if any. */
  handledToken: { roomId: string; token: number } | null;
}

export type BridgeAutoRecordingReason =
  | "not-bridge"
  | "no-choice"
  | "opted-out"
  | "cannot-control"
  | "capture-not-open"
  | "already-recording"
  | "already-starting"
  | "already-handled";

export type BridgeAutoRecordingDecision =
  | { type: "start"; token: number }
  | { type: "none"; reason: BridgeAutoRecordingReason };

/**
 * Whether to start the recording now. `start` at most once per answer: the caller records the
 * token as handled BEFORE it does anything asynchronous, and every later call says `already-handled`.
 */
export function bridgeAutoRecordingDecision(
  input: BridgeAutoRecordingInput,
): BridgeAutoRecordingDecision {
  if (!input.isBridgeRoom) return { type: "none", reason: "not-bridge" };
  const choice = input.choice && input.choice.roomId === input.roomId ? input.choice : null;
  // Nobody was shown the checkbox in this room (a reload, the main-window fallback, a machine that
  // never asks). Default-on is the checkbox's default, not a licence to record without it.
  if (!choice) return { type: "none", reason: "no-choice" };
  if (!choice.record) return { type: "none", reason: "opted-out" };
  if (!input.canControl) return { type: "none", reason: "cannot-control" };
  if (
    input.handledToken &&
    input.handledToken.roomId === input.roomId &&
    input.handledToken.token >= choice.token
  ) {
    return { type: "none", reason: "already-handled" };
  }
  if (input.starting) return { type: "none", reason: "already-starting" };
  if (!input.inboundOpen) return { type: "none", reason: "capture-not-open" };
  // Left unhandled on purpose: if this recording is stopped before capture next opens, the answer
  // still stands. In practice a recording that is already on when capture opens was started by the
  // same answer on another window, or by hand — either way there is nothing to start.
  if (input.recording) return { type: "none", reason: "already-recording" };
  return { type: "start", token: choice.token };
}

/**
 * Whether the Meet window's video should be on the wire.
 *
 * Only while there is a recording to put it in (or one being started) and the call is still being
 * captured. A recording stopped by hand takes the video with it: a window capture nobody is
 * recording is a screen being sent for nothing. The inbound leg closing for good — Stop listening
 * with no cable, the meeting ending, an idle reap — does the same.
 */
export function shouldPublishMeetWindow(input: {
  isBridgeRoom: boolean;
  inboundOpen: boolean;
  recording: boolean;
  starting: boolean;
}): boolean {
  return input.isBridgeRoom && input.inboundOpen && (input.recording || input.starting);
}

/** Why the recording is audio-only, in words for a log line. */
export function describeMeetWindowCaptureFailure(
  result: ArmMeetWindowCaptureResult | "no-desktop-method" | "capture-failed" | "publish-failed",
): string {
  if (typeof result === "string") {
    switch (result) {
      case "no-desktop-method":
        return "this desktop build cannot capture the Meet window";
      case "capture-failed":
        return "the Meet window could not be opened as a video source";
      case "publish-failed":
        return "the Meet window's video could not be published";
    }
  }
  if (result.ok) return "captured";
  switch (result.reason) {
    case "meet-sighting-missing":
      return "the desktop app has not seen a Google Meet window";
    case "meet-window-not-found":
      return "the Google Meet window could not be found";
    case "unsupported-platform":
      return "window capture is not supported on this platform";
    case "not-main-window":
      return "the request did not come from the main window";
    case "consent-required":
      return "the desktop app has no consent to capture on record";
    default:
      return "the desktop app refused the capture";
  }
}

// ── the relay to the popup ───────────────────────────────────────────────────

export const BRIDGE_RECORDING_RELAY_VERSION = 1;

const CHANNEL_PREFIX = "warptalk:bridge-recording:";

/** The one channel name for a room. Both sides must build it from here. */
export function bridgeRecordingChannelName(roomId: string): string {
  return `${CHANNEL_PREFIX}${roomId}`;
}

/** Main to popup: the whole state, every time. */
export interface BridgeRecordingSnapshot {
  v: 1;
  kind: "snapshot";
  roomId: string;
  recording: boolean;
  /** This user may stop it (room host or capturer). The server has the last word. */
  canStop: boolean;
}

/** Popup to main: a request, never a statement of state. */
export type BridgeRecordingIntent =
  /** The popup mounted or became visible: please republish, because the channel does not replay. */
  | { v: 1; kind: "hello"; roomId: string }
  | { v: 1; kind: "stop"; roomId: string };

export type BridgeRecordingMessage = BridgeRecordingSnapshot | BridgeRecordingIntent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict: wrong version, unknown kind, a missing or mistyped field, an empty roomId → null. Never
 * throws, and returns a fresh object with only the known fields.
 */
export function parseBridgeRecordingMessage(data: unknown): BridgeRecordingMessage | null {
  try {
    if (!isRecord(data)) return null;
    if (data.v !== BRIDGE_RECORDING_RELAY_VERSION) return null;
    const roomId = data.roomId;
    if (typeof roomId !== "string" || roomId.length === 0) return null;
    const v = BRIDGE_RECORDING_RELAY_VERSION;
    switch (data.kind) {
      case "snapshot":
        if (typeof data.recording !== "boolean" || typeof data.canStop !== "boolean") return null;
        return { v, kind: "snapshot", roomId, recording: data.recording, canStop: data.canStop };
      case "hello":
        return { v, kind: "hello", roomId };
      case "stop":
        return { v, kind: "stop", roomId };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function buildBridgeRecordingSnapshot(input: {
  roomId: string;
  recording: boolean;
  canStop: boolean;
}): BridgeRecordingSnapshot {
  return {
    v: BRIDGE_RECORDING_RELAY_VERSION,
    kind: "snapshot",
    roomId: input.roomId,
    recording: input.recording,
    canStop: input.canStop,
  };
}

export type BridgeRecordingAction = { type: "republish" } | { type: "stop" };

/**
 * Main side: what an incoming message may do. null = ignore.
 *
 * A stop is honoured only while main itself says the room is recording AND this user may stop it;
 * the popup's own belief about either is not consulted.
 */
export function resolveBridgeRecordingIntent(
  message: BridgeRecordingMessage,
  host: { roomId: string; recording: boolean; canStop: boolean },
): BridgeRecordingAction | null {
  if (message.kind === "snapshot") return null;
  if (message.roomId !== host.roomId) return null;
  switch (message.kind) {
    case "hello":
      return { type: "republish" };
    case "stop":
      return host.recording && host.canStop ? { type: "stop" } : null;
    default:
      return null;
  }
}

/** Popup side: what to draw. */
export type BridgeRecordingChipView = { kind: "hidden" } | { kind: "recording"; canStop: boolean };

export function bridgeRecordingChipView(
  snapshot: BridgeRecordingSnapshot | null,
  roomId: string,
): BridgeRecordingChipView {
  if (!snapshot || snapshot.roomId !== roomId || !snapshot.recording) return { kind: "hidden" };
  return { kind: "recording", canStop: snapshot.canStop };
}
