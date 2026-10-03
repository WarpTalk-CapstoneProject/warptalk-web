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
 *   new token, and an automatic start is attempted once per token. Stopping by hand does not
 *   change the token, so nothing restarts; a refusal (quota, 403) does not either, so it is one
 *   toast rather than a loop.
 *
 * WHEN THE START FAILS (WT-916)
 *   A failure that says "not now" — 404 while the join is in flight, 503 from a cold room-type
 *   lookup, 502/504/408/429, no answer at all — is retried on a bounded schedule (2 s, 5 s, 15 s,
 *   30 s, then give up) for the SAME answer, re-checking the decision before each retry. A refusal
 *   is not retried. Giving up is told once: a toast in main and a "Recording didn't start" line with
 *   "Try again" in the popup, for host and capturer.
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

import type { ArmMeetWindowCaptureResult, MeetCallState } from "../desktop/bridge";
import { trustsMeetReading } from "./bridge-meet-follow.ts";

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
  /**
   * The token of the last answer an automatic start was attempted for in this room, if any.
   * `attempts` (WT-916): how many starts of the current chain were made for it; absent = 1.
   */
  handledToken: { roomId: string; token: number; attempts?: number } | null;
  /**
   * WT-916: a retry that is due now (its backoff timer fired, or "Try again" was pressed). It opens
   * the `already-handled` gate for exactly one more attempt of the SAME answer — and only that gate:
   * every other check below still runs, so a retry never fires once the recording is on, the answer
   * changed or was opted out, capture closed, or this user lost control.
   */
  retryDue?: BridgeRecordingRetry | null;
}

/** One scheduled retry of an automatic start. `attempt` is the number of the attempt it would make. */
export interface BridgeRecordingRetry {
  roomId: string;
  token: number;
  attempt: number;
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
  /** `attempt` is 1 for the answer's first start, and the retry's number for a retry. */
  | { type: "start"; token: number; attempt: number }
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
  //
  // WT-916 (decision): this is the guarantee, not a side effect. A default recording is NEVER
  // started for someone who was not shown the opt-out. A choice exists only when a `decide` from
  // the popup's ask carried `record` — the main-window fallback modal has no checkbox and the
  // direct device path asks nothing, so neither can produce one, and both end here.
  if (!choice) return { type: "none", reason: "no-choice" };
  if (!choice.record) return { type: "none", reason: "opted-out" };
  if (!input.canControl) return { type: "none", reason: "cannot-control" };
  let attempt = 1;
  const handled = input.handledToken;
  if (handled && handled.roomId === input.roomId && handled.token >= choice.token) {
    // A retry counts only for this answer, and only as the NEXT attempt of the chain: a due retry
    // that was already spent (or belongs to an older chain) opens nothing.
    const retry = input.retryDue;
    const retrying =
      !!retry &&
      retry.roomId === input.roomId &&
      retry.token === choice.token &&
      handled.token === choice.token &&
      retry.attempt === (handled.attempts ?? 1) + 1;
    if (!retrying) return { type: "none", reason: "already-handled" };
    attempt = retry.attempt;
  }
  if (input.starting) return { type: "none", reason: "already-starting" };
  if (!input.inboundOpen) return { type: "none", reason: "capture-not-open" };
  // Left unhandled on purpose: if this recording is stopped before capture next opens, the answer
  // still stands. In practice a recording that is already on when capture opens was started by the
  // same answer on another window, or by hand — either way there is nothing to start.
  if (input.recording) return { type: "none", reason: "already-recording" };
  return { type: "start", token: choice.token, attempt };
}

// ── when a start fails (WT-916) ──────────────────────────────────────────────

/**
 * The waits before attempts 2, 3, 4 and 5. After the fifth failure the start gives up. Roughly
 * a minute in all: long enough to outlast a join still in flight (404), a cold room-type lookup
 * (503) or a gateway blip, short enough that a call is not silently unrecorded for long.
 */
export const BRIDGE_RECORDING_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000];

/** What a failed start carries, from `getErrorStatus` and `apiErrorCode` (lib/api). */
export interface BridgeRecordingStartFailure {
  /** HTTP status; null when the request never got an answer (network, timeout). */
  status: number | null;
  code?: string | number | null;
}

/** HTTP statuses that say "not now" rather than "no". */
const TRANSIENT_STATUSES = new Set([404, 408, 429, 502, 503, 504]);
/**
 * A reason about money or quota is never "not now", whatever status it came with. Not "LIMIT": a
 * rate limit (429) IS "not now".
 */
const BILLING_CODE = /QUOTA|BUDGET|BILLING|CREDIT|PAYMENT|SUBSCRIPTION|EXHAUSTED/;

/**
 * Transient: worth asking again after a wait. Terminal: the server said no, or we cannot tell —
 * asking again would only repeat the toast.
 *
 * 404 is transient HERE, not in general: for this endpoint it means the `MeetingRoom` row does not
 * exist yet because the join is still in flight. 503 is the server failing closed on a room-type
 * lookup it calls temporary. 429 is retried only on this long, bounded schedule (5 attempts in about
 * a minute), never on the query client's quick one — see lib/api/retry-policy.
 */
export function classifyBridgeRecordingStartFailure(
  failure: BridgeRecordingStartFailure,
): "transient" | "terminal" {
  const code = typeof failure.code === "string" ? failure.code.toUpperCase() : "";
  if (code && BILLING_CODE.test(code)) return "terminal";
  if (failure.status === null) return "transient";
  return TRANSIENT_STATUSES.has(failure.status) ? "transient" : "terminal";
}

export type BridgeRecordingFailurePlan =
  | { type: "retry"; attempt: number; delayMs: number }
  | { type: "give-up"; reason: "terminal" | "exhausted" };

/**
 * After attempt number `failedAttempt` (1-based) failed: wait and try attempt `failedAttempt + 1`,
 * or stop. Giving up is the only outcome that tells anybody (one toast, one line in the popup).
 */
export function bridgeRecordingFailurePlan(
  failure: BridgeRecordingStartFailure,
  failedAttempt: number,
): BridgeRecordingFailurePlan {
  if (classifyBridgeRecordingStartFailure(failure) === "terminal") {
    return { type: "give-up", reason: "terminal" };
  }
  const index = Math.max(1, Math.floor(failedAttempt)) - 1;
  const delayMs = BRIDGE_RECORDING_RETRY_DELAYS_MS[index];
  if (delayMs === undefined) return { type: "give-up", reason: "exhausted" };
  return { type: "retry", attempt: index + 2, delayMs };
}

/**
 * Whether a scheduled retry may stay scheduled. Checked on every change while it waits, and the
 * decision is checked again when it fires: false the moment the recording is on, the answer changed
 * or was opted out, capture closed, this user lost control, or the room changed. A cancelled retry
 * is gone — capture reopening later does not bring it back.
 */
export function shouldKeepBridgeRecordingRetry(
  input: BridgeAutoRecordingInput,
  retry: BridgeRecordingRetry,
): boolean {
  if (retry.roomId !== input.roomId) return false;
  const choice = input.choice;
  if (!choice || choice.roomId !== input.roomId || choice.token !== retry.token) return false;
  // `starting` is ignored: the failing attempt is still winding down when its retry is scheduled.
  const decision = bridgeAutoRecordingDecision({ ...input, starting: false, retryDue: retry });
  return decision.type === "start" && decision.attempt === retry.attempt;
}

/**
 * Whether the Meet window's video should be on the wire.
 *
 * Only while there is a recording to put it in (or one being started) and the call is still being
 * captured. A recording stopped by hand takes the video with it: a window capture nobody is
 * recording is a screen being sent for nothing. The inbound leg closing for good — Stop listening
 * with no cable, the meeting ending, an idle reap — does the same.
 *
 * B18: and only while Meet is on its tab (`meetOnTab`, see meetWindowTabReading). `false` takes the
 * video down — the recording carries on audio-only — and `null` (a desktop without the call-state
 * sensor) leaves the rule as it was before B18.
 */
export function shouldPublishMeetWindow(input: {
  isBridgeRoom: boolean;
  inboundOpen: boolean;
  recording: boolean;
  starting: boolean;
  meetOnTab?: boolean | null;
}): boolean {
  if (input.meetOnTab === false) return false;
  return input.isBridgeRoom && input.inboundOpen && (input.recording || input.starting);
}

// ── B18: the video follows the Meet tab ──────────────────────────────────────

/**
 * How long Meet must stay on its tab before its window is published again. A window capture is
 * opened and published from scratch every time, so tab flapping must not thrash it. Leaving is
 * never delayed: the video goes down on the first reading that is not "on the tab".
 */
export const MEET_TAB_RETURN_HOLD_MS = 1_000;

/**
 * B18 (PO 2026-10-02): where the Meet call is, for the recording's picture.
 *
 * A window capture shows what its window shows. When Meet leaves its tab — Chrome's
 * Picture-in-Picture, or the user switches to another tab — the browser window shows something
 * that is not the meeting, so the video is taken down; the PiP window is never recorded either.
 * Audio is not affected.
 *
 *   "on-tab"   the desktop says the user is in the call (`in-call`) on the Meet tab (`via: "tab"`),
 *              and the reading is about this room's call (the codes match when both are known).
 *              Also `unknown` ON the Meet tab (`via: "tab"`): see below.
 *   "off-tab"  anything else from a desktop that has the sensor: `pip`, `lobby`, `left`, `unknown`
 *              with no surface (`via: null` — a tab switch, a failed probe), a reading about another
 *              call, or no reading yet. Fails closed.
 *
 * WHY `unknown` ON THE TAB COUNTS (production recording, 03 Oct)
 *   The desktop answers `unknown` with `via: "tab"` when it DID find the active tab at
 *   meet.google.com/<code> but could not read its buttons: an accessibility tree caught empty or
 *   mid-update, a listing that hit its cap with the people panel open, a Meet build that renamed
 *   its classes (meet-call-state.ts classifyMeetSurface: empty-tree, listing-truncated,
 *   controls-unrecognised). The window then shows Meet — exactly what B18 allows on the recording —
 *   and taking the picture down for it cut a bridge recording over to the native grid at 0:34 while
 *   Meet was plainly on screen. A tab switch without PiP reads as `unknown` with NO surface
 *   (`no-meet-surface`, `via: null`), so it is still off-tab.
 *   null       the desktop has no call-state sensor (built before WT-911): no B18, the rule is as
 *              it was. A documented gap.
 */
export type MeetTabReading = "on-tab" | "off-tab";

export function meetWindowTabReading(input: {
  /** The desktop exposes `onMeetCallState` (WT-911). */
  sensorAvailable: boolean;
  /** The desktop's last call state, or null before the first one. */
  call: Pick<MeetCallState, "phase" | "via" | "meetCode"> | null | undefined;
  /** The Meet code in the room's stored Meet URL, when it has one. */
  roomMeetCode: string | null | undefined;
}): MeetTabReading | null {
  if (!input.sensorAvailable) return null;
  const call = input.call;
  if (!call || !trustsMeetReading(call.meetCode, input.roomMeetCode)) return "off-tab";
  if (call.via !== "tab") return "off-tab";
  return call.phase === "in-call" || call.phase === "unknown" ? "on-tab" : "off-tab";
}

/**
 * `meetOnTab` for shouldPublishMeetWindow: a reading of "on-tab" counts only once it has held for
 * MEET_TAB_RETURN_HOLD_MS (`settled`, kept by a timer in the component); "off-tab" counts at once.
 */
export function meetWindowOnTab(reading: MeetTabReading | null, settled: boolean): boolean | null {
  if (reading === null) return null;
  return reading === "on-tab" && settled;
}

/**
 * B18: publish the Meet window AGAIN, because Meet came back to its tab while a recording runs.
 *
 * Only for a desktop with the sensor (`meetOnTab === true`; an older desktop never re-publishes, as
 * before), only once the recording is on (the start chain publishes the first picture itself), and
 * only while the picture is wanted at all. The publisher answers "published" at once when the
 * track is already up, so a true value that persists does no work.
 */
export function shouldRepublishMeetWindow(input: {
  isBridgeRoom: boolean;
  inboundOpen: boolean;
  recording: boolean;
  starting: boolean;
  meetOnTab: boolean | null;
}): boolean {
  return (
    input.meetOnTab === true &&
    input.recording &&
    !input.starting &&
    shouldPublishMeetWindow(input)
  );
}

/**
 * Whether the Meet window should be kept on the wire by the recovery loop (the session's Meet
 * window supervisor): a recording is running, nothing is starting it, and the picture is wanted.
 *
 * WHY A LOOP (production recording, 03 Oct)
 *   The window was taken down 34 s into a bridge recording and never came back for the remaining
 *   2.5 minutes. Re-publishing was tied to ONE transition — Meet settling back on its tab
 *   (shouldRepublishMeetWindow) — so a drop by any other road stayed dropped: the capture ending
 *   (`ended` on the source), the LiveKit room disconnecting, the publisher remounting, a re-arm
 *   the desktop refused once (`meet-window-not-found` while the HWND was being re-read,
 *   `consent-required` while the loopback leg was re-keyed), or an older desktop without the
 *   call-state sensor (`meetOnTab === null`), which never re-published at all. While this is true
 *   the session keeps asking the publisher, which answers "published" at once when the track is up.
 *
 * Off the tab (`meetOnTab === false`) it is false: B18 still takes the picture down there.
 */
export function shouldSuperviseMeetWindow(input: {
  isBridgeRoom: boolean;
  inboundOpen: boolean;
  recording: boolean;
  starting: boolean;
  meetOnTab: boolean | null;
}): boolean {
  return input.recording && !input.starting && shouldPublishMeetWindow(input);
}

/** How often a supervised Meet window that is up is checked again. Free: no IPC, no capture. */
export const MEET_WINDOW_SUPERVISE_INTERVAL_MS = 3_000;

/**
 * Back-off between attempts to bring a dropped Meet window back. Each attempt arms the desktop
 * (a window enumeration) and opens a capture, so it is spaced out, but never further than 15 s: a
 * recording without its picture is the failure this exists for.
 */
export const MEET_WINDOW_RECOVERY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000] as const;

export function meetWindowRecoveryDelayMs(consecutiveFailures: number): number {
  const index = Math.min(Math.max(consecutiveFailures, 1), MEET_WINDOW_RECOVERY_DELAYS_MS.length) - 1;
  return MEET_WINDOW_RECOVERY_DELAYS_MS[index];
}

/**
 * Whether the start chain may open the Meet window as the recording's first picture. Off the tab it
 * starts audio-only, and the picture follows when Meet is back (shouldRepublishMeetWindow).
 */
export function mayCaptureMeetWindowAtStart(meetOnTab: boolean | null): boolean {
  return meetOnTab !== false;
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
    case "meet-not-on-tab":
      return "Google Meet is not on its tab (Picture-in-Picture or another tab)";
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
  /**
   * WT-916: when main saw THIS recording start (its own clock). The identity of one recording, so
   * the popup can say "tell everyone in the call" once per start. Optional: absent while not
   * recording, and from a main window that predates it — then no notice is shown.
   */
  startedAt?: number;
  /**
   * WT-916: the automatic start gave up (refused, or still failing after its retries). Only while
   * not recording; `reason` is the sentence main toasted. Optional, version unchanged: a popup
   * that predates it ignores it, and a malformed one is dropped, never the whole snapshot.
   */
  failed?: { reason: string };
}

/** Longest `failed.reason` carried; anything longer is cut. One line in a 435 px popup. */
const MAX_FAILED_REASON_LENGTH = 200;

/** Popup to main: a request, never a statement of state. */
export type BridgeRecordingIntent =
  /** The popup mounted or became visible: please republish, because the channel does not replay. */
  | { v: 1; kind: "hello"; roomId: string }
  | { v: 1; kind: "stop"; roomId: string }
  /** WT-916: "Try again" after the automatic start gave up. Main re-checks everything. */
  | { v: 1; kind: "retry"; roomId: string };

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
        return withFailed(
          withStartedAt(
            { v, kind: "snapshot", roomId, recording: data.recording, canStop: data.canStop },
            data.startedAt,
          ),
          data.failed,
        );
      case "hello":
        return { v, kind: "hello", roomId };
      case "stop":
        return { v, kind: "stop", roomId };
      case "retry":
        return { v, kind: "retry", roomId };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** A hint, like the consent snapshot's: kept when it is a usable number while recording, else dropped. */
function withStartedAt(snapshot: BridgeRecordingSnapshot, startedAt: unknown): BridgeRecordingSnapshot {
  if (snapshot.recording && typeof startedAt === "number" && Number.isFinite(startedAt)) {
    snapshot.startedAt = startedAt;
  }
  return snapshot;
}

/**
 * WT-916: tolerant, like startedAt — kept only on a non-recording snapshot, as a fresh object with a
 * non-empty, trimmed, length-capped `reason`; anything else is dropped and the snapshot stands.
 */
function withFailed(snapshot: BridgeRecordingSnapshot, failed: unknown): BridgeRecordingSnapshot {
  if (snapshot.recording || !isRecord(failed)) return snapshot;
  const reason = typeof failed.reason === "string" ? failed.reason.trim() : "";
  if (reason.length === 0) return snapshot;
  snapshot.failed = { reason: reason.slice(0, MAX_FAILED_REASON_LENGTH) };
  return snapshot;
}

export function buildBridgeRecordingSnapshot(input: {
  roomId: string;
  recording: boolean;
  canStop: boolean;
  startedAt?: number | null;
  failed?: { reason: string } | null;
}): BridgeRecordingSnapshot {
  return withFailed(
    withStartedAt(
      {
        v: BRIDGE_RECORDING_RELAY_VERSION,
        kind: "snapshot",
        roomId: input.roomId,
        recording: input.recording,
        canStop: input.canStop,
      },
      input.startedAt,
    ),
    input.failed,
  );
}

export type BridgeRecordingAction = { type: "republish" } | { type: "stop" } | { type: "retry" };

/**
 * Main side: what an incoming message may do. null = ignore.
 *
 * A stop is honoured only while main itself says the room is recording AND this user may stop it;
 * the popup's own belief about either is not consulted.
 */
export function resolveBridgeRecordingIntent(
  message: BridgeRecordingMessage,
  host: { roomId: string; recording: boolean; canStop: boolean; failed?: { reason: string } | null },
): BridgeRecordingAction | null {
  if (message.kind === "snapshot") return null;
  if (message.roomId !== host.roomId) return null;
  switch (message.kind) {
    case "hello":
      return { type: "republish" };
    case "stop":
      return host.recording && host.canStop ? { type: "stop" } : null;
    case "retry":
      // Only what main says now: this user may control it, nothing is recording, and main itself
      // still holds a give-up to retry. A stale popup's press after any of that moved is ignored.
      return host.canStop && !host.recording && host.failed ? { type: "retry" } : null;
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

/**
 * WT-916 — "Recording started. Tell everyone in the call."
 *
 * People who are only in Google Meet cannot see WarpTalk's REC chip, and WarpTalk cannot draw
 * inside Meet. So the person who can control the bridge is asked to say it out loud: once per
 * recording START, to the room host or capturer only (`canStop` is exactly that), until they
 * dismiss it or the recording stops. A later recording is a new start and asks again.
 *
 * `dismissedStartedAt` is the `startedAt` of the recording whose notice was dismissed, or null.
 */
export function shouldShowRecordingStartNotice(
  snapshot: BridgeRecordingSnapshot | null,
  roomId: string,
  dismissedStartedAt: number | null,
): boolean {
  if (!snapshot || snapshot.roomId !== roomId) return false;
  if (!snapshot.recording || !snapshot.canStop) return false;
  if (typeof snapshot.startedAt !== "number") return false;
  return snapshot.startedAt !== dismissedStartedAt;
}

/**
 * WT-916 — "Recording didn't start" with "Try again", to the room host or capturer only (`canStop`):
 * they are the only ones the server lets start it. Nobody else is offered a line they cannot act on.
 */
export function bridgeRecordingFailedView(
  snapshot: BridgeRecordingSnapshot | null,
  roomId: string,
): { reason: string } | null {
  if (!snapshot || snapshot.roomId !== roomId) return null;
  if (snapshot.recording || !snapshot.canStop || !snapshot.failed) return null;
  return { reason: snapshot.failed.reason };
}
