/**
 * The loopback consent question, asked in the bridge popup and answered in the main window.
 *
 * WHAT WAS WRONG
 *   An EXTERNAL_BRIDGE host on Windows has to agree before WarpTalk listens to their whole browser
 *   (browser-capture-consent.ts). The dialog asking for that opened in the desktop MAIN window,
 *   because that is where PersistentMeetingSession runs, and the inbound leg is part of it. But a
 *   bridge host is looking at Google Meet with the always-on-top popup floating over it; the main
 *   window is behind both. The question sat there unseen, and the inbound leg waited on an answer
 *   nobody knew was being asked.
 *
 * WHY THE MAIN WINDOW STAYS THE ONE SOURCE OF TRUTH
 *   The answer gates a capture, and the capture is the main window's. If the popup kept its own
 *   copy of "have we asked, what did they say, which source", the two copies could disagree, and
 *   the one that decides whether the browser is heard is the one the host is not looking at. So the
 *   popup owns nothing. The main window PUBLISHES a snapshot of its state on a BroadcastChannel and
 *   the popup renders whatever the last snapshot said.
 *
 * WHY THE POPUP ONLY SENDS INTENTS, AND MAIN CHECKS EVERY ONE
 *   The popup's buttons send what the host wants, never what the state now is. Main then asks
 *   resolveBridgeConsentIntent whether that intent still makes sense, for two reasons:
 *   - any same-origin page can post on the channel, and in the desktop shell both windows share
 *     one origin and one session, so "it arrived on our channel" proves nothing about who sent it;
 *   - the popup can be stale. A click made against a snapshot that has since moved on - a source
 *     that vanished from the list, a "required" that is now "declined" - must not be applied as if
 *     it were current. A grant in particular is only honoured for a source main itself has
 *     selected and still lists.
 *
 * WHY THERE IS A `hello`
 *   BroadcastChannel has no replay. A popup that opens, reloads, or comes back from being hidden
 *   after main last published has missed the snapshot and will not get another until main's state
 *   changes, which may be never. `hello` is the popup saying "I am here, tell me again".
 *
 * WHY MAIN WAITS FOR AN `ack` BEFORE RAISING THE POPUP
 *   When the question has been asked and nobody is visibly showing it, main can raise the popup
 *   with openTranscriptWindow. But calling that on a popup that is already open fires an OS
 *   notification, so raising on every ask would put a toast in front of a host who is already
 *   looking at the prompt. The popup acknowledges a "required" snapshot once it is actually on
 *   screen; main raises only if that has not happened within CONSENT_POPUP_RAISE_GRACE_MS.
 *
 * Pure on purpose: no React, no DOM, no channel. Both sides wrap it in a hook; what is decided
 * here is what may be said on the channel and what each side does about it.
 */

import type { BrowserCaptureConsentState } from "../audio/browser-capture-consent";
import type { InboundHealth } from "../audio/bridge-inbound-health";
import type { BridgeInboundPath, BridgeInboundReason } from "../desktop/bridge-tiers";

/** Every message carries it, so a desktop build running an older popup is ignored, not misread. */
export const BRIDGE_CONSENT_PROTOCOL_VERSION = 1;

/** How long the main window waits for the popup to acknowledge a "required" snapshot before raising it. */
export const CONSENT_POPUP_RAISE_GRACE_MS = 1500;

/**
 * WT-900. While the question stays open, how often main checks again that the popup is still
 * showing it - and, after a raise, how long it waits for the raised popup to say so.
 */
export const CONSENT_POPUP_RECHECK_MS = 60_000;

/** WT-900. Raises in a row that no `ack` followed before the question moves to the main window. */
export const CONSENT_POPUP_MAX_UNANSWERED_RAISES = 2;

/**
 * Raises one question may cost in total, acknowledged or not, before it moves to the main window.
 *
 * CONSENT_POPUP_MAX_UNANSWERED_RAISES alone did not bound anything. Every raise opens the popup, the
 * opened popup acks the moment it is on screen, and an ack resets that count at the next check. So
 * a host who closed the popup without answering got it back - focused, with the OS notification -
 * one recheck later, for as long as the question stayed open: in production, long after they had
 * left the Meet call. This count is never reset by an ack, only by an answer or another room, and
 * it outlives the raise loop's restarts (see ConsentRaiseBudget).
 */
export const CONSENT_POPUP_MAX_RAISES_PER_QUESTION = 3;

/** A process the loopback could listen to, reduced to what the popup needs to offer it. */
export interface BridgeConsentSource {
  id: string;
  name: string;
}

/** Main to popup: the whole of main's consent state, every time. Never a delta. */
export interface BridgeConsentSnapshot {
  v: 1;
  kind: "snapshot";
  roomId: string;
  consent: BrowserCaptureConsentState;
  sources: BridgeConsentSource[];
  selectedSourceId: string | null;
  loadingSources: boolean;
  /**
   * WT-900, optional so an older main is still read: where the far side comes in right now, why,
   * and whether anything is arriving. The popup uses them to ask quietly while the cable already
   * carries Meet (see isCompactConsentAsk). Absent means "not said", never a guess.
   */
  inboundPath?: BridgeInboundPath;
  inboundReason?: BridgeInboundReason;
  inboundHealth?: InboundHealth;
}

/** Popup to main: what the host asked for. A request, never a statement of state. */
export type BridgeConsentIntent =
  /** The popup mounted or became visible: please republish, because the channel does not replay. */
  | { v: 1; kind: "hello"; roomId: string }
  /** The popup is visibly showing the "required" prompt, so main need not raise it. */
  | { v: 1; kind: "ack"; roomId: string }
  | { v: 1; kind: "select-source"; roomId: string; sourceId: string }
  | { v: 1; kind: "decide"; roomId: string; granted: boolean }
  /** Declined, and now the host wants to be asked again. */
  | { v: 1; kind: "reconsider"; roomId: string };

export type BridgeConsentMessage = BridgeConsentSnapshot | BridgeConsentIntent;

const CONSENT_STATES: ReadonlySet<string> = new Set<BrowserCaptureConsentState>([
  "not-required",
  "required",
  "granted",
  "declined",
]);

const INBOUND_PATHS: ReadonlySet<string> = new Set<BridgeInboundPath>(["loopback", "device"]);

const INBOUND_REASONS: ReadonlySet<string> = new Set<BridgeInboundReason>([
  "loopback",
  "awaiting-consent",
  "device-while-asking",
  "awaiting-source",
  "loopback-unavailable",
  "loopback-failed",
  "consent-declined",
  "no-source",
]);

const INBOUND_HEALTHS: ReadonlySet<string> = new Set<InboundHealth>([
  "unknown",
  "listening",
  "quiet",
  "no-signal",
]);

/** An optional enum field: the value when it is one of `allowed`, otherwise nothing at all. */
function optionalMember<T extends string>(value: unknown, allowed: ReadonlySet<string>): T | undefined {
  return typeof value === "string" && allowed.has(value) ? (value as T) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseSources(value: unknown): BridgeConsentSource[] | null {
  if (!Array.isArray(value)) return null;
  const sources: BridgeConsentSource[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isNonEmptyString(item.id) || typeof item.name !== "string") {
      return null;
    }
    sources.push({ id: item.id, name: item.name });
  }
  return sources;
}

/**
 * Strict validation of whatever arrived on the channel. Wrong version, unknown kind,
 * missing/mistyped field, empty roomId, a consent value outside the union, a malformed source →
 * null. Never throws. Strips unknown extra fields (return a fresh object with only the known
 * fields).
 *
 * The WT-900 inbound fields are the exception to "mistyped means rejected": they are optional
 * hints added without a version bump, so a value this build does not know (a newer main, a new
 * reason) is DROPPED and the rest of the snapshot kept. Rejecting the whole snapshot over a hint
 * would hide the question itself.
 *
 * Strict because the channel is open to every same-origin page, and one bad source in a list is
 * reason enough to distrust the rest of the message. Fresh objects because whatever came in was
 * structured-cloned from someone else's data, and nothing unknown should ride along into state.
 */
export function parseBridgeConsentMessage(data: unknown): BridgeConsentMessage | null {
  try {
    if (!isRecord(data)) return null;
    if (data.v !== BRIDGE_CONSENT_PROTOCOL_VERSION) return null;
    const roomId = data.roomId;
    if (!isNonEmptyString(roomId)) return null;
    const v = BRIDGE_CONSENT_PROTOCOL_VERSION;

    switch (data.kind) {
      case "snapshot": {
        const consent = data.consent;
        if (typeof consent !== "string" || !CONSENT_STATES.has(consent)) return null;
        const sources = parseSources(data.sources);
        if (!sources) return null;
        const selectedSourceId = data.selectedSourceId;
        if (selectedSourceId !== null && !isNonEmptyString(selectedSourceId)) return null;
        if (typeof data.loadingSources !== "boolean") return null;
        const snapshot: BridgeConsentSnapshot = {
          v,
          kind: "snapshot",
          roomId,
          consent: consent as BrowserCaptureConsentState,
          sources,
          selectedSourceId,
          loadingSources: data.loadingSources,
        };
        const inboundPath = optionalMember<BridgeInboundPath>(data.inboundPath, INBOUND_PATHS);
        const inboundReason = optionalMember<BridgeInboundReason>(data.inboundReason, INBOUND_REASONS);
        const inboundHealth = optionalMember<InboundHealth>(data.inboundHealth, INBOUND_HEALTHS);
        if (inboundPath) snapshot.inboundPath = inboundPath;
        if (inboundReason) snapshot.inboundReason = inboundReason;
        if (inboundHealth) snapshot.inboundHealth = inboundHealth;
        return snapshot;
      }
      case "hello":
        return { v, kind: "hello", roomId };
      case "ack":
        return { v, kind: "ack", roomId };
      case "select-source":
        if (!isNonEmptyString(data.sourceId)) return null;
        return { v, kind: "select-source", roomId, sourceId: data.sourceId };
      case "decide":
        if (typeof data.granted !== "boolean") return null;
        return { v, kind: "decide", roomId, granted: data.granted };
      case "reconsider":
        return { v, kind: "reconsider", roomId };
      default:
        return null;
    }
  } catch {
    // A getter on a hostile object, a revoked proxy: nothing on the channel may take a window down.
    return null;
  }
}

/**
 * Main side: build the snapshot from its state. Maps sources to {id,name} only (callers pass
 * WindowsLoopbackSource objects that carry more fields — accept `ReadonlyArray<{ id: string; name:
 * string }>`).
 *
 * Only id and name leave the main window. Window handles and process ids are for the capture, and
 * every same-origin page can read what is posted here.
 */
export function buildBridgeConsentSnapshot(input: {
  roomId: string;
  consent: BrowserCaptureConsentState;
  sources: ReadonlyArray<{ id: string; name: string }>;
  selectedSourceId: string | null;
  loadingSources: boolean;
  inboundPath?: BridgeInboundPath | null;
  inboundReason?: BridgeInboundReason | null;
  inboundHealth?: InboundHealth | null;
}): BridgeConsentSnapshot {
  const snapshot: BridgeConsentSnapshot = {
    v: BRIDGE_CONSENT_PROTOCOL_VERSION,
    kind: "snapshot",
    roomId: input.roomId,
    consent: input.consent,
    sources: input.sources.map((source) => ({ id: source.id, name: source.name })),
    selectedSourceId: input.selectedSourceId,
    loadingSources: input.loadingSources,
  };
  if (input.inboundPath) snapshot.inboundPath = input.inboundPath;
  if (input.inboundReason) snapshot.inboundReason = input.inboundReason;
  if (input.inboundHealth) snapshot.inboundHealth = input.inboundHealth;
  return snapshot;
}

/**
 * WT-900 - ask quietly, or ask prominently?
 *
 * Quietly (one line: "Listening through Hi-Fi Cable. Switch to listening to the browser?") only
 * while the far side is ALREADY being heard through the cable: the leg is on the device because
 * the question is open, and the meter says Meet is arriving. Then nothing is waiting on the answer,
 * and a framed prompt over the transcript would be asking the host to fix something that is not
 * broken. Anywhere else - the cable carrying silence, no reading yet, no cable at all - the answer
 * is what stands between the host and hearing the far side, so it keeps the full prompt.
 */
export function isCompactConsentAsk(input: {
  inboundReason?: BridgeInboundReason | null;
  inboundHealth?: InboundHealth | null;
}): boolean {
  return input.inboundReason === "device-while-asking" && input.inboundHealth === "listening";
}

/** What main knows right now, which is what every intent is checked against. */
export interface BridgeConsentHostView {
  roomId: string;
  consent: BrowserCaptureConsentState;
  sourceIds: readonly string[];
  selectedSourceId: string | null;
}

/** What main may do about an intent that survived the checks. */
export type BridgeConsentAction =
  | { type: "republish" }
  | { type: "acknowledged" }
  | { type: "select-source"; sourceId: string }
  | { type: "answer"; granted: boolean }
  | { type: "reask" };

/**
 * Main side: what an incoming message may do. null = ignore.
 *
 * Every rule is phrased against main's state, not the popup's, because the popup's may be stale:
 * - a snapshot is main talking to itself, or another main; never an instruction;
 * - another room's message is for another session;
 * - `hello` is always answered, whatever the state, since a republish changes nothing;
 * - `ack` only counts while there is a question to acknowledge;
 * - a source can only be picked from main's own list, while the question is open;
 * - a grant needs main's own selection to still be in main's own list, so a popup cannot grant
 *   listening to something main never chose;
 * - a refusal is honoured while asked (decline) and while listening (revoke, "Stop listening"),
 *   because stopping a capture must never need a precondition; it is ignored where there is
 *   nothing to refuse;
 * - asking again only makes sense after a decline.
 */
export function resolveBridgeConsentIntent(
  message: BridgeConsentMessage,
  host: BridgeConsentHostView,
): BridgeConsentAction | null {
  if (message.kind === "snapshot") return null;
  if (message.roomId !== host.roomId) return null;

  switch (message.kind) {
    case "hello":
      return { type: "republish" };
    case "ack":
      return host.consent === "required" ? { type: "acknowledged" } : null;
    case "select-source":
      if (host.consent !== "required") return null;
      if (!host.sourceIds.includes(message.sourceId)) return null;
      return { type: "select-source", sourceId: message.sourceId };
    case "decide":
      if (message.granted) {
        if (host.consent !== "required") return null;
        if (host.selectedSourceId === null) return null;
        if (!host.sourceIds.includes(host.selectedSourceId)) return null;
        return { type: "answer", granted: true };
      }
      if (host.consent === "required" || host.consent === "granted") {
        return { type: "answer", granted: false };
      }
      return null;
    case "reconsider":
      return host.consent === "declined" ? { type: "reask" } : null;
    default:
      return null;
  }
}

/** Where the consent question is shown, if anywhere. */
export type BridgeConsentSurface = "none" | "popup" | "main";

/**
 * Where the question is asked. consent !== "required" → "none"; popupAvailable → "popup"; else
 * "main" (fallback: no popup on this machine).
 *
 * The main window keeps its dialog as the fallback so that a desktop build without the popup, or
 * a popup that could not be opened, still gets asked somewhere rather than nowhere.
 */
export function bridgeConsentSurface(input: {
  consent: BrowserCaptureConsentState;
  popupAvailable: boolean;
}): BridgeConsentSurface {
  if (input.consent !== "required") return "none";
  return input.popupAvailable ? "popup" : "main";
}

/**
 * Main side: raise the popup? true only when surface === "popup" && !acknowledged && nowMs -
 * askedAtMs >= graceMs (default CONSENT_POPUP_RAISE_GRACE_MS).
 *
 * The grace is there because an open popup usually acknowledges within a round trip, and raising
 * an already-open popup costs the host an OS notification for nothing. Only silence past the grace
 * means the prompt is genuinely not on screen.
 */
export function shouldRaiseConsentPopup(input: {
  surface: BridgeConsentSurface;
  acknowledged: boolean;
  askedAtMs: number;
  nowMs: number;
  graceMs?: number;
}): boolean {
  const graceMs = input.graceMs ?? CONSENT_POPUP_RAISE_GRACE_MS;
  return input.surface === "popup" && !input.acknowledged && input.nowMs - input.askedAtMs >= graceMs;
}

/** Popup side: what to render. */
export type BridgeConsentPromptView =
  | { kind: "hidden" }
  | {
      kind: "ask";
      sources: BridgeConsentSource[];
      selectedSourceId: string | null;
      loadingSources: boolean;
      canConfirm: boolean;
      /** WT-900: render as the non-blocking one-line ask rather than the framed prompt. */
      compact: boolean;
    }
  /**
   * The host said yes, and this is which source they said yes TO — a permission, not a live
   * reading. The main window stops the inbound leg on an idle reap, a failed open and a dropped
   * connection without any of them changing the answer, so a surface that renders this as
   * "listening right now" will say so while nothing is being captured.
   */
  | { kind: "listening"; sourceName: string | null }
  | { kind: "declined" };

/**
 * snapshot null, for another room, or "not-required" → hidden. required → ask (canConfirm =
 * selectedSourceId is non-null and present in sources). granted → listening (sourceName = the
 * selected source's name, or null if not in the list). declined → declined.
 *
 * canConfirm mirrors the check main makes on a grant, so the popup does not offer a button whose
 * press main is certain to ignore.
 */
export function bridgeConsentPromptView(
  snapshot: BridgeConsentSnapshot | null,
  roomId: string,
): BridgeConsentPromptView {
  if (!snapshot || snapshot.roomId !== roomId) return { kind: "hidden" };

  const selected =
    snapshot.selectedSourceId === null
      ? undefined
      : snapshot.sources.find((source) => source.id === snapshot.selectedSourceId);

  switch (snapshot.consent) {
    case "required":
      return {
        kind: "ask",
        sources: snapshot.sources.map((source) => ({ id: source.id, name: source.name })),
        selectedSourceId: snapshot.selectedSourceId,
        loadingSources: snapshot.loadingSources,
        canConfirm: selected !== undefined,
        compact: isCompactConsentAsk(snapshot),
      };
    case "granted":
      return { kind: "listening", sourceName: selected?.name ?? null };
    case "declined":
      return { kind: "declined" };
    default:
      return { kind: "hidden" };
  }
}

/**
 * Popup side: acknowledge this snapshot? Only when it is for roomId, consent === "required", and
 * the popup document is visible.
 *
 * A hidden popup must not acknowledge: the ack tells main "the host can see the question", and a
 * minimised popup acknowledging would stop main from raising the one window that needs raising.
 */
export function shouldAcknowledgeConsentSnapshot(
  snapshot: BridgeConsentSnapshot | null,
  roomId: string,
  documentVisible: boolean,
): boolean {
  return (
    snapshot !== null &&
    snapshot.roomId === roomId &&
    snapshot.consent === "required" &&
    documentVisible
  );
}

/**
 * WT-900 - keeping the question in front of somebody until it is answered.
 *
 * WHAT WAS WRONG
 *   Main raised the popup once per ask. A host who then closed or minimised the popup without
 *   answering left the state "required" for the rest of the meeting: nothing raised it again, and
 *   the main-window modal never took over because a popup was "available". On a machine without a
 *   cable the far side stayed silent all meeting.
 *
 * THE LOOP
 *   Every check goes out as a snapshot, and a popup that is visibly showing the question acks it.
 *   - phase "check": the first is the ask itself; later ones are a republish every
 *     CONSENT_POPUP_RECHECK_MS for as long as the popup keeps acknowledging. Silence past the grace
 *     means the prompt is not on screen, so the popup is raised.
 *   - phase "raised": a raised popup (reopened, restored) says hello and acks on becoming visible.
 *     Silence for CONSENT_POPUP_RECHECK_MS after a raise is an unanswered raise, and it is raised
 *     again.
 *   After CONSENT_POPUP_MAX_UNANSWERED_RAISES of those in a row, or wherever no popup can be opened
 *   at all, the question moves to the main window's modal ("use-main").
 *
 * An acknowledged check costs nothing the host can see: a republish of the same state, no raise,
 * and so no OS notification over a popup they are already reading.
 *
 * TWO MORE LIMITS (popspam1002)
 *   - Never while the Meet call is off screen. WarpTalk follows Meet silently: a raise is a focus
 *     steal plus a notification, and once the host has left the call (or is looking at another tab)
 *     it lands on top of whatever they are doing instead. A due raise is held ("hold") and goes out
 *     when Meet is back on screen - if the question is still open by then.
 *   - At most CONSENT_POPUP_MAX_RAISES_PER_QUESTION raises per question, counted in
 *     `raisesThisQuestion`, which an ack does not reset.
 */
export interface ConsentRaiseState {
  consent: BrowserCaptureConsentState;
  /** `canOpenTranscriptWindow()` in a bridge room. */
  popupAvailable: boolean;
  /**
   * This room's Google Meet call is on screen (isBridgeMeetCallOnScreen). Read live, like
   * `acknowledged`: the hook refreshes it before every decision.
   */
  meetOnScreen: boolean;
  /** Raises already spent on this question, across restarts of the loop. Never reset by an ack. */
  raisesThisQuestion: number;
  phase: "check" | "raised";
  /** When the current check or raise went out. */
  sentAtMs: number;
  /** The popup has acked since `sentAtMs`. */
  acknowledged: boolean;
  /** Raises in a row that no ack followed. */
  unansweredRaises: number;
}

export type ConsentRaiseDecision =
  /** Nothing is being asked. */
  | { type: "idle" }
  /** Ask in the main window instead. Final for this ask. */
  | { type: "use-main" }
  /** Nothing to do until `atMs`. */
  | { type: "wait"; atMs: number }
  /** Republish and start a new check. */
  | { type: "check" }
  /**
   * A raise is due but the Meet call is not on screen. Nothing is raised and nothing changes; ask
   * again when Meet comes back (or at the next recheck).
   */
  | { type: "hold" }
  /** Raise the popup. */
  | { type: "raise" };

/** The state of a question that has just been asked (or whose raise loop has just restarted). */
export function initialConsentRaiseState(input: {
  consent: BrowserCaptureConsentState;
  popupAvailable: boolean;
  nowMs: number;
  /** Defaults to true: no reading is not a reading of "gone" (see isBridgeMeetCallOnScreen). */
  meetOnScreen?: boolean;
  /** Raises this question already cost before the loop (re)started. See ConsentRaiseBudget. */
  raisesThisQuestion?: number;
}): ConsentRaiseState {
  return {
    consent: input.consent,
    popupAvailable: input.popupAvailable,
    meetOnScreen: input.meetOnScreen ?? true,
    raisesThisQuestion: input.raisesThisQuestion ?? 0,
    phase: "check",
    sentAtMs: input.nowMs,
    acknowledged: false,
    unansweredRaises: 0,
  };
}

export function nextConsentRaise(
  state: ConsentRaiseState,
  nowMs: number,
  options: {
    graceMs?: number;
    recheckMs?: number;
    maxUnansweredRaises?: number;
    maxRaisesPerQuestion?: number;
  } = {},
): ConsentRaiseDecision {
  const graceMs = options.graceMs ?? CONSENT_POPUP_RAISE_GRACE_MS;
  const recheckMs = options.recheckMs ?? CONSENT_POPUP_RECHECK_MS;
  const maxUnanswered = options.maxUnansweredRaises ?? CONSENT_POPUP_MAX_UNANSWERED_RAISES;
  const maxPerQuestion = options.maxRaisesPerQuestion ?? CONSENT_POPUP_MAX_RAISES_PER_QUESTION;

  if (state.consent !== "required") return { type: "idle" };
  if (!state.popupAvailable) return { type: "use-main" };

  if (state.acknowledged) {
    // Seen. Look again later, in case it is closed or minimised in the meantime.
    const atMs = state.sentAtMs + recheckMs;
    return nowMs < atMs ? { type: "wait", atMs } : { type: "check" };
  }

  const atMs = state.sentAtMs + (state.phase === "check" ? graceMs : recheckMs);
  if (nowMs < atMs) return { type: "wait", atMs };
  // Before either budget: with Meet off screen nothing is raised, and nothing is handed over either
  // - the question is still the popup's for when the host is back in the call.
  if (!state.meetOnScreen) return { type: "hold" };
  if (state.phase === "raised" && state.unansweredRaises >= maxUnanswered) return { type: "use-main" };
  if (state.raisesThisQuestion >= maxPerQuestion) return { type: "use-main" };
  return { type: "raise" };
}

/**
 * The state after acting on a decision at `nowMs`. A check is a fresh start (an ack proved the
 * popup was seen); a raise counts against the limit until an ack follows it. `wait`, `idle` and
 * `use-main` change nothing.
 */
export function applyConsentRaise(
  state: ConsentRaiseState,
  decision: ConsentRaiseDecision,
  nowMs: number,
): ConsentRaiseState {
  switch (decision.type) {
    case "check":
      return { ...state, phase: "check", sentAtMs: nowMs, acknowledged: false, unansweredRaises: 0 };
    case "raise":
      return {
        ...state,
        phase: "raised",
        sentAtMs: nowMs,
        acknowledged: false,
        unansweredRaises: state.unansweredRaises + 1,
        raisesThisQuestion: state.raisesThisQuestion + 1,
      };
    default:
      return state;
  }
}

/**
 * Is this bridge room's Google Meet call on screen, as far as the desktop sensor can tell?
 *
 * The same test the idle reaper uses (lastSignOfLife): a sighting counts unless its code names a
 * DIFFERENT call from the room's; a code that is merely absent (picture-in-picture, a named event)
 * proves nothing either way. No reading at all - a browser tab, macOS, a desktop build without the
 * sensor, the first poll not back yet - is "unknown", and unknown keeps the old behaviour: it must
 * never be read as "Meet is gone", or those hosts would never be asked at all.
 */
export function isBridgeMeetCallOnScreen(input: {
  sensor: { meetWindowVisible: boolean; meetCode?: string } | null;
  roomMeetCode?: string;
}): boolean {
  const { sensor, roomMeetCode } = input;
  if (sensor === null) return true;
  const differentCall =
    Boolean(sensor.meetCode) && Boolean(roomMeetCode) && sensor.meetCode !== roomMeetCode;
  return sensor.meetWindowVisible && !differentCall;
}

/**
 * The raise count that has to outlive the raise loop.
 *
 * The loop is an effect, and it restarts whenever the question flickers - `consent` leaving and
 * re-entering "required" as the loopback falls back and recovers, or the popup's availability
 * moving. Each restart used to start from zero, so a question nobody answered could be raised
 * without end across restarts. This is held per room by the hook, spent by every raise, and given
 * back only when the question is really over: answered (granted or declined), or another room.
 */
export interface ConsentRaiseBudget {
  roomId: string;
  raises: number;
}

/** What is left of `budget` for `roomId` while the consent state is `consent`. */
export function consentRaiseBudgetFor(
  budget: ConsentRaiseBudget | null,
  roomId: string,
  consent: BrowserCaptureConsentState,
): ConsentRaiseBudget {
  // An answer closes the question; "reconsider" after it is a new one with a full budget.
  // "not-required" does NOT: that is the question going quiet (a fallback, a device), not answered.
  if (!budget || budget.roomId !== roomId || consent === "granted" || consent === "declined") {
    return { roomId, raises: 0 };
  }
  return budget;
}
