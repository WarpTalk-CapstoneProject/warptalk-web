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

/** Every message carries it, so a desktop build running an older popup is ignored, not misread. */
export const BRIDGE_CONSENT_PROTOCOL_VERSION = 1;

/** How long the main window waits for the popup to acknowledge a "required" snapshot before raising it. */
export const CONSENT_POPUP_RAISE_GRACE_MS = 1500;

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
        return {
          v,
          kind: "snapshot",
          roomId,
          consent: consent as BrowserCaptureConsentState,
          sources,
          selectedSourceId,
          loadingSources: data.loadingSources,
        };
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
}): BridgeConsentSnapshot {
  return {
    v: BRIDGE_CONSENT_PROTOCOL_VERSION,
    kind: "snapshot",
    roomId: input.roomId,
    consent: input.consent,
    sources: input.sources.map((source) => ({ id: source.id, name: source.name })),
    selectedSourceId: input.selectedSourceId,
    loadingSources: input.loadingSources,
  };
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
    }
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
